import type {
  BookSuggestion,
  CreateReadingInput,
  CustomEmojiView,
  Gif,
  HomeView,
  MemberView,
  NotifyPref,
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
  create: (input: CreateReadingInput) => call<ReadingSummary>('POST', '/readings', input),
  reading: (id: string) => call<ReadingView>('GET', r(id)),
  join: (id: string) => call<ReadingView>('POST', `${r(id)}/join`),
  invite: (id: string, userIds: string[]) => call<ReadingView>('POST', `${r(id)}/invite`, { userIds }),
  progress: (id: string, value: number, editionTotal: number | null) =>
    call<ReadingView>('POST', `${r(id)}/progress`, { value, editionTotal }),
  undo: (id: string) => call<ReadingView>('POST', `${r(id)}/undo`),
  visited: (id: string) => call<null>('POST', `${r(id)}/visited`),
  comment: (id: string, input: { position: number; text: string; gif: Gif | null; replyTo: string | null }) =>
    call<ReadingView>('POST', `${r(id)}/comments`, input),
  /** `gif`: undefined keeps the current GIF, null removes it. */
  editComment: (id: string, commentId: string, text: string, gif?: Gif | null) =>
    call<ReadingView>('PATCH', `${r(id)}/comments/${commentId}`, gif === undefined ? { text } : { text, gif }),
  deleteComment: (id: string, commentId: string) => call<ReadingView>('DELETE', `${r(id)}/comments/${commentId}`),
  react: (id: string, commentId: string, emoji: string) =>
    call<ReadingView>('POST', `${r(id)}/comments/${commentId}/reactions`, { emoji }),
};
