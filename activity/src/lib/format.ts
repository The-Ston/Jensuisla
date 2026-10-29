import type { ProgressUnit } from '$shared/api-types';

/** `approx`: the position was converted to another scale, so it is only close ("Page ≈ 34"). */
export function positionText(unit: ProgressUnit, position: number, approx = false): string {
  if (position === 0) return 'Avant de commencer';
  const near = approx ? '≈ ' : '';
  switch (unit) {
    case 'chapter':
      return `Chapitre ${position}`;
    case 'page':
      return `Page ${near}${position}`;
    case 'percent':
      return `${near}${position} %`;
  }
}

/** A span of positions, the unit said once: "Pages 12 à 18", "Chapitres 3 à 5", "67 à 68 %". */
export function rangeText(unit: ProgressUnit, from: number, to: number, approx = false): string {
  const near = approx ? '≈ ' : '';
  if (from === 0) {
    switch (unit) {
      case 'chapter':
        return `Du début au chapitre ${to}`;
      case 'page':
        return `Du début à la page ${near}${to}`;
      case 'percent':
        return `Du début à ${near}${to} %`;
    }
  }
  switch (unit) {
    case 'chapter':
      return `Chapitres ${from} à ${to}`;
    case 'page':
      return `Pages ${near}${from} à ${to}`;
    case 'percent':
      return `${near}${from} à ${to} %`;
  }
}

export function progressText(unit: ProgressUnit, progress: number, total: number): string {
  switch (unit) {
    case 'chapter':
      return `ch. ${progress}/${total}`;
    case 'page':
      return `p. ${progress}/${total}`;
    case 'percent':
      return `${progress} %`;
  }
}

export const unitNames: Record<ProgressUnit, string> = {
  chapter: 'Chapitres',
  page: 'Pages',
  percent: 'Pourcentage',
};

/** External images must go through our Worker (the Activity sandbox blocks other origins). */
export function img(url: string): string {
  return url.startsWith('/') ? url : `/api/img?u=${encodeURIComponent(url)}`;
}

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.round((at - now) / 1000);
  if (Math.abs(s) < 60) return 'à l’instant';
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, 'minute');
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}
