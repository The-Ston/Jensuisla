import type { CustomEmojiView } from '$shared/api-types';
import { parseCustomKey } from '$shared/domain/reactions';
import { api } from './api';

const RECENTS_KEY = 'jensuisla.recentEmojis';
const MAX_RECENTS = 24;

export interface StandardEmoji {
  unicode: string;
  label: string;
  /** Lowercased, accent-free label and tags, for search. */
  search: string;
}

export interface EmojiGroup {
  name: string;
  emojis: StandardEmoji[];
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

let custom = $state<CustomEmojiView[]>([]);
let customLoading: Promise<void> | null = null;
let recents = $state<string[]>(readRecents());
let groups: Promise<EmojiGroup[]> | null = null;

function readRecents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

export const emojis = {
  get custom() {
    return custom;
  },
  get recents() {
    return recents;
  },
  loadCustom() {
    customLoading ??= api
      .emojis()
      .then((list) => {
        custom = list;
      })
      .catch(() => {
        customLoading = null;
      });
    return customLoading;
  },
  /** Server emoji for a reaction key, if it still exists. */
  customFor(key: string): CustomEmojiView | undefined {
    const parsed = parseCustomKey(key);
    return parsed ? custom.find((e) => parseCustomKey(e.key)?.id === parsed.id) : undefined;
  },
  remember(key: string) {
    recents = [key, ...recents.filter((k) => k !== key)].slice(0, MAX_RECENTS);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
    } catch {
      // Storage may be unavailable in the Activity iframe; recents then last for the session.
    }
  },
  /** All standard emojis by category, in French. Loaded on demand (large dataset). */
  standard(): Promise<EmojiGroup[]> {
    groups ??= Promise.all([
      import('emojibase-data/fr/compact.json'),
      import('emojibase-data/fr/messages.json'),
    ]).then(([data, messages]) => {
      const byGroup = new Map<number, StandardEmoji[]>();
      for (const e of data.default as { unicode: string; label: string; group?: number; tags?: string[] }[]) {
        // Group 2 holds skin-tone components, not usable alone.
        if (e.group === undefined || e.group === 2) continue;
        const list = byGroup.get(e.group) ?? [];
        list.push({ unicode: e.unicode, label: e.label, search: normalize([e.label, ...(e.tags ?? [])].join(' ')) });
        byGroup.set(e.group, list);
      }
      return (messages.default.groups as { message: string; order: number }[])
        .filter((g) => byGroup.has(g.order))
        .sort((a, b) => a.order - b.order)
        .map((g) => ({ name: g.message.charAt(0).toUpperCase() + g.message.slice(1), emojis: byGroup.get(g.order)! }));
    });
    return groups;
  },
};
