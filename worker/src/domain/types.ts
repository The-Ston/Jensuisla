// Core data model. Everything here is persisted as JSON messages in hidden Discord channels.

export type ProgressUnit = 'chapter' | 'page' | 'percent';
export type JoinMode = 'invite' | 'open' | 'both';
export type NotifyPref = 'dm' | 'channel' | 'none';
export type Theme = 'night' | 'day' | 'paper' | 'forest';
export type Accent = 'coral' | 'lavender' | 'turquoise' | 'pink';
/** Color of a user's comment text, seen by everyone (each theme shows a readable shade of it). */
export type CommentColor = 'red' | 'orange' | 'green' | 'blue' | 'violet' | 'pink';

/** How the Activity looks for one user. A null accent keeps the theme's own. */
export interface Appearance {
  theme: Theme;
  accent: Accent | null;
}

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
  /**
   * Total of this reader's own scale, null = the reading's: page count of their edition, or 100
   * when they follow percent in a page reading.
   */
  editionTotal: number | null;
  /** Unit this reader follows instead of the reading's (pages <-> percent). Optional for older records. */
  ownUnit?: ProgressUnit | null;
  /** Page the reader typed in their own edition, shown back as is (conversion rounds). */
  editionProgress?: number | null;
  /** Previous progress values, most recent last, used by "undo". */
  history: number[];
  lastVisit: { at: number; progress: number } | null;
  /** Shows (and allows writing) past the reader's progress. Optional for older records. */
  spoilers?: boolean;
  /** With spoilers, commenting past the progress moves the progress there. Optional for older records. */
  autoAdvance?: boolean;
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
  /** Attached photos, in order. Optional for records written before photos existed. */
  photos?: PhotoRef[];
  createdAt: number;
  editedAt: number | null;
}

/** A photo is stored alone in a hidden message (one file per message stays within Discord's limits). */
export interface Photo {
  /** Id of the Discord message holding the file. */
  id: string;
  uploaderId: string;
  contentType: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface PhotoRef {
  id: string;
  width: number;
  height: number;
}

export interface UserPrefs {
  userId: string;
  notify: NotifyPref;
  /** Giphy ids, most recent first. Optional for records written before favorites existed. */
  favoriteGifs?: string[];
  /** Optional for records written before themes existed. */
  appearance?: Appearance;
  /** Null or missing = the theme's text color. */
  commentColor?: CommentColor | null;
}
