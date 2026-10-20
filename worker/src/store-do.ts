import { DurableObject } from 'cloudflare:workers';
import type { CreateReadingInput } from './api-types';
import { avatarUrl, proxied } from './discord/cdn';
import { DiscordRest, fetchOAuthUser } from './discord/rest';
import type { Gif, NotifyPref } from './domain/types';
import type { Env } from './env';
import { buildNotifications, type NotifyEvent } from './service/notifications';
import { DEFAULT_NOTIFY, HttpError, Service, type MemberInfo } from './service/service';
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
  | { op: 'progress'; readingId: string; value: number; editionTotal: number | null }
  | { op: 'undo'; readingId: string }
  | { op: 'visited'; readingId: string }
  | { op: 'comment'; readingId: string; position: number; text: string; gif: Gif | null }
  | { op: 'editComment'; readingId: string; commentId: string; text: string; gif?: Gif | null }
  | { op: 'deleteComment'; readingId: string; commentId: string }
  | { op: 'react'; readingId: string; commentId: string; emoji: string }
  | { op: 'notify'; pref: NotifyPref };

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
  private tokens = new Map<string, { userId: string; at: number }>();
  private dmChannels = new Map<string, string>();
  private pending: NotifyEvent[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.api = new DiscordRest(env.DISCORD_BOT_TOKEN);
  }

  private getService(): Promise<Service> {
    this.service ??= DataStore.load(this.api, {
      guildId: this.env.DISCORD_GUILD_ID,
      botUserId: this.env.DISCORD_APPLICATION_ID,
    })
      .then((store) => {
        this.store = store;
        return new Service({
          store,
          members: () => this.getMembers(),
          onEvent: (e) => this.enqueueNotification(e),
        });
      })
      .catch((err) => {
        this.service = null;
        throw err;
      });
    return this.service;
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
        await s.setProgress(userId, op.readingId, op.value, op.editionTotal);
        break;
      case 'undo':
        await s.undoProgress(userId, op.readingId);
        break;
      case 'visited':
        await s.markVisited(userId, op.readingId);
        return null;
      case 'comment':
        await s.addComment(userId, op.readingId, op);
        break;
      case 'editComment':
        await s.editComment(userId, op.readingId, op.commentId, op.text, op.gif);
        break;
      case 'deleteComment':
        await s.deleteComment(userId, op.readingId, op.commentId);
        break;
      case 'react':
        await s.toggleReaction(userId, op.readingId, op.commentId, op.emoji);
        break;
      case 'notify':
        await s.setNotify(userId, op.pref);
        return null;
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
      const openButton = [
        { type: 1, components: [{ type: 2, style: 1, label: 'Ouvrir Jensuisla', custom_id: 'jsl:launch' }] },
      ];
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
              components: openButton,
            });
          } else {
            await this.api.createMessage(this.env.LAUNCH_CHANNEL_ID, {
              content: m.content,
              allowed_mentions: { users: m.mentionIds },
              components: openButton,
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
