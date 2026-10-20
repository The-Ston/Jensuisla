import type {
  DiscordApi,
  DiscordChannel,
  DiscordMessage,
  FileUpload,
  GuildEmoji,
  GuildMember,
  MessageBody,
  PermissionOverwrite,
} from '../src/discord/api';

/** In-memory stand-in for the Discord REST API. */
export class FakeDiscord implements DiscordApi {
  channels: (DiscordChannel & { overwrites?: PermissionOverwrite[] })[] = [];
  messages = new Map<string, DiscordMessage[]>();
  members: GuildMember[] = [];
  emojis: GuildEmoji[] = [];
  calls = 0;
  private nextId = 1000n;

  private id(): string {
    return (this.nextId++).toString();
  }

  async listGuildChannels() {
    this.calls++;
    return this.channels.map((c) => ({ ...c }));
  }

  async createGuildChannel(
    _guildId: string,
    body: { name: string; type: number; parent_id?: string; permission_overwrites?: PermissionOverwrite[] },
  ) {
    this.calls++;
    const channel = { id: this.id(), type: body.type, name: body.name, parent_id: body.parent_id ?? null, overwrites: body.permission_overwrites };
    this.channels.push(channel);
    this.messages.set(channel.id, []);
    return channel;
  }

  async listMessages(channelId: string, before?: string) {
    this.calls++;
    const all = [...(this.messages.get(channelId) ?? [])].reverse(); // newest first
    const start = before ? all.findIndex((m) => m.id === before) + 1 : 0;
    return all.slice(start, start + 100).map((m) => ({ ...m }));
  }

  async getMessage(channelId: string, messageId: string) {
    this.calls++;
    const msg = this.messages.get(channelId)?.find((m) => m.id === messageId);
    if (!msg) throw new Error('unknown message');
    return { ...msg };
  }

  async createMessage(channelId: string, body: MessageBody, file?: FileUpload) {
    this.calls++;
    const msg: DiscordMessage = {
      id: this.id(),
      content: body.content ?? '',
      attachments: file ? [{ id: this.id(), filename: file.name, url: `https://cdn.discordapp.com/attachments/${file.name}` }] : [],
    };
    if (!this.messages.has(channelId)) this.messages.set(channelId, []);
    this.messages.get(channelId)!.push(msg);
    return { ...msg };
  }

  async editMessage(channelId: string, messageId: string, body: MessageBody) {
    this.calls++;
    const msg = this.messages.get(channelId)?.find((m) => m.id === messageId);
    if (!msg) throw new Error('unknown message');
    msg.content = body.content ?? msg.content;
    return { ...msg };
  }

  async deleteMessage(channelId: string, messageId: string) {
    this.calls++;
    const list = this.messages.get(channelId) ?? [];
    this.messages.set(channelId, list.filter((m) => m.id !== messageId));
  }

  async listGuildMembers() {
    this.calls++;
    return this.members;
  }

  async listGuildEmojis() {
    this.calls++;
    return this.emojis;
  }

  async createDm(userId: string) {
    this.calls++;
    return { id: `dm-${userId}`, type: 1 };
  }
}
