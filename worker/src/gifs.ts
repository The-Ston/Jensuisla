import type { Gif } from './domain/types';

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyItem {
  id: string;
  title: string;
  images: { fixed_height: GiphyImage; fixed_height_small?: GiphyImage; fixed_width_small?: GiphyImage };
}

function strip(url: string): string {
  // Giphy adds tracking query parameters; the bare URL is enough and stable.
  return url.split('?')[0]!;
}

/** Searches GIFs on Giphy, or returns trending ones when the query is empty. */
export async function searchGifs(apiKey: string, query: string): Promise<Gif[]> {
  const params = new URLSearchParams({ api_key: apiKey, limit: '24', rating: 'pg-13', lang: 'fr' });
  const endpoint = query ? 'search' : 'trending';
  if (query) params.set('q', query);
  const res = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: GiphyItem[] };
  return (body.data ?? []).map((g) => {
    const full = g.images.fixed_height;
    const preview = g.images.fixed_height_small ?? g.images.fixed_width_small ?? full;
    return {
      id: g.id,
      url: strip(full.url),
      previewUrl: strip(preview.url),
      width: Number(full.width),
      height: Number(full.height),
      title: g.title,
    };
  });
}
