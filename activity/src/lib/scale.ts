import type { ProgressUnit } from '$shared/api-types';
import { fromReference, toReference } from '$shared/domain/progress';
import { positionText } from './format';

/**
 * How positions are shown to the current reader. Positions are stored in the reading's unit and
 * reference edition; a reader with another edition sees and types their own pages, and one
 * following percent in a page reading (or pages in a percent one) sees and types that unit.
 */
export interface Scale {
  /** Unit the reader sees and types. */
  unit: ProgressUnit;
  /** Reference total. */
  total: number;
  /** Total of the reader's own scale (edition pages, or 100 for percent), when it differs from the reference. */
  edition: number | null;
  /** The reader's own progress, which they typed: shown exactly, never as a conversion. */
  mine: { progress: number; shown: number } | null;
}

export function makeScale(
  unit: ProgressUnit,
  total: number,
  own: { unit: ProgressUnit; editionTotal: number | null } | null = null,
  mine: { progress: number; shown: number } | null = null,
): Scale {
  const edition = unit !== 'chapter' && own?.editionTotal && own.editionTotal !== total ? own.editionTotal : null;
  return { unit: own?.unit ?? unit, total, edition, mine: edition ? mine : null };
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

/** Label of a reference position in the reader's scale; "≈" marks a converted position. */
export function scaleLabel(scale: Scale, position: number): string {
  return positionText(scale.unit, toDisplay(scale, position), !!scale.edition && !isMine(scale, position));
}

/** Label of a span of positions, e.g. a timeline point grouping nearby comments. */
export function rangeLabel(scale: Scale, start: number, end: number): string {
  const from = toDisplay(scale, start);
  const to = toDisplay(scale, end);
  return from === to ? scaleLabel(scale, start) : `${scaleLabel(scale, start)} à ${to}`;
}
