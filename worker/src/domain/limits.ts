export const MAX_TITLE_LENGTH = 200;
export const MAX_AUTHOR_LENGTH = 120;
export const MAX_COMMENT_LENGTH = 1000;
export const MAX_TOTAL = 10000;
export const HISTORY_LIMIT = 10;
export const MAX_COVER_BYTES = 2 * 1024 * 1024;
/** Favorites are stored as Giphy ids in the user's record, which must fit in one message. */
export const MAX_FAVORITE_GIFS = 60;

/** Reactions offered first in the Activity; any standard or server emoji is accepted. */
export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🤯'] as const;
