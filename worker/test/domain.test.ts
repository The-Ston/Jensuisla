import { describe, expect, it } from 'vitest';
import { canSee, canWriteAt, visibleComments } from '../src/domain/access';
import { groupIntoPoints, pointWindow } from '../src/domain/points';
import { applyProgress, fromReference, newParticipant, toReference, undoProgress } from '../src/domain/progress';
import { decode, encode, RecordTooLargeError } from '../src/store/codec';
import { renderPageRefs, sanitizePageRefs, splitPageRefs } from '../src/domain/page-refs';
import type { Comment } from '../src/domain/types';

const comment = (id: string, position: number, createdAt = 0): Comment => ({
  id,
  authorId: 'a',
  position,
  text: 't',
  gif: null,
  reactions: {},
  createdAt,
  editedAt: null,
});

describe('anti-spoiler', () => {
  it('shows only what the reader reached', () => {
    expect(canSee(13, 13)).toBe(true);
    expect(canSee(14, 13)).toBe(false);
    const visible = visibleComments([comment('3', 9), comment('1', 2), comment('2', 6)], 6);
    expect(visible.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('forbids writing ahead of your progress', () => {
    const reading = { total: 22 };
    expect(canWriteAt(reading, 5, 5)).toBe(true);
    expect(canWriteAt(reading, 0, 0)).toBe(true);
    expect(canWriteAt(reading, 6, 5)).toBe(false);
    expect(canWriteAt(reading, 2.5, 5)).toBe(false);
    expect(canWriteAt(reading, 23, 30)).toBe(false);
  });
});

describe('progress', () => {
  it('keeps history for undo, capped', () => {
    let p = newParticipant('u');
    for (let i = 1; i <= 15; i++) p = applyProgress(p, i);
    expect(p.progress).toBe(15);
    expect(p.history).toHaveLength(10);
    const undone = undoProgress(p)!;
    expect(undone.progress).toBe(14);
    expect(undoProgress(newParticipant('u'))).toBeNull();
  });

  it('does not record a no-op change', () => {
    const p = applyProgress(newParticipant('u'), 0);
    expect(p.history).toEqual([]);
  });

  it('converts editions conservatively', () => {
    // Page 120 of a 410-page edition is ~page 103 of the 352-page reference.
    expect(toReference(120, 410, 352)).toBe(103);
    expect(toReference(120, null, 352)).toBe(120);
    expect(fromReference(103, 410, 352)).toBe(120);
  });
});

describe('timeline points', () => {
  it('keeps chapters separate', () => {
    expect(pointWindow('chapter', 22)).toBe(0);
    const pts = groupIntoPoints([{ id: 'a', position: 3 }, { id: 'b', position: 3 }, { id: 'c', position: 4 }], 0);
    expect(pts.map((p) => p.ids)).toEqual([['a', 'b'], ['c']]);
  });

  it('merges nearby pages within the window', () => {
    const w = pointWindow('page', 352); // 7 pages
    const pts = groupIntoPoints(
      [88, 90, 121, 95, 12].map((position, i) => ({ id: String(i), position })),
      w,
    );
    expect(pts.map((p) => [p.start, p.end])).toEqual([[12, 12], [88, 95], [121, 121]]);
  });
});

describe('page mentions', () => {
  it('splits text around page tokens', () => {
    expect(splitPageRefs('vu [[p:25]] et [[p:30]].')).toEqual([
      { kind: 'text', text: 'vu ' },
      { kind: 'page', position: 25 },
      { kind: 'text', text: ' et ' },
      { kind: 'page', position: 30 },
      { kind: 'text', text: '.' },
    ]);
    expect(renderPageRefs('la [[p:25]] !', (p) => `p. ${p + 1}`)).toBe('la p. 26 !');
  });

  it('only keeps valid tokens', () => {
    expect(sanitizePageRefs('[[p:25]] [[p:999]]', 'page', 352)).toBe('[[p:25]] p. 999');
    expect(sanitizePageRefs('[[p:3]] [[p:30]]', 'chapter', 22)).toBe('[[p:3]] ch. 30');
    expect(sanitizePageRefs('[[p:3]]', 'percent', 100)).toBe('p. 3');
  });
});

describe('codec', () => {
  it('round-trips records', () => {
    const rec = { t: 'user' as const, v: { userId: '1', notify: 'dm' as const } };
    expect(decode(encode(rec))).toEqual(rec);
    expect(decode('hello')).toBeNull();
    expect(decode('JSL1 {broken')).toBeNull();
  });

  it('refuses records larger than a Discord message', () => {
    const big = { t: 'comment' as const, v: { ...comment('x', 1), text: 'é'.repeat(2100) } };
    expect(() => encode(big)).toThrow(RecordTooLargeError);
  });
});
