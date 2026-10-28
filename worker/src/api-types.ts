// HTTP contract between the Worker and the Activity (imported by both).
import type { Accent, Appearance, Comment, Gif, JoinMode, NotifyPref, PhotoRef, ProgressUnit, Theme } from './domain/types';

export type { Accent, Appearance, Comment, Gif, JoinMode, NotifyPref, PhotoRef, ProgressUnit, Theme };

export interface MemberView {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface ReadingSummary {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  unit: ProgressUnit;
  total: number;
  joinMode: JoinMode;
  organizerId: string;
  participantCount: number;
  isParticipant: boolean;
  canJoin: boolean;
  canInvite: boolean;
  myProgress: number | null;
  /** The reader's unit, progress and total in their own scale (edition, or pages <-> percent), for display. */
  myUnit: ProgressUnit;
  myShownProgress: number | null;
  myShownTotal: number;
  /** Comments by others, visible to the caller, written since their last visit. */
  unread: number;
}

export interface HomeView {
  me: MemberView & { isOrganizer: boolean; notify: NotifyPref; appearance: Appearance };
  readings: ReadingSummary[];
}

export interface ParticipantView {
  userId: string;
  progress: number;
}

export interface MyProgressView {
  /** Reference units. */
  progress: number;
  /** Unit the reader follows: the reading's, or pages <-> percent. */
  unit: ProgressUnit;
  /** Total of the reader's own scale (edition pages, or 100 for percent), null = the reading's. */
  editionTotal: number | null;
  /** Progress as the reader sees it: in their own edition when they have one. */
  shownProgress: number;
  canUndo: boolean;
  lastVisit: { at: number; progress: number } | null;
  /** Comments past the progress are shown too, and can be written. */
  spoilers: boolean;
  /** With spoilers, commenting past the progress moves the progress there. */
  autoAdvance: boolean;
}

export interface ReadingView {
  viewerId: string;
  reading: ReadingSummary;
  participants: ParticipantView[];
  me: MyProgressView | null;
  /** Only comments the caller is allowed to see (position <= their progress). */
  comments: Comment[];
  /** Display info for every user referenced in this view. */
  members: Record<string, MemberView>;
  /** Signed links to the photos of the visible comments, by photo id. */
  photoUrls: Record<string, string>;
}

export interface CreateReadingInput {
  title: string;
  author: string;
  coverUrl: string | null;
  /** Base64 image uploaded by the organizer, used instead of coverUrl. */
  coverData: { base64: string; contentType: string } | null;
  unit: ProgressUnit;
  total: number;
  joinMode: JoinMode;
  invitedIds: string[];
}

/** An emoji of the Discord server, usable as a reaction. */
export interface CustomEmojiView {
  /** Reaction key (`c:<id>:<name>`). */
  key: string;
  name: string;
  url: string;
}

export interface BookSuggestion {
  title: string;
  author: string;
  coverUrl: string | null;
  pages: number | null;
  year: number | null;
}

export interface ApiError {
  error: string;
}
