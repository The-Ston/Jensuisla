import type {
  CreateReadingInput,
  CustomEmojiView,
  HomeView,
  MemberView,
  ReadingSummary,
  ReadingView,
} from '../api-types';
import type { FileUpload } from '../discord/api';
import { canSee, canWriteAt, visibleComments } from '../domain/access';
import {
  MAX_AUTHOR_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_COVER_BYTES,
  MAX_FAVORITE_GIFS,
  MAX_TITLE_LENGTH,
  MAX_TOTAL,
} from '../domain/limits';
import { customKey, isStandardEmoji, MAX_REACTION_KINDS, parseCustomKey } from '../domain/reactions';
import { emojiUrl, proxied } from '../discord/cdn';
import { applyProgress, clampPosition, newParticipant, toReference, undoProgress } from '../domain/progress';
import type { Comment, Gif, JoinMode, NotifyPref, Participant, ProgressUnit, UserPrefs } from '../domain/types';
import { gifFromId, GIPHY_ID } from '../gifs';
import type { DataStore, ReadingEntry } from '../store/data-store';
import type { NotifyEvent } from './notifications';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface MemberInfo extends MemberView {
  isOrganizer: boolean;
}

export interface EmojiInfo {
  id: string;
  name: string;
  animated: boolean;
}

export interface ServiceDeps {
  store: DataStore;
  members: () => Promise<Map<string, MemberInfo>>;
  /** Emojis of the Discord server, by id. */
  emojis: () => Promise<Map<string, EmojiInfo>>;
  onEvent: (event: NotifyEvent) => void;
  now?: () => number;
}

const UNITS: ProgressUnit[] = ['chapter', 'page', 'percent'];
const JOIN_MODES: JoinMode[] = ['invite', 'open', 'both'];
const NOTIFY_PREFS: NotifyPref[] = ['dm', 'channel', 'none'];
export const DEFAULT_NOTIFY: NotifyPref = 'dm';
const GIF_HOST = /^https:\/\/(media\d*|i)\.giphy\.com\//;

function fallbackMember(id: string): MemberView {
  return { id, name: 'Ancien membre', avatarUrl: '' };
}

/** Business rules of Jensuisla. Callers must serialize calls that write. */
export class Service {
  private readonly now: () => number;

  constructor(private readonly deps: ServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  private get store() {
    return this.deps.store;
  }

  private entry(readingId: string): ReadingEntry {
    const entry = this.store.readings.get(readingId);
    if (!entry) throw new HttpError(404, 'Lecture introuvable');
    return entry;
  }

  private participant(entry: ReadingEntry, userId: string): Participant {
    const p = entry.participants.get(userId)?.value;
    if (!p) throw new HttpError(403, "Tu ne participes pas à cette lecture");
    return p;
  }

  private notifyPref(userId: string): NotifyPref {
    return this.store.users.get(userId)?.value.notify ?? DEFAULT_NOTIFY;
  }

  private summary(entry: ReadingEntry, userId: string): ReadingSummary {
    const r = entry.reading;
    const me = entry.participants.get(userId)?.value;
    return {
      id: r.id,
      title: r.title,
      author: r.author,
      coverUrl: r.cover ? `/api/cover/${r.id}?v=${r.createdAt}` : null,
      unit: r.unit,
      total: r.total,
      joinMode: r.joinMode,
      organizerId: r.organizerId,
      participantCount: entry.participants.size,
      isParticipant: !!me,
      canJoin: !me && r.joinMode !== 'invite',
      canInvite: r.organizerId === userId && r.joinMode !== 'open',
      myProgress: me?.progress ?? null,
    };
  }

  async home(userId: string): Promise<HomeView> {
    const members = await this.deps.members();
    const me = members.get(userId);
    if (!me) throw new HttpError(403, "Tu n'es pas membre du serveur");
    const readings = [...this.store.readings.values()]
      .filter((e) => e.participants.has(userId) || e.reading.joinMode !== 'invite')
      .sort((a, b) => b.reading.createdAt - a.reading.createdAt)
      .map((e) => this.summary(e, userId));
    const { isOrganizer, ...view } = me;
    return { me: { ...view, isOrganizer, notify: this.notifyPref(userId) }, readings };
  }

  async listMembers(): Promise<MemberView[]> {
    const members = await this.deps.members();
    return [...members.values()].map(({ isOrganizer: _, ...m }) => m).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createReading(userId: string, input: CreateReadingInput): Promise<ReadingSummary> {
    const members = await this.deps.members();
    if (!members.get(userId)?.isOrganizer) throw new HttpError(403, 'Seul un Organisateur peut créer une lecture');

    const title = input.title?.trim() ?? '';
    const author = input.author?.trim() ?? '';
    if (!title || title.length > MAX_TITLE_LENGTH) throw new HttpError(400, 'Titre invalide');
    if (author.length > MAX_AUTHOR_LENGTH) throw new HttpError(400, 'Auteur trop long');
    if (!UNITS.includes(input.unit)) throw new HttpError(400, "Type d'avancement invalide");
    if (!JOIN_MODES.includes(input.joinMode)) throw new HttpError(400, 'Mode pour rejoindre invalide');
    const total = input.unit === 'percent' ? 100 : input.total;
    if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL) throw new HttpError(400, 'Total invalide');

    let file: FileUpload | undefined;
    if (input.coverData) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(input.coverData.contentType)) throw new HttpError(400, 'Image invalide');
      const data = Uint8Array.from(atob(input.coverData.base64), (c) => c.charCodeAt(0));
      if (data.byteLength > MAX_COVER_BYTES) throw new HttpError(400, 'Image trop lourde (2 Mo max)');
      file = { name: `cover.${input.coverData.contentType.split('/')[1]}`, contentType: input.coverData.contentType, data };
    }
    const coverUrl = input.coverUrl && /^https:\/\/covers\.openlibrary\.org\//.test(input.coverUrl) ? input.coverUrl : null;

