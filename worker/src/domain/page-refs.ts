// Page, chapter or percent mentions inside comment text ("je me rappelle de la p.25", "au ch.3",
// "vers 10%") are stored as tokens holding a position in the reading's own unit (a
// reference-edition page, a chapter, or a percent), so every reader can see them in their own
// scale: another edition, or percent for pages and the other way round.

const TOKEN = /\[\[p:(\d{1,5})\]\]/g;

export type Segment = { kind: 'text'; text: string } | { kind: 'page'; position: number };

export function pageToken(position: number): string {
  return `[[p:${position}]]`;
}

/** Short label of a mention: "p. 25", "10 %" (≈ when converted from another scale), "ch. 3". */
export function mentionLabel(unit: string, shown: number, approx = false): string {
  const near = approx ? '≈ ' : '';
  if (unit === 'chapter') return `ch. ${shown}`;
  return unit === 'percent' ? `${near}${shown} %` : `p. ${near}${shown}`;
}

export function splitPageRefs(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push({ kind: 'page', position: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Replaces each token with plain text, e.g. for notifications or quotes. */
export function renderPageRefs(text: string, label: (position: number) => string): string {
  return text.replace(TOKEN, (_, p: string) => label(Number(p)));
}

/** Keeps tokens only where they make sense: within the book. */
export function sanitizePageRefs(text: string, unit: string, total: number): string {
  return text.replace(TOKEN, (token, p: string) =>
    Number(p) >= 1 && Number(p) <= total ? token : mentionLabel(unit, Number(p)),
  );
}
