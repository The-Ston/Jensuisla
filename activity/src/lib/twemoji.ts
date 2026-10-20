import { img } from './format';

// Discord draws emojis with Twemoji, so we do too (the OS font may lack recent emojis).
const BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/';

function codepoints(text: string): string {
  return [...text].map((c) => c.codePointAt(0)!.toString(16)).join('-');
}

/**
 * Candidate image URLs for an emoji, best first. Twemoji file names drop the U+FE0F variation
 * selector except in most ZWJ sequences, with a few exceptions, hence the fallback.
 */
export function twemojiUrls(emoji: string): string[] {
  const stripped = emoji.replace(/️/g, '');
  const primary = emoji.includes('‍') ? emoji : stripped;
  return [...new Set([primary, stripped])].map((e) => img(`${BASE}${codepoints(e)}.svg`));
}
