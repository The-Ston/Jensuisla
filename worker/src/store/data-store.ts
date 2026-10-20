import { ChannelType, Permission, type DiscordApi, type FileUpload, type PermissionOverwrite } from '../discord/api';
import type { Comment, Participant, Reading, UserPrefs } from '../domain/types';
import { decode, encode } from './codec';

export const CATEGORY_NAME = 'jensuisla-data';
export const USERS_CHANNEL_NAME = 'jsl-users';
export const READING_CHANNEL_PREFIX = 'jsl-r-';

export interface Stored<T> {
  value: T;
  messageId: string;
}

export interface ReadingEntry {
  reading: Reading;
  messageId: string;
  participants: Map<string, Stored<Participant>>;
  comments: Map<string, Comment>;
}

export interface StoreConfig {
  guildId: string;
  botUserId: string;
}

function slug(text: string): string {
  const s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'lecture';
}

/**
 * In-memory copy of all Jensuisla data, persisted as bot messages in hidden Discord channels:
 * a private category with one channel for user preferences and one channel per reading.
 * Not concurrency-safe on its own: callers must serialize writes.
 */
export class DataStore {
  readonly readings = new Map<string, ReadingEntry>();
  readonly users = new Map<string, Stored<UserPrefs>>();

  private constructor(
    private readonly api: DiscordApi,
    private readonly config: StoreConfig,
    private readonly categoryId: string,
    private readonly usersChannelId: string,
  ) {}

  /** Only the bot can see the data channels. */
  private overwrites(): PermissionOverwrite[] {
    const botAllow =
      Permission.ViewChannel |
      Permission.SendMessages |
      Permission.ReadMessageHistory |
      Permission.AttachFiles |
      Permission.EmbedLinks;
    return [
      { id: this.config.guildId, type: 0, deny: Permission.ViewChannel.toString() },
      { id: this.config.botUserId, type: 1, allow: botAllow.toString() },
    ];
  }

  static async load(api: DiscordApi, config: StoreConfig): Promise<DataStore> {
    const channels = await api.listGuildChannels(config.guildId);
    const bootstrap = new DataStore(api, config, '', '');

    let category = channels.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME);
    category ??= await api.createGuildChannel(config.guildId, {
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permission_overwrites: bootstrap.overwrites(),
    });
    const children = channels.filter((c) => c.type === ChannelType.GuildText && c.parent_id === category.id);

    let usersChannel = children.find((c) => c.name === USERS_CHANNEL_NAME);
    usersChannel ??= await api.createGuildChannel(config.guildId, {
      name: USERS_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent_id: category.id,
      permission_overwrites: bootstrap.overwrites(),
    });

    const store = new DataStore(api, config, category.id, usersChannel.id);
    const readingChannels = children.filter((c) => c.name?.startsWith(READING_CHANNEL_PREFIX));
    await Promise.all([store.loadUsers(), ...readingChannels.map((c) => store.loadReading(c.id))]);
    return store;
  }

  private async allMessages(channelId: string) {
    const out = [];
    let before: string | undefined;
    for (;;) {
      const page = await this.api.listMessages(channelId, before);
      out.push(...page);
      if (page.length < 100) break;
      before = page[page.length - 1]!.id;
    }
    // Oldest first, so later records win if a duplicate ever exists.
    return out.reverse();
  }

  private async loadUsers() {
    for (const msg of await this.allMessages(this.usersChannelId)) {
      const rec = decode(msg.content);
      if (rec?.t === 'user') this.users.set(rec.v.userId, { value: rec.v, messageId: msg.id });
    }
  }

  private async loadReading(channelId: string) {
    let entry: ReadingEntry | undefined;
    const participants = new Map<string, Stored<Participant>>();
    const comments = new Map<string, Comment>();
    for (const msg of await this.allMessages(channelId)) {
      const rec = decode(msg.content);
      if (!rec) continue;
      if (rec.t === 'reading') entry = { reading: { ...rec.v, id: channelId }, messageId: msg.id, participants, comments };
      else if (rec.t === 'participant') participants.set(rec.v.userId, { value: rec.v, messageId: msg.id });
      else if (rec.t === 'comment') comments.set(msg.id, { ...rec.v, id: msg.id });
    }
    if (entry) this.readings.set(channelId, entry);
  }

  async createReading(data: Omit<Reading, 'id'>, cover?: FileUpload): Promise<ReadingEntry> {
    const channel = await this.api.createGuildChannel(this.config.guildId, {
      name: READING_CHANNEL_PREFIX + slug(data.title),
      type: ChannelType.GuildText,
      parent_id: this.categoryId,
      permission_overwrites: this.overwrites(),
    });
    const msg = await this.api.createMessage(channel.id, { content: encode({ t: 'reading', v: data }) }, cover);
    const entry: ReadingEntry = {
      reading: { ...data, id: channel.id },
      messageId: msg.id,
      participants: new Map(),
      comments: new Map(),
    };
    this.readings.set(channel.id, entry);
    return entry;
  }

  /** Fresh URL of the uploaded cover (Discord attachment URLs expire). */
  async coverAttachmentUrl(readingId: string): Promise<string | null> {
    const entry = this.readings.get(readingId);
    if (!entry) return null;
    const msg = await this.api.getMessage(readingId, entry.messageId);
    return msg.attachments[0]?.url ?? null;
  }

  async saveParticipant(readingId: string, participant: Participant): Promise<void> {
    const entry = this.mustGet(readingId);
    const content = encode({ t: 'participant', v: participant });
    const existing = entry.participants.get(participant.userId);
    if (existing) {
      await this.api.editMessage(readingId, existing.messageId, { content });
      existing.value = participant;
    } else {
      const msg = await this.api.createMessage(readingId, { content });
      entry.participants.set(participant.userId, { value: participant, messageId: msg.id });
    }
  }

  async createComment(readingId: string, data: Omit<Comment, 'id'>): Promise<Comment> {
    const entry = this.mustGet(readingId);
    const msg = await this.api.createMessage(readingId, { content: encode({ t: 'comment', v: data }) });
    const comment = { ...data, id: msg.id };
    entry.comments.set(msg.id, comment);
    return comment;
  }

  async saveComment(readingId: string, comment: Comment): Promise<void> {
    const entry = this.mustGet(readingId);
    const { id, ...data } = comment;
    await this.api.editMessage(readingId, id, { content: encode({ t: 'comment', v: data }) });
    entry.comments.set(id, comment);
  }

  async deleteComment(readingId: string, commentId: string): Promise<void> {
    const entry = this.mustGet(readingId);
    await this.api.deleteMessage(readingId, commentId);
    entry.comments.delete(commentId);
  }

  async saveUserPrefs(prefs: UserPrefs): Promise<void> {
    const content = encode({ t: 'user', v: prefs });
    const existing = this.users.get(prefs.userId);
    if (existing) {
      await this.api.editMessage(this.usersChannelId, existing.messageId, { content });
      existing.value = prefs;
    } else {
      const msg = await this.api.createMessage(this.usersChannelId, { content });
      this.users.set(prefs.userId, { value: prefs, messageId: msg.id });
    }
  }

  private mustGet(readingId: string): ReadingEntry {
    const entry = this.readings.get(readingId);
    if (!entry) throw new Error(`unknown reading ${readingId}`);
    return entry;
  }
}
