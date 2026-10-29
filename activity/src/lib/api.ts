import type {
  Appearance,
  BookSuggestion,
  CommentColor,
  CreateReadingInput,
  CustomEmojiView,
  Gif,
  HomeView,
  MemberView,
  NotifyPref,
  PhotoRef,
  ProgressUnit,
  ReadingSummary,
  ReadingView,
} from '$shared/api-types';

let token = '';

export function setToken(value: string) {
  token = value;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? 'Erreur inattendue');
  return data as T;
}

/** Tells the server the Activity was hidden, shown or closed; `keepalive` lets it outlive the page. */
export function sendPresence(state: 'hidden' | 'visible' | 'leave') {
  if (!token) return;
  void fetch('/api/me/presence', {
    method: 'POST',
    keepalive: true,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch(() => undefined);
}

const r = (id: string) => `/readings/${encodeURIComponent(id)}`;

export const api = {
  home: () => call<HomeView>('GET', '/home'),
  members: () => call<MemberView[]>('GET', '/members'),
  emojis: () => call<CustomEmojiView[]>('GET', '/emojis'),
  books: (q: string) => call<BookSuggestion[]>('GET', `/books?q=${encodeURIComponent(q)}`),
  gifs: (q: string) => call<Gif[]>('GET', `/gifs?q=${encodeURIComponent(q)}`),
  favoriteGifs: () => call<Gif[]>('GET', '/gifs/favorites'),
  toggleFavoriteGif: (gifId: string) => call<Gif[]>('POST', '/gifs/favorites', { id: gifId }),
  setNotify: (pref: NotifyPref) => call<null>('PUT', '/me/notify', { pref }),
  setAppearance: (appearance: Appearance) => call<null>('PUT', '/me/appearance', appearance),
  setCommentColor: (color: CommentColor | null) => call<null>('PUT', '/me/comment-color', { color }),
  create: (input: CreateReadingInput) => call<ReadingSummary>('POST', '/readings', input),
  reading: (id: string) => call<ReadingView>('GET', r(id)),
  join: (id: string) => call<ReadingView>('POST', `${r(id)}/join`),
  invite: (id: string, userIds: string[]) => call<ReadingView>('POST', `${r(id)}/invite`, { userIds }),
  progress: (id: string, value: number, editionTotal: number | null, unit: ProgressUnit) =>
    call<ReadingView>('POST', `${r(id)}/progress`, { value, editionTotal, unit }),
  undo: (id: string) => call<ReadingView>('POST', `${r(id)}/undo`),
  visited: (id: string) => call<null>('POST', `${r(id)}/visited`),
  spoilers: (id: string, on: boolean) => call<ReadingView>('POST', `${r(id)}/spoilers`, { on }),
  autoAdvance: (id: string, on: boolean) => call<ReadingView>('POST', `${r(id)}/auto-advance`, { on }),
  comment: (
    id: string,
    input: { position: number; text: string; gif: Gif | null; replyTo: string | null; photos: string[] },
  ) => call<ReadingView>('POST', `${r(id)}/comments`, input),
  /** `gif` / `photos`: undefined keeps the current ones. */
  editComment: (id: string, commentId: string, text: string, gif?: Gif | null, photos?: string[]) =>
    call<ReadingView>('PATCH', `${r(id)}/comments/${commentId}`, {
      text,
      ...(gif === undefined ? {} : { gif }),
      ...(photos === undefined ? {} : { photos }),
    }),
  /** Sends a photo file as is (original quality). */
  async uploadPhoto(id: string, file: File, width: number, height: number): Promise<PhotoRef> {
    const res = await fetch(`/api${r(id)}/photos?w=${width}&h=${height}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? 'Envoi impossible');
    return data as PhotoRef;
  },
  discardPhoto: (id: string, photoId: string) => call<null>('DELETE', `${r(id)}/photos/${photoId}`),
  deleteComment: (id: string, commentId: string) => call<ReadingView>('DELETE', `${r(id)}/comments/${commentId}`),
  react: (id: string, commentId: string, emoji: string) =>
    call<ReadingView>('POST', `${r(id)}/comments/${commentId}/reactions`, { emoji }),
};
