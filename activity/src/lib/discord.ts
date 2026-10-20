import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string;

/** Discord adds `frame_id` to the URL when the page runs as an Activity. */
export function inDiscord(): boolean {
  return new URLSearchParams(location.search).has('frame_id');
}

/** Signs the user in through Discord and returns an OAuth access token for our API. */
export async function connect(): Promise<string> {
  const sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
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
  await sdk.commands.authenticate({ access_token });
  return access_token;
}
