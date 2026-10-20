import type { ProgressUnit } from '$shared/api-types';

export function positionText(unit: ProgressUnit, position: number): string {
  if (position === 0) return 'Avant de commencer';
  switch (unit) {
    case 'chapter':
      return `Chapitre ${position}`;
    case 'page':
      return `Page ${position}`;
    case 'percent':
      return `${position} %`;
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
