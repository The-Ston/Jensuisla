import type { DiscordUser } from './api';

export function avatarUrl(user: Pick<DiscordUser, 'id' | 'avatar'>): string {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  const index = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function emojiUrl(id: string, animated: boolean): string {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=48`;
}

/** External images go through the Worker: the Activity sandbox only allows its own origin. */
export function proxied(url: string): string {
  return `/api/img?u=${encodeURIComponent(url)}`;
}

export const IMAGE_HOSTS = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net|covers\.openlibrary\.org|(media\d*|i)\.giphy\.com)\//;
