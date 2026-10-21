import type { Env } from '../env';
import type { DiscordRest } from './rest';

export const LAUNCH_ID = 'jsl:launch';

export const OPEN_BUTTON = [
  { type: 1, components: [{ type: 2, style: 1, label: 'Ouvrir Jensuisla', custom_id: LAUNCH_ID }] },
];

const ENTRY_POINT = 4;
const APP_HANDLER = 1;

/**
 * Makes the launch channel hold one pinned message with the open button, instead of the
 * message Discord posts every time the Activity is launched. Safe to run repeatedly.
 */
export async function ensureLaunchSetup(api: DiscordRest, env: Env): Promise<void> {
  // The entry point answers through our Worker (LAUNCH_ACTIVITY), so Discord posts nothing.
  const commands = await api.listCommands(env.DISCORD_APPLICATION_ID);
  const entry = commands.find((c) => c.type === ENTRY_POINT);
  if (entry && entry.handler !== APP_HANDLER) {
    await api.editCommand(env.DISCORD_APPLICATION_ID, entry.id, { handler: APP_HANDLER });
  }

  const pins = await api.listPins(env.LAUNCH_CHANNEL_ID);
  const hasDoor = pins.some(
    (m) =>
      m.author.id === env.DISCORD_APPLICATION_ID &&
      m.components?.some((row) => row.components?.some((c) => c.custom_id === LAUNCH_ID)),
  );
  if (hasDoor) return;
  const message = await api.createMessage(env.LAUNCH_CHANNEL_ID, {
    content: '📖 **Jensuisla** : nos lectures partagées. Clique sur le bouton pour ouvrir l’activité.',
    components: OPEN_BUTTON,
  });
  try {
    await api.pinMessage(env.LAUNCH_CHANNEL_ID, message.id);
  } catch (err) {
    // Unpinned, it couldn't be found again and would be posted at every start: remove it.
    await api.deleteMessage(env.LAUNCH_CHANNEL_ID, message.id).catch(() => undefined);
    throw err;
  }
}
