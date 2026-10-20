// Core data model. Everything here is persisted as JSON messages in hidden Discord channels.

export type ProgressUnit = 'chapter' | 'page' | 'percent';
export type JoinMode = 'invite' | 'open' | 'both';
export type NotifyPref = 'dm' | 'channel' | 'none';

export type Cover =
  | { kind: 'url'; url: string }
  // Uploaded image, stored as an attachment of the reading message.
  | { kind: 'attachment' }
  | null;

export interface Reading {
  /** Id of the Discord channel holding this reading's data. */
  id: string;
  title: string;
  author: string;
  cover: Cover;
  unit: ProgressUnit;
  /** Reference total: chapters, pages of the reference edition, or 100 for percent. */
  total: number;
  joinMode: JoinMode;
  organizerId: string;
  createdAt: number;
}

export interface Participant {
  userId: string;
  /** Progress in reference units (0 = not started). */
  progress: number;
  /** Page count of this reader's own edition (page unit only), null = reference edition. */
  editionTotal: number | null;
  /** Page the reader typed in their own edition, shown back as is (conversion rounds). */
  editionProgress?: number | null;
  /** Previous progress values, most recent last, used by "undo". */
  history: number[];
  lastVisit: { at: number; progress: number } | null;
}

export interface Gif {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  title: string;
}

export interface Comment {
  /** Id of the Discord message storing this comment. */
  id: string;
  authorId: string;
  /** Position in reference units the comment is anchored to. */
  position: number;
  text: string;
  gif: Gif | null;
  /** emoji -> user ids */
  reactions: Record<string, string[]>;
  /** Comment this one answers. Optional for records written before replies existed. */
  replyTo?: string | null;
  createdAt: number;
  editedAt: number | null;
}

export interface UserPrefs {
  userId: string;
  notify: NotifyPref;
  /** Giphy ids, most recent first. Optional for records written before favorites existed. */
  favoriteGifs?: string[];
}
