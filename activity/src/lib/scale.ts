import type { ProgressUnit } from '$shared/api-types';
import { fromReference, toReference } from '$shared/domain/progress';
import { positionText } from './format';

/**
 * How positions are shown to the current reader. Positions are stored in the reference
 * edition; a reader with another edition (page unit only) sees and types their own pages.
 */
export interface Scale {
  unit: ProgressUnit;
  /** Reference total. */
  total: number;
  /** The reader's edition page count, when it differs from the reference. */
  edition: number | null;
  /** The reader's own progress, which they typed: shown exactly, never as a conversion. */
  mine: { progress: number; shown: number } | null;
}

export function makeScale(
  unit: ProgressUnit,
  total: number,
  editionTotal: number | null,
  mine: { progress: number; shown: number } | null = null,
): Scale {
  const edition = unit === 'page' && editionTotal && editionTotal !== total ? editionTotal : null;
  return { unit, total, edition, mine: edition ? mine : null };
}

const isMine = (scale: Scale, position: number) => scale.mine !== null && position === scale.mine.progress;

/** Reference position -> what the reader sees. */
export function toDisplay(scale: Scale, position: number): number {
  if (isMine(scale, position)) return scale.mine!.shown;
  return fromReference(position, scale.edition, scale.total);
}

/** What the reader typed -> reference position (rounded down, never unlocking too early). */
export function fromDisplay(scale: Scale, value: number): number {
  if (scale.mine && value === scale.mine.shown) return scale.mine.progress;
  return toReference(value, scale.edition, scale.total);
}

export function displayTotal(scale: Scale): number {
  return scale.edition ?? scale.total;
}

/** Label of a reference position in the reader's scale; "≈" marks a converted page. */
export function scaleLabel(scale: Scale, position: number): string {
  const text = positionText(scale.unit, toDisplay(scale, position));
  return scale.edition && position > 0 && !isMine(scale, position) ? text.replace(/^Page /, 'Page ≈ ') : text;
}

/** Label of a span of positions, e.g. a timeline point grouping nearby comments. */
export function rangeLabel(scale: Scale, start: number, end: number): string {
  const from = toDisplay(scale, start);
  const to = toDisplay(scale, end);
  return from === to ? scaleLabel(scale, start) : `${scaleLabel(scale, start)} à ${to}`;
}
