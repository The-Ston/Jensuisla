import type { ProgressUnit } from './types';

export interface Point {
  /** Position of the first comment of the point. */
  start: number;
  /** Position of the last comment of the point. */
  end: number;
  ids: string[];
}

/** Comments closer than this distance (in reference units) are merged into one timeline point. */
export function pointWindow(unit: ProgressUnit, total: number): number {
  switch (unit) {
    case 'chapter':
      return 0;
    case 'percent':
      return 2;
    case 'page':
      return Math.max(1, Math.round(total * 0.02));
  }
}

/** Groups comments (any order) into timeline points. A point never spans more than `window`. */
export function groupIntoPoints(items: { id: string; position: number }[], window: number): Point[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const points: Point[] = [];
  for (const item of sorted) {
    const last = points[points.length - 1];
    if (last && item.position - last.start <= window) {
      last.end = item.position;
      last.ids.push(item.id);
    } else {
      points.push({ start: item.position, end: item.position, ids: [item.id] });
    }
  }
  return points;
}
