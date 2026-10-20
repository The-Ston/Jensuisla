import type {
  DiscordApi,
  DiscordChannel,
  DiscordMessage,
  FileUpload,
  GuildMember,
  MessageBody,
  PermissionOverwrite,
} from './api';

const API = 'https://discord.com/api/v10';
const MAX_RETRIES = 3;

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    path: string,
  ) {
    super(`Discord API ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

/** Discord REST client authenticated as the bot. Retries on rate limits. */
export class DiscordRest implements DiscordApi {
  constructor(private readonly botToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown, file?: FileUpload): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { Authorization: `Bot ${this.botToken}` };
      let payload: BodyInit | undefined;
      if (file) {
        const form = new FormData();
        form.append('payload_json', JSON.stringify(body ?? {}));
        form.append('files[0]', new Blob([file.data], { type: file.contentType }), file.name);
        payload = form;
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }

      const res = await fetch(API + path, { method, headers, body: payload });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const info = (await res.json().catch(() => ({}))) as { retry_after?: number };
        await new Promise((r) => setTimeout(r, Math.ceil((info.retry_after ?? 1) * 1000)));
        continue;
      }
      if (!res.ok) throw new DiscordError(res.status, await res.text(), path);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
  }

  listGuildChannels(guildId: string) {
    return this.request<DiscordChannel[]>('GET', `/guilds/${guildId}/channels`);
  }

  createGuildChannel(
    guildId: string,
    body: { name: string; type: number; parent_id?: string; permission_overwrites?: PermissionOverwrite[] },
  ) {
    return this.request<DiscordChannel>('POST', `/guilds/${guildId}/channels`, body);
  }

  listMessages(channelId: string, before?: string) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    return this.request<DiscordMessage[]>('GET', `/channels/${channelId}/messages?${query}`);
  }

  getMessage(channelId: string, messageId: string) {
    return this.request<DiscordMessage>('GET', `/channels/${channelId}/messages/${messageId}`);
  }

  createMessage(channelId: string, body: MessageBody, file?: FileUpload) {
    return this.request<DiscordMessage>('POST', `/channels/${channelId}/messages`, body, file);
  }

  editMessage(channelId: string, messageId: string, body: MessageBody) {
    return this.request<DiscordMessage>('PATCH', `/channels/${channelId}/messages/${messageId}`, body);
  }

  async deleteMessage(channelId: string, messageId: string) {
    await this.request<void>('DELETE', `/channels/${channelId}/messages/${messageId}`);
  }

  async listGuildMembers(guildId: string) {
    const all: GuildMember[] = [];
    let after = '0';
    for (;;) {
      const page = await this.request<GuildMember[]>('GET', `/guilds/${guildId}/members?limit=1000&after=${after}`);
      all.push(...page);
      if (page.length < 1000) return all;
      after = page[page.length - 1]!.user.id;
    }
  }

  createDm(userId: string) {
    return this.request<DiscordChannel>('POST', '/users/@me/channels', { recipient_id: userId });
  }
}

/** Identifies the user behind an OAuth access token sent by the Activity. */
export async function fetchOAuthUser(accessToken: string): Promise<{ id: string } | null> {
  const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return (await res.json()) as { id: string };
}

export async function exchangeOAuthCode(clientId: string, clientSecret: string, code: string) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { access_token: string }).access_token;
}
