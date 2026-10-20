import type { BookSuggestion } from './api-types';

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  first_publish_year?: number;
}

/** Suggests books (cover, page count) from Open Library. No API key needed. */
export async function searchBooks(query: string): Promise<BookSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '8',
    fields: 'title,author_name,cover_i,number_of_pages_median,first_publish_year',
  });
  const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
    headers: { 'User-Agent': 'Jensuisla (shared reading Discord Activity)' },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { docs?: OpenLibraryDoc[] };
  return (body.docs ?? [])
    .filter((d) => d.title)
    .map((d) => ({
      title: d.title!,
      author: d.author_name?.join(', ') ?? '',
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      pages: d.number_of_pages_median ?? null,
      year: d.first_publish_year ?? null,
    }));
}
