import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchBooks } from '../src/books';

/** Answers Open Library searches: `byQuery` maps a query to the docs it returns. */
function stubOpenLibrary(byQuery: Record<string, object[]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get('q')!;
      return new Response(JSON.stringify({ docs: byQuery[q] ?? [] }));
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('searchBooks', () => {
  it('shows the French edition title and merges duplicates', async () => {
    stubOpenLibrary({
      'nom du vent': [
        {
          title: 'The Name of the Wind',
          author_name: ['Patrick Rothfuss'],
          number_of_pages_median: 736,
          editions: { docs: [{ title: 'Le Nom du Vent', language: ['fre'], cover_i: 1 }] },
        },
        { title: 'Le nom du vent', first_publish_year: 2009 },
      ],
    });
    const books = await searchBooks('nom du vent');
    expect(books).toEqual([
      {
        title: 'Le Nom du Vent',
        author: 'Patrick Rothfuss',
        coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg',
        pages: 736,
        year: 2009,
      },
    ]);
  });

  it('finds an unfinished title, ahead of unrelated matches', async () => {
    stubOpenLibrary({
      'la horde du cont': [{ title: 'Métal Hurlant HS3', author_name: ['Jerry Frissen'] }],
      'la horde du cont*': [{ title: 'La Horde du Contrevent', author_name: ['Alain Damasio'] }],
    });
    const books = await searchBooks('la horde du cont');
    expect(books.map((b) => b.title)).toEqual(['La Horde du Contrevent', 'Métal Hurlant HS3']);
  });
});
