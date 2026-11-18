import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string;

let sdk: DiscordSDK | null = null;

/** Discord adds `frame_id` to the URL when the page runs as an Activity. */
export function inDiscord(): boolean {
  return new URLSearchParams(location.search).has('frame_id');
}

/** Signs the user in through Discord and returns an OAuth access token for our API. */
export async function connect(): Promise<string> {
  const client = new DiscordSDK(CLIENT_ID);
  sdk = client;
  await client.ready();
  const { code } = await client.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('La connexion à Discord a échoué');
  const { access_token } = (await res.json()) as { access_token: string };
  await client.commands.authenticate({ access_token });
  return access_token;
}

/** Opens a website in the user's browser; Discord asks them to confirm first. */
export function openExternal(url: string): void {
  if (sdk) void sdk.commands.openExternalLink({ url });
  else window.open(url, '_blank', 'noopener');
}
