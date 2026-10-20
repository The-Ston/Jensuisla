import type { Comment, Reading } from './types';

/** The anti-spoiler rule: something anchored at `position` is visible once the reader reached it. */
export function canSee(position: number, progress: number): boolean {
  return position <= progress;
}

export function visibleComments(comments: Iterable<Comment>, progress: number): Comment[] {
  const out: Comment[] = [];
  for (const c of comments) if (canSee(c.position, progress)) out.push(c);
  return out.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

/** A reader can only write at a position they have already reached. */
export function canWriteAt(reading: Pick<Reading, 'total'>, position: number, progress: number): boolean {
  return Number.isInteger(position) && position >= 0 && position <= reading.total && position <= progress;
}
