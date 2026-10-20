import type { Comment, Participant, Photo, Reading, UserPrefs } from '../domain/types';

// Every record is one bot message: "JSL1 " followed by JSON. Users never see these channels.
const PREFIX = 'JSL1 ';
export const MAX_MESSAGE_LENGTH = 2000;

export type StoredRecord =
  | { t: 'reading'; v: Omit<Reading, 'id'> }
  | { t: 'participant'; v: Participant }
  | { t: 'comment'; v: Omit<Comment, 'id'> }
  | { t: 'photo'; v: Omit<Photo, 'id'> }
  | { t: 'user'; v: UserPrefs };

export class RecordTooLargeError extends Error {
  constructor(length: number) {
    super(`record is ${length} characters, limit is ${MAX_MESSAGE_LENGTH}`);
  }
}

export function encode(record: StoredRecord): string {
  const content = PREFIX + JSON.stringify(record);
  if (content.length > MAX_MESSAGE_LENGTH) throw new RecordTooLargeError(content.length);
  return content;
}

/** Returns null for messages that are not records (e.g. written by hand by an admin). */
export function decode(content: string): StoredRecord | null {
  if (!content.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(PREFIX.length)) as StoredRecord;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'object' || parsed.v === null) return null;
    if (!['reading', 'participant', 'comment', 'photo', 'user'].includes(parsed.t)) return null;
    return parsed;
  } catch {
    return null;
  }
}
