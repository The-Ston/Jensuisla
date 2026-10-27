import type { Comment, Participant, Reading } from './types';

/** The anti-spoiler rule: something anchored at `position` is visible once the reader reached it. */
export function canSee(position: number, progress: number): boolean {
  return position <= progress;
}

/**
 * How far a reader can see and write: their progress, or the whole book once they chose to
 * see spoilers. Notifications and unread counts keep using the progress itself.
 */
export function reach(participant: Pick<Participant, 'progress' | 'spoilers'>, total: number): number {
  return participant.spoilers ? total : participant.progress;
}

export function visibleComments(comments: Iterable<Comment>, reachValue: number): Comment[] {
  const out: Comment[] = [];
  for (const c of comments) if (canSee(c.position, reachValue)) out.push(c);
  return out.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

/** A reader can only write at a position within their reach. */
export function canWriteAt(reading: Pick<Reading, 'total'>, position: number, reachValue: number): boolean {
  return Number.isInteger(position) && position >= 0 && position <= reading.total && position <= reachValue;
}
