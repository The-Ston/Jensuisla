import type { Accent, Appearance, Theme } from '$shared/api-types';

export const THEMES: { id: Theme; name: string }[] = [
  { id: 'night', name: 'Nuit' },
  { id: 'day', name: 'Jour' },
  { id: 'paper', name: 'Papier' },
  { id: 'forest', name: 'Forêt' },
];

export const ACCENTS: { id: Accent | null; name: string }[] = [
  { id: null, name: 'Celle du thème' },
  { id: 'coral', name: 'Corail' },
  { id: 'lavender', name: 'Lavande' },
  { id: 'turquoise', name: 'Turquoise' },
  { id: 'pink', name: 'Rose' },
];

const CACHE_KEY = 'jensuisla.appearance';

/** Paints the whole Activity with this appearance and remembers it for the next launch. */
export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  if (appearance.accent) root.dataset.accent = appearance.accent;
  else delete root.dataset.accent;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage may be unavailable in the Activity iframe; the server copy still applies on load.
  }
}

/**
 * Applies the appearance saved on this device, so the right theme shows before the server
 * answers. The server's copy stays the reference and replaces it once the home view loads.
 */
export function applyCachedAppearance() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    const theme = THEMES.find((t) => t.id === parsed?.theme)?.id;
    if (theme) applyAppearance({ theme, accent: ACCENTS.find((a) => a.id === parsed.accent)?.id ?? null });
  } catch {
    // Nothing usable cached: the default theme applies.
  }
}
