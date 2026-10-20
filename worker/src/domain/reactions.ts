// A reaction key is either a standard emoji (its Unicode text) or a server emoji
// written `c:<id>:<name>` (the name keeps it readable if the emoji is later deleted).

const CUSTOM_KEY = /^c:(\d{5,25}):([\w~]{1,32})$/;
const EMOJI_CHARS = /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️⃣]{1,32}$/u;
const HAS_PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|⃣/u;

/** Distinct reactions allowed on one comment, to keep its record within one Discord message. */
export const MAX_REACTION_KINDS = 20;

export function isStandardEmoji(text: string): boolean {
  return EMOJI_CHARS.test(text) && HAS_PICTOGRAPH.test(text);
}

export function customKey(id: string, name: string): string {
  return `c:${id}:${name}`;
}

export function parseCustomKey(key: string): { id: string; name: string } | null {
  const m = CUSTOM_KEY.exec(key);
  return m ? { id: m[1]!, name: m[2]! } : null;
}