    const entry = await this.store.createReading(
      {
        title,
        author,
        cover: file ? { kind: 'attachment' } : coverUrl ? { kind: 'url', url: coverUrl } : null,
        unit: input.unit,
        total,
        joinMode: input.joinMode,
        organizerId: userId,
        createdAt: this.now(),
      },
      file,
    );

    await this.store.saveParticipant(entry.reading.id, newParticipant(userId));
    if (input.joinMode !== 'open') await this.addParticipants(entry, input.invitedIds ?? [], members);
    return this.summary(entry, userId);
  }

  private async addParticipants(entry: ReadingEntry, userIds: string[], members: Map<string, MemberInfo>) {
    for (const id of new Set(userIds)) {
      if (!members.has(id) || entry.participants.has(id)) continue;
      await this.store.saveParticipant(entry.reading.id, newParticipant(id));
    }
  }

  async readingView(userId: string, readingId: string): Promise<ReadingView> {
    const entry = this.entry(readingId);
    const me = entry.participants.get(userId)?.value ?? null;
    if (!me && entry.reading.joinMode === 'invite') throw new HttpError(403, 'Lecture sur invitation');

    // Non-participants only see the summary and who is reading, never comments.
    const comments = me ? visibleComments(entry.comments.values(), me.progress) : [];
    const memberIds = new Set<string>([...entry.participants.keys(), entry.reading.organizerId]);
    for (const c of comments) {
      memberIds.add(c.authorId);
      for (const ids of Object.values(c.reactions)) ids.forEach((id) => memberIds.add(id));
    }
    const all = await this.deps.members();
    const members: Record<string, MemberView> = {};
    for (const id of memberIds) {
      const m = all.get(id);
      members[id] = m ? { id: m.id, name: m.name, avatarUrl: m.avatarUrl } : fallbackMember(id);
    }

    return {
      viewerId: userId,
      reading: this.summary(entry, userId),
      participants: [...entry.participants.values()].map(({ value }) => ({ userId: value.userId, progress: value.progress })),
      me: me && {
        progress: me.progress,
        editionTotal: me.editionTotal,
        canUndo: me.history.length > 0,
        lastVisit: me.lastVisit,
      },
      comments,
      members,
    };
  }

  async join(userId: string, readingId: string): Promise<void> {
    const entry = this.entry(readingId);
    if (entry.participants.has(userId)) return;
    if (entry.reading.joinMode === 'invite') throw new HttpError(403, 'Lecture sur invitation');
    await this.store.saveParticipant(readingId, newParticipant(userId));
  }

  async invite(userId: string, readingId: string, userIds: string[]): Promise<void> {
    const entry = this.entry(readingId);
    if (entry.reading.organizerId !== userId) throw new HttpError(403, "Seul l'organisateur peut inviter");
    if (entry.reading.joinMode === 'open') throw new HttpError(400, 'Cette lecture est en inscription libre');
    await this.addParticipants(entry, userIds, await this.deps.members());
  }

  /** `value` is expressed in the reader's own edition when `editionTotal` is given (page unit only). */
  async setProgress(userId: string, readingId: string, value: number, editionTotal: number | null): Promise<void> {
    const entry = this.entry(readingId);
    const current = this.participant(entry, userId);
    const r = entry.reading;
    let edition: number | null = null;
    if (r.unit === 'page' && editionTotal !== null && editionTotal !== r.total) {
      if (!Number.isInteger(editionTotal) || editionTotal < 1 || editionTotal > MAX_TOTAL)
        throw new HttpError(400, 'Nombre de pages invalide');
      edition = editionTotal;
    }
    if (!Number.isFinite(value)) throw new HttpError(400, 'Avancement invalide');
    const reference = clampPosition(r, toReference(value, edition, r.total));
    const next = { ...applyProgress(current, reference), editionTotal: edition };
    await this.store.saveParticipant(readingId, next);
  }

  async undoProgress(userId: string, readingId: string): Promise<void> {
    const entry = this.entry(readingId);
    const previous = undoProgress(this.participant(entry, userId));
    if (!previous) throw new HttpError(400, 'Rien à annuler');
    await this.store.saveParticipant(readingId, previous);
  }

  async markVisited(userId: string, readingId: string): Promise<void> {
    const entry = this.entry(readingId);
    const p = this.participant(entry, userId);
    await this.store.saveParticipant(readingId, { ...p, lastVisit: { at: this.now(), progress: p.progress } });
  }

  async addComment(
    userId: string,
    readingId: string,
    input: { position: number; text: string; gif: Gif | null; replyTo?: string | null },
  ): Promise<Comment> {
    const entry = this.entry(readingId);
    const me = this.participant(entry, userId);
    if (!canWriteAt(entry.reading, input.position, me.progress))
      throw new HttpError(400, 'Tu ne peux commenter que ce que tu as déjà lu');
    const text = (input.text ?? '').trim();
    const gif = this.validGif(input.gif);
    if (!text && !gif) throw new HttpError(400, 'Commentaire vide');
    if (text.length > MAX_COMMENT_LENGTH) throw new HttpError(400, 'Commentaire trop long');

    // A reply quotes its original: placing it earlier would reveal the original to readers
    // who have not reached it yet.
    const original = input.replyTo ? this.visibleComment(entry, userId, input.replyTo) : null;
    if (original && input.position < original.position)
      throw new HttpError(400, 'Une réponse ne peut pas être placée avant le message d’origine');

    const comment = await this.store.createComment(readingId, {
      authorId: userId,
      position: input.position,
      text,
      gif,
      reactions: {},
      replyTo: original?.id ?? null,
      createdAt: this.now(),
      editedAt: null,
    });
    this.deps.onEvent({
      readingId,
      kind: original ? 'reply' : gif && !text ? 'gif' : 'comment',
      actorId: userId,
      position: comment.position,
      excerpt: text.slice(0, 120),
      targetAuthorId: original?.authorId,
    });
    return comment;
  }

  private validGif(gif: Gif | null): Gif | null {
    if (!gif) return null;
    if (typeof gif.url !== 'string' || !GIF_HOST.test(gif.url) || !GIF_HOST.test(gif.previewUrl ?? ''))
      throw new HttpError(400, 'GIF invalide');
    return {
      id: String(gif.id).slice(0, 64),
      url: gif.url,
      previewUrl: gif.previewUrl,
      width: Number(gif.width) || 0,
      height: Number(gif.height) || 0,
      title: String(gif.title ?? '').slice(0, 100),
    };
  }

  private visibleComment(entry: ReadingEntry, userId: string, commentId: string) {
    const me = this.participant(entry, userId);
    const comment = entry.comments.get(commentId);
    if (!comment || !canSee(comment.position, me.progress)) throw new HttpError(404, 'Commentaire introuvable');
    return comment;
  }

  /** `gif`: undefined keeps the current GIF, null removes it. */
  async editComment(
    userId: string,
    readingId: string,
    commentId: string,
    text: string,
    gif?: Gif | null,
  ): Promise<void> {
    const entry = this.entry(readingId);
    const comment = this.visibleComment(entry, userId, commentId);
    if (comment.authorId !== userId) throw new HttpError(403, "Ce n'est pas ton commentaire");
    const trimmed = (text ?? '').trim();
    const nextGif = gif === undefined ? comment.gif : this.validGif(gif);
    if ((!trimmed && !nextGif) || trimmed.length > MAX_COMMENT_LENGTH) throw new HttpError(400, 'Commentaire invalide');
    await this.store.saveComment(readingId, { ...comment, text: trimmed, gif: nextGif, editedAt: this.now() });
  }

  async deleteComment(userId: string, readingId: string, commentId: string): Promise<void> {
    const entry = this.entry(readingId);
    const comment = this.visibleComment(entry, userId, commentId);
    if (comment.authorId !== userId && entry.reading.organizerId !== userId)
      throw new HttpError(403, "Ce n'est pas ton commentaire");
    await this.store.deleteComment(readingId, commentId);
  }

  async listEmojis(): Promise<CustomEmojiView[]> {
    const emojis = await this.deps.emojis();
    return [...emojis.values()]
      .map((e) => ({ key: customKey(e.id, e.name), name: e.name, url: proxied(emojiUrl(e.id, e.animated)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** `emoji` is a reaction key: a standard emoji, or `c:<id>:<name>` for a server emoji. */
  async toggleReaction(userId: string, readingId: string, commentId: string, emoji: string): Promise<void> {
    const custom = parseCustomKey(emoji);
    if (!custom && !isStandardEmoji(emoji)) throw new HttpError(400, 'Réaction inconnue');
    const known = custom ? (await this.deps.emojis()).get(custom.id) : undefined;
    // Server emojis use their current name; a deleted one keeps its key so it can still be removed.
    const key = known ? customKey(known.id, known.name) : emoji;
    const entry = this.entry(readingId);
    const comment = this.visibleComment(entry, userId, commentId);
    const users = comment.reactions[key] ?? [];
    const adding = !users.includes(userId);
    if (adding && custom && !known) throw new HttpError(400, "Cet emoji n'existe plus sur le serveur");
    const reactions = { ...comment.reactions };
    const next = adding ? [...users, userId] : users.filter((id) => id !== userId);
    if (next.length) reactions[key] = next;
    else delete reactions[key];
    if (adding && !comment.reactions[key] && Object.keys(reactions).length > MAX_REACTION_KINDS)
      throw new HttpError(400, 'Trop de réactions différentes sur ce commentaire');
    await this.store.saveComment(readingId, { ...comment, reactions });
    if (adding && comment.authorId !== userId) {
      this.deps.onEvent({
        readingId,
        kind: 'reaction',
        actorId: userId,
        position: comment.position,
        excerpt: known ? `:${known.name}:` : key,
      });
    }
  }

  private prefs(userId: string): UserPrefs {
    return this.store.users.get(userId)?.value ?? { userId, notify: DEFAULT_NOTIFY };
  }

  async setNotify(userId: string, notify: NotifyPref): Promise<void> {
    if (!NOTIFY_PREFS.includes(notify)) throw new HttpError(400, 'Préférence invalide');
    await this.store.saveUserPrefs({ ...this.prefs(userId), notify });
  }

  favoriteGifs(userId: string): Gif[] {
    return (this.prefs(userId).favoriteGifs ?? []).map(gifFromId);
  }

  /** Adds the GIF to the user's favorites (most recent first), or removes it if already there. */
  async toggleFavoriteGif(userId: string, gifId: string): Promise<Gif[]> {
    if (!GIPHY_ID.test(gifId)) throw new HttpError(400, 'GIF invalide');
    const prefs = this.prefs(userId);
    const current = prefs.favoriteGifs ?? [];
    const favoriteGifs = current.includes(gifId)
      ? current.filter((id) => id !== gifId)
      : [gifId, ...current].slice(0, MAX_FAVORITE_GIFS);
    await this.store.saveUserPrefs({ ...prefs, favoriteGifs });
    return favoriteGifs.map(gifFromId);
  }
}
