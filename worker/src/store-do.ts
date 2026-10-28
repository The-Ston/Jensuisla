import { DurableObject } from 'cloudflare:workers';
import type { CreateReadingInput } from './api-types';
import { avatarUrl, proxied } from './discord/cdn';
import { ensureLaunchSetup, OPEN_BUTTON } from './discord/launch';
import { DiscordRest, fetchOAuthUser } from './discord/rest';
import type { Accent, CommentColor, Gif, NotifyPref, ProgressUnit, Theme } from './domain/types';
import type { Env } from './env';
import { buildNotifications, type NotifyEvent } from './service/notifications';
import { DEFAULT_NOTIFY, HttpError, Service, type EmojiInfo, type MemberInfo } from './service/service';
import { signPhotoLink } from './photo-links';
import { RecordTooLargeError } from './store/codec';
import { DataStore } from './store/data-store';

const MEMBERS_TTL_MS = 5 * 60_000;
const TOKEN_TTL_MS = 10 * 60_000;
/** Notifications are batched so a burst of reactions becomes one message. */
const NOTIFY_DELAY_MS = 2 * 60_000;

export type Op =
  | { op: 'home' }
  | { op: 'members' }
  | { op: 'create'; input: CreateReadingInput }
  | { op: 'view'; readingId: string }
  | { op: 'join'; readingId: string }
  | { op: 'invite'; readingId: string; userIds: string[] }
  | { op: 'progress'; readingId: string; value: number; editionTotal: number | null; unit: ProgressUnit | null }
  | { op: 'undo'; readingId: string }
  | { op: 'visited'; readingId: string }
  | { op: 'spoilers'; readingId: string; on: boolean }
  | { op: 'autoAdvance'; readingId: string; on: boolean }
  | {
      op: 'comment';
      readingId: string;
      position: number;
      text: string;
      gif: Gif | null;
      replyTo: string | null;
      photos: string[];
    }
  | { op: 'editComment'; readingId: string; commentId: string; text: string; gif?: Gif | null; photos?: string[] }
  | {
      op: 'uploadPhoto';
      readingId: string;
      data: ArrayBuffer;
      contentType: string;
      width: number;
      height: number;
    }
  | { op: 'discardPhoto'; readingId: string; photoId: string }
  | { op: 'deleteComment'; readingId: string; commentId: string }
  | { op: 'react'; readingId: string; commentId: string; emoji: string }
  | { op: 'notify'; pref: NotifyPref }
  | { op: 'appearance'; theme: Theme; accent: Accent | null }
  | { op: 'commentColor'; color: CommentColor | null }
  | { op: 'emojis' }
  | { op: 'favorites' }
  | { op: 'toggleFavorite'; gifId: string };

export type OpResult = { ok: true; data: unknown } | { ok: false; status: number; error: string };

/**
 * Single instance holding the in-memory copy of all data. Every operation runs in a queue,
 * so concurrent writes (two reactions at once…) never overwrite each other in Discord.
 * Nothing is kept in Durable Object storage: Discord is the only source of truth.
 */
