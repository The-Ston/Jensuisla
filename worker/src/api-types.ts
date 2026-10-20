// HTTP contract between the Worker and the Activity (imported by both).
import type { Comment, Gif, JoinMode, NotifyPref, ProgressUnit } from './domain/types';

export type { Comment, Gif, JoinMode, NotifyPref, ProgressUnit };

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
}

export interface HomeView {
  me: MemberView & { isOrganizer: boolean; notify: NotifyPref };
  readings: ReadingSummary[];
}

export interface ParticipantView {
  userId: string;
  progress: number;
}

export interface MyProgressView {
  progress: number;
  editionTotal: number | null;
  canUndo: boolean;
  lastVisit: { at: number; progress: number } | null;
}

export interface ReadingView {
  reading: ReadingSummary;
  participants: ParticipantView[];
  me: MyProgressView | null;
  /** Only comments the caller is allowed to see (position <= their progress). */
  comments: Comment[];
  /** Display info for every user referenced in this view. */
  members: Record<string, MemberView>;
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
