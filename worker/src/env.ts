import type { JensuislaStore } from './store-do';

export interface Env {
  ASSETS: Fetcher;
  STORE: DurableObjectNamespace<JensuislaStore>;
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_GUILD_ID: string;
  ORGANIZER_ROLE_ID: string;
  LAUNCH_CHANNEL_ID: string;
  // Secrets
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_SECRET: string;
  GIPHY_API_KEY?: string;
}
