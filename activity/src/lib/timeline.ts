import type { Comment, ReadingView } from '$shared/api-types';
import { groupIntoPoints, pointWindow } from '$shared/domain/points';

export interface TimelinePoint {
  start: number;
  end: number;
  count: number;
  isNew: boolean;
  comments: Comment[];
}

/**
 * Groups visible comments into timeline points. A point is "new" when it holds something
 * written by someone else since the last visit, or newly unlocked by moving forward.
 */
export function buildPoints(
  view: ReadingView,
  meId: string,
  lastVisit: { at: number; progress: number } | null,
  seen: Set<number>,
): TimelinePoint[] {
  const byId = new Map(view.comments.map((c) => [c.id, c]));
  const window = pointWindow(view.reading.unit, view.reading.total);
  return groupIntoPoints(view.comments, window).map((p) => {
    const comments = p.ids.map((id) => byId.get(id)!).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    const isNew =
      !!lastVisit &&
      !seen.has(p.start) &&
      comments.some((c) => c.authorId !== meId && (c.createdAt > lastVisit.at || c.position > lastVisit.progress));
    return { start: p.start, end: p.end, count: comments.length, isNew, comments };
  });
}
