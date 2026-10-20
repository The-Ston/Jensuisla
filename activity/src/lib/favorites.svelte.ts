import type { Gif } from '$shared/api-types';
import { api } from './api';

// Shared across the picker and comments so a star toggled anywhere shows everywhere.
let list = $state<Gif[]>([]);
let loading: Promise<void> | null = null;

export const favorites = {
  get list() {
    return list;
  },
  has(id: string) {
    return list.some((g) => g.id === id);
  },
  load() {
    loading ??= api
      .favoriteGifs()
      .then((gifs) => {
        list = gifs;
      })
      .catch(() => {
        loading = null;
      });
    return loading;
  },
  async toggle(gif: Gif) {
    list = await api.toggleFavoriteGif(gif.id);
  },
};