export class JensuislaStore extends DurableObject<Env> {
  private readonly api: DiscordRest;
  private service: Promise<Service> | null = null;
  private store: DataStore | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private members: { at: number; map: Map<string, MemberInfo> } | null = null;
  private emojis: { at: number; map: Map<string, EmojiInfo> } | null = null;
  private tokens = new Map<string, { userId: string; at: number }>();
  private dmChannels = new Map<string, string>();
  private pending: NotifyEvent[] = [];
  /** Edits being sent to Discord, outside of the request queue. */
  private flushing: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.api = new DiscordRest(env.DISCORD_BOT_TOKEN);
    // Once per start: a failure is logged and retried at the next one.
    void ensureLaunchSetup(this.api, env).catch((err) => console.error('launch setup failed', err));
  }

  private getService(): Promise<Service> {
    this.service ??= DataStore.load(this.api, {
      guildId: this.env.DISCORD_GUILD_ID,
      botUserId: this.env.DISCORD_APPLICATION_ID,
      onPendingEdits: () => this.flushEdits(),
    })
      .then((store) => {
        this.store = store;
        return new Service({
          store,
          members: () => this.getMembers(),
          emojis: () => this.getEmojis(),
          signPhoto: (readingId, photoId) => signPhotoLink(this.env.DISCORD_CLIENT_SECRET, readingId, photoId),
          onEvent: (e) => this.enqueueNotification(e),
        });
      })
      .catch((err) => {
        this.service = null;
        throw err;
      });
    return this.service;
  }

  /**
   * Sends waiting edits to Discord after the request answered, so users never wait for Discord's
   * rate limits. Edits made meanwhile join the same run; a single run at a time keeps their order.
   */
  private flushEdits() {
    if (this.flushing || !this.store) return;
    const store = this.store;
    this.flushing = store
      .flush()
      .catch((err) => console.error('flush failed', err))
      .finally(() => {
        this.flushing = null;
        if (store.hasPendingEdits) this.flushEdits();
      });
    this.ctx.waitUntil(this.flushing);
  }

  private async getMembers(): Promise<Map<string, MemberInfo>> {
    if (this.members && Date.now() - this.members.at < MEMBERS_TTL_MS) return this.members.map;
    const list = await this.api.listGuildMembers(this.env.DISCORD_GUILD_ID);
    const map = new Map<string, MemberInfo>();
    for (const m of list) {
      if (m.user.bot) continue;
      map.set(m.user.id, {
        id: m.user.id,
        name: m.nick ?? m.user.global_name ?? m.user.username,
        avatarUrl: proxied(avatarUrl(m.user)),
        isOrganizer: m.roles.includes(this.env.ORGANIZER_ROLE_ID),
      });
    }
    this.members = { at: Date.now(), map };
    return map;
  }

  private async getEmojis(): Promise<Map<string, EmojiInfo>> {
    if (this.emojis && Date.now() - this.emojis.at < MEMBERS_TTL_MS) return this.emojis.map;
    const list = await this.api.listGuildEmojis(this.env.DISCORD_GUILD_ID);
    const map = new Map<string, EmojiInfo>();
    for (const e of list) {
      if (e.available === false) continue;
      map.set(e.id, { id: e.id, name: e.name, animated: !!e.animated });
    }
    this.emojis = { at: Date.now(), map };
    return map;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Maps an Activity OAuth access token to a Discord user id. */
  async authenticate(accessToken: string): Promise<string | null> {
    const cached = this.tokens.get(accessToken);
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.userId;
    const user = await fetchOAuthUser(accessToken);
    if (!user) return null;
    this.tokens.set(accessToken, { userId: user.id, at: Date.now() });
    return user.id;
  }

  async run(userId: string, op: Op): Promise<OpResult> {
    return this.exclusive(async () => {
      try {
        return { ok: true, data: await this.dispatch(await this.getService(), userId, op) };
      } catch (err) {
        if (err instanceof HttpError) return { ok: false, status: err.status, error: err.message };
        if (err instanceof RecordTooLargeError)
          return { ok: false, status: 400, error: 'Trop long pour être enregistré : raccourcis le message' };
        console.error('operation failed', op.op, err);
        return { ok: false, status: 502, error: 'Erreur en parlant à Discord, réessaie dans un instant' };
      }
    });
  }

  private async dispatch(s: Service, userId: string, op: Op): Promise<unknown> {
    switch (op.op) {
      case 'home':
        return s.home(userId);
      case 'members':
        return s.listMembers();
      case 'create':
        return s.createReading(userId, op.input);
      case 'view':
        return s.readingView(userId, op.readingId);
      case 'join':
        await s.join(userId, op.readingId);
        break;
      case 'invite':
        await s.invite(userId, op.readingId, op.userIds);
        break;
      case 'progress':
        await s.setProgress(userId, op.readingId, op.value, op.editionTotal, op.unit);
        break;
      case 'undo':
        await s.undoProgress(userId, op.readingId);
        break;
      case 'visited':
        await s.markVisited(userId, op.readingId);
        return null;
      case 'spoilers':
        await s.setSpoilers(userId, op.readingId, op.on);
        break;
      case 'autoAdvance':
        await s.setAutoAdvance(userId, op.readingId, op.on);
        break;
      case 'comment':
        await s.addComment(userId, op.readingId, op);
        break;
      case 'editComment':
        await s.editComment(userId, op.readingId, op.commentId, op.text, op.gif, op.photos);
        break;
      case 'uploadPhoto':
        return s.uploadPhoto(
          userId,
          op.readingId,
          { data: new Uint8Array(op.data), contentType: op.contentType },
          op.width,
          op.height,
        );
      case 'discardPhoto':
        await s.discardPhoto(userId, op.readingId, op.photoId);
        return null;
      case 'deleteComment':
        await s.deleteComment(userId, op.readingId, op.commentId);
        break;
      case 'react':
        await s.toggleReaction(userId, op.readingId, op.commentId, op.emoji);
        break;
      case 'notify':
        await s.setNotify(userId, op.pref);
        return null;
      case 'appearance':
        await s.setAppearance(userId, op.theme, op.accent);
        return null;
      case 'commentColor':
        await s.setCommentColor(userId, op.color);
        return null;
      case 'emojis':
        return s.listEmojis();
      case 'favorites':
        return s.favoriteGifs(userId);
      case 'toggleFavorite':
        return s.toggleFavoriteGif(userId, op.gifId);
    }
    // Mutations on a reading answer with the refreshed view.
    if (!('readingId' in op)) return null;
    return s.readingView(userId, op.readingId);
  }

  /** Where to fetch a reading's cover from, or null if it has none. */
  async coverSource(readingId: string): Promise<string | null> {
    return this.exclusive(async () => {
      await this.getService();
      const reading = this.store?.readings.get(readingId)?.reading;
      if (!reading?.cover) return null;
      if (reading.cover.kind === 'url') return reading.cover.url;
      return this.store!.coverAttachmentUrl(readingId);
    });
  }

  /** Where to fetch a photo file from (its link was already verified by the Worker). */
  async photoSource(readingId: string, photoId: string): Promise<{ url: string; contentType: string } | null> {
    return this.exclusive(async () => {
      await this.getService();
      const photo = this.store?.readings.get(readingId)?.photos.get(photoId);
      if (!photo) return null;
      const url = await this.store!.photoAttachmentUrl(readingId, photoId);
      return url ? { url, contentType: photo.contentType } : null;
    });
  }

  private enqueueNotification(event: NotifyEvent) {
    this.pending.push(event);
    void this.ctx.storage.getAlarm().then((alarm) => {
      if (alarm === null) return this.ctx.storage.setAlarm(Date.now() + NOTIFY_DELAY_MS);
    });
  }

  async alarm(): Promise<void> {
    await this.exclusive(async () => {
      const events = this.pending.splice(0);
      if (events.length === 0 || !this.store) return;
      const members = await this.getMembers();
      const store = this.store;
      const messages = buildNotifications(
        events,
        store,
        (id) => members.get(id)?.name ?? 'Quelqu’un',
        (id) => store.users.get(id)?.value.notify ?? DEFAULT_NOTIFY,
      );
      for (const m of messages) {
        try {
          if (m.kind === 'dm') {
            let channelId = this.dmChannels.get(m.userId);
            if (!channelId) {
              channelId = (await this.api.createDm(m.userId)).id;
              this.dmChannels.set(m.userId, channelId);
            }
            await this.api.createMessage(channelId, {
              content: m.content,
              allowed_mentions: { parse: [] },
              components: OPEN_BUTTON,
            });
          } else {
            await this.api.createMessage(this.env.LAUNCH_CHANNEL_ID, {
              content: m.content,
              allowed_mentions: { users: m.mentionIds },
              components: OPEN_BUTTON,
            });
          }
        } catch (err) {
          // A user may have closed their DMs: skip them rather than failing the batch.
          console.warn('notification failed', m.kind, err);
        }
      }
    });
  }
}
