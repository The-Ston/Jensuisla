// Minimal subset of the Discord REST API used by Jensuisla, behind an interface so tests can fake it.

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
}

export interface GuildMember {
  user: DiscordUser;
  nick: string | null;
  avatar: string | null;
  roles: string[];
}

export interface DiscordChannel {
  id: string;
  type: number;
  name?: string;
  parent_id?: string | null;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  url: string;
  content_type?: string;
}

export interface DiscordMessage {
  id: string;
  content: string;
  attachments: DiscordAttachment[];
}

export interface PermissionOverwrite {
  id: string;
  /** 0 = role, 1 = member */
  type: 0 | 1;
  allow?: string;
  deny?: string;
}

export interface MessageBody {
  content?: string;
  allowed_mentions?: { parse?: string[]; users?: string[] };
  components?: unknown[];
}

export interface FileUpload {
  name: string;
  contentType: string;
  data: Uint8Array;
}

export interface DiscordApi {
  listGuildChannels(guildId: string): Promise<DiscordChannel[]>;
  createGuildChannel(
    guildId: string,
    body: { name: string; type: number; parent_id?: string; permission_overwrites?: PermissionOverwrite[] },
  ): Promise<DiscordChannel>;
  /** Up to 100 messages, newest first, optionally before a message id. */
  listMessages(channelId: string, before?: string): Promise<DiscordMessage[]>;
  getMessage(channelId: string, messageId: string): Promise<DiscordMessage>;
  createMessage(channelId: string, body: MessageBody, file?: FileUpload): Promise<DiscordMessage>;
  editMessage(channelId: string, messageId: string, body: MessageBody): Promise<DiscordMessage>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  listGuildMembers(guildId: string): Promise<GuildMember[]>;
  createDm(userId: string): Promise<DiscordChannel>;
}

export const ChannelType = { GuildText: 0, GuildCategory: 4 } as const;

export const Permission = {
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
} as const;
