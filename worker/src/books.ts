import type { BookSuggestion } from './api-types';

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  first_publish_year?: number;
  /** The edition matching `lang` best, when there is one. */
  editions?: { docs?: { title?: string; language?: string[]; cover_i?: number }[] };
}

const MAX_RESULTS = 8;
const TIMEOUT_MS = 6000;

async function openLibrary(q: string): Promise<OpenLibraryDoc[]> {
  const params = new URLSearchParams({
    q,
    lang: 'fr',
    limit: '20',
    fields:
      // Editions only come back along with the work's key.
      'key,title,author_name,cover_i,number_of_pages_median,first_publish_year,editions,editions.key,editions.title,editions.language,editions.cover_i',
  });
  try {
    const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { 'User-Agent': 'Jensuisla (shared reading Discord Activity)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn('book search failed', res.status, q);
      return [];
    }
    return ((await res.json()) as { docs?: OpenLibraryDoc[] }).docs ?? [];
  } catch (err) {
    console.warn('book search failed', q, err);
    return [];
  }
}

/** Lowercase, without accents or punctuation: "L’Étranger" = "l etranger". */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Share of the meaningful words typed found in the title or author. The last one may be a
 * prefix, which counts half: "vent" matches "Le Nom du Vent" better than "ventes".
 */
function relevance(query: string, book: BookSuggestion): number {
  const typed = norm(query).split(' ');
  const last = typed.length - 1;
  const words = typed.map((w, i) => ({ w, prefix: i === last })).filter((t) => t.w.length >= 3);
  if (words.length === 0) return 1;
  const found = new Set(norm(`${book.title} ${book.author}`).split(' '));
  let score = 0;
  for (const { w, prefix } of words) {
    if (found.has(w)) score += 1;
    else if (prefix && [...found].some((f) => f.startsWith(w))) score += 0.5;
  }
  return score / words.length;
}

function toSuggestion(d: OpenLibraryDoc & { title: string }): BookSuggestion {
  // Titles are those of the original work ("The Name of the Wind"): use the French edition's.
  const french = d.editions?.docs?.find((e) => e.title && e.language?.includes('fre'));
  const cover = french?.cover_i ?? d.cover_i;
  return {
    title: french?.title ?? d.title,
    author: d.author_name?.join(', ') ?? '',
    coverUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : null,
    pages: d.number_of_pages_median ?? null,
    year: d.first_publish_year ?? null,
  };
}

/**
 * Suggests books (cover, page count) from Open Library. No API key needed. The last word may
 * be unfinished ("la horde du cont"), so a prefix search runs alongside; results are then
 * ordered by how well they match the words typed, as prefixes alone rank poorly.
 */
export async function searchBooks(query: string): Promise<BookSuggestion[]> {
  const words = query.split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? '';
  const prefix = /^\p{L}{3,}$/u.test(last) ? [...words.slice(0, -1), `${last}*`].join(' ') : null;
  const [exact, partial] = await Promise.all([openLibrary(query), prefix ? openLibrary(prefix) : []]);

  // The same work often appears several times: keep the first, completed by the others.
  const books: BookSuggestion[] = [];
  for (const d of [...exact, ...partial]) {
    if (!d.title) continue;
    const book = toSuggestion({ ...d, title: d.title });
    const same = books.find(
      (b) => norm(b.title) === norm(book.title) && (!b.author || !book.author || norm(b.author) === norm(book.author)),
    );
    if (!same) {
      books.push(book);
      continue;
    }
    if (!same.author) same.author = book.author;
    same.coverUrl ??= book.coverUrl;
    same.pages ??= book.pages;
    same.year ??= book.year;
  }
  // Stable sort: Open Library's order stays among equally relevant books.
  return books
    .map((book, i) => ({ book, i, score: relevance(query, book) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_RESULTS)
    .map((r) => r.book);
}
