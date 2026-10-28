import { HISTORY_LIMIT } from './limits';
import type { Participant, ProgressUnit, Reading } from './types';

/** The unit a reader sees and types: their own (pages <-> percent), or the reading's. */
export function readerUnit(reading: Pick<Reading, 'unit'>, participant: Pick<Participant, 'ownUnit'>): ProgressUnit {
  return participant.ownUnit ?? reading.unit;
}

/** Whether positions are converted to the reader's own scale, hence only approximate. */
export function isConverted(reading: Pick<Reading, 'total'>, participant: Pick<Participant, 'editionTotal'>): boolean {
  return !!participant.editionTotal && participant.editionTotal !== reading.total;
}

export function clampPosition(reading: Pick<Reading, 'total'>, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(reading.total, Math.round(value)));
}

/** Default increment of the "+" button. */
export function stepSize(unit: ProgressUnit): number {
  switch (unit) {
    case 'chapter':
      return 1;
    case 'page':
      return 10;
    case 'percent':
      return 5;
  }
}

/**
 * Converts a page of the reader's own edition to the reference edition.
 * Rounds down so an approximate conversion never unlocks content too early.
 */
export function toReference(value: number, editionTotal: number | null, referenceTotal: number): number {
  if (!editionTotal || editionTotal === referenceTotal) return value;
  return Math.floor((value * referenceTotal) / editionTotal);
}

/** Converts a reference position to the reader's own edition, for display. */
export function fromReference(value: number, editionTotal: number | null, referenceTotal: number): number {
  if (!editionTotal || editionTotal === referenceTotal) return value;
  return Math.round((value * editionTotal) / referenceTotal);
}

/** Returns the participant with a new progress, remembering the previous value for undo. */
export function applyProgress(participant: Participant, next: number): Participant {
  if (next === participant.progress) return participant;
  const history = [...participant.history, participant.progress].slice(-HISTORY_LIMIT);
  return { ...participant, progress: next, history };
}

/** Restores the previous progress, or returns null when there is nothing to undo. */
export function undoProgress(participant: Participant): Participant | null {
  if (participant.history.length === 0) return null;
  const history = participant.history.slice(0, -1);
  const progress = participant.history[participant.history.length - 1]!;
  return { ...participant, progress, history };
}

export function newParticipant(userId: string): Participant {
  return { userId, progress: 0, editionTotal: null, history: [], lastVisit: null };
}
