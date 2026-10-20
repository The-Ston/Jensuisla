import { beforeEach, describe, expect, it } from 'vitest';
import { ChannelType } from '../src/discord/api';
import { buildNotifications, type NotifyEvent } from '../src/service/notifications';
import { HttpError, Service, type MemberInfo } from '../src/service/service';
import { CATEGORY_NAME, DataStore } from '../src/store/data-store';
import { FakeDiscord } from './fake-discord';

const GUILD = 'g1';
const BOT = 'bot';
const ALICE = 'alice';
const BRUNO = 'bruno';
const CHLOE = 'chloe';

function members(): Map<string, MemberInfo> {
  return new Map(
    [ALICE, BRUNO, CHLOE].map((id) => [id, { id, name: id, avatarUrl: '', isOrganizer: id === ALICE }]),
  );
}

async function setup(discord = new FakeDiscord()) {
  const store = await DataStore.load(discord, { guildId: GUILD, botUserId: BOT });
  const events: NotifyEvent[] = [];
  let clock = 1000;
  const emojis = async () =>
    new Map(discord.emojis.map((e) => [e.id, { id: e.id, name: e.name, animated: !!e.animated }]));
  const service = new Service({
    store,
    members: async () => members(),
    emojis,
    onEvent: (e) => events.push(e),
    now: () => clock++,
  });
  return { discord, store, service, events };
}

async function createBook(service: Service, unit: 'chapter' | 'page' = 'chapter', total = 22) {
  return service.createReading(ALICE, {
    title: 'Le Livre',
    author: 'Quelqu’un',
    coverUrl: null,
    coverData: null,
    unit,
    total,
    joinMode: 'both',
    invitedIds: [BRUNO],
  });
}

describe('Service', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('creates hidden data channels on first load', () => {
    const category = ctx.discord.channels.find((c) => c.type === ChannelType.GuildCategory);
    expect(category?.name).toBe(CATEGORY_NAME);
    expect(category?.overwrites?.find((o) => o.id === GUILD)?.deny).toBe((1n << 10n).toString());
  });

  it('only lets organizers create readings', async () => {
    await expect(
      ctx.service.createReading(BRUNO, {
        title: 'x', author: '', coverUrl: null, coverData: null, unit: 'chapter', total: 3, joinMode: 'open', invitedIds: [],
      }),
    ).rejects.toThrow(HttpError);
  });

  it('gates comments by progress (A at 13, B at 5)', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 13, null);
    await ctx.service.setProgress(BRUNO, book.id, 5, null);
    await ctx.service.addComment(ALICE, book.id, { position: 13, text: 'spoiler!', gif: null });
    await ctx.service.addComment(ALICE, book.id, { position: 4, text: 'ok', gif: null });

    const bruno = await ctx.service.readingView(BRUNO, book.id);
    expect(bruno.comments.map((c) => c.text)).toEqual(['ok']);
    const alice = await ctx.service.readingView(ALICE, book.id);
    expect(alice.comments).toHaveLength(2);

    await expect(ctx.service.addComment(BRUNO, book.id, { position: 6, text: 'trop loin', gif: null })).rejects.toThrow(
      /déjà lu/,
    );
  });

  it('hides comments again after going back, and undo restores', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(BRUNO, book.id, 8, null);
    await ctx.service.addComment(BRUNO, book.id, { position: 8, text: 'ch8', gif: null });
    await ctx.service.setProgress(BRUNO, book.id, 3, null);
    expect((await ctx.service.readingView(BRUNO, book.id)).comments).toHaveLength(0);
    await ctx.service.undoProgress(BRUNO, book.id);
    const view = await ctx.service.readingView(BRUNO, book.id);
    expect(view.me?.progress).toBe(8);
    expect(view.comments).toHaveLength(1);
  });

  it('cannot react to a hidden comment', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 10, null);
    const c = await ctx.service.addComment(ALICE, book.id, { position: 10, text: 'x', gif: null });
    await expect(ctx.service.toggleReaction(BRUNO, book.id, c.id, '❤️')).rejects.toThrow(/introuvable/);
  });

  it('toggles reactions and reloads them from Discord', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 2, null);
    await ctx.service.setProgress(BRUNO, book.id, 2, null);
    const c = await ctx.service.addComment(ALICE, book.id, { position: 1, text: 'x', gif: null });
    await ctx.service.toggleReaction(BRUNO, book.id, c.id, '❤️');
    await ctx.service.toggleReaction(ALICE, book.id, c.id, '❤️');
    await ctx.service.toggleReaction(ALICE, book.id, c.id, '❤️');

    // Fresh load from the same fake Discord: data survives a restart.
    const reloaded = await setup(ctx.discord);
    const view = await reloaded.service.readingView(BRUNO, book.id);
    expect(view.comments[0]?.reactions).toEqual({ '❤️': [BRUNO] });
    expect(view.participants.find((p) => p.userId === BRUNO)?.progress).toBe(2);
  });

  it('edits text and GIF of a comment', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 3, null);
    const gif = { id: 'g', url: 'https://media1.giphy.com/a.gif', previewUrl: 'https://media1.giphy.com/b.gif', width: 1, height: 1, title: 't' };
    const c = await ctx.service.addComment(ALICE, book.id, { position: 2, text: 'hello', gif });

    await ctx.service.editComment(ALICE, book.id, c.id, 'hi'); // keeps the GIF
    expect(ctx.store.readings.get(book.id)!.comments.get(c.id)).toMatchObject({ text: 'hi', gif: { id: 'g' } });
    await ctx.service.editComment(ALICE, book.id, c.id, 'hi', null); // removes it
    expect(ctx.store.readings.get(book.id)!.comments.get(c.id)?.gif).toBeNull();
    await expect(ctx.service.editComment(ALICE, book.id, c.id, '', null)).rejects.toThrow(/invalide/);
    await expect(ctx.service.editComment(BRUNO, book.id, c.id, 'x')).rejects.toThrow(HttpError);
  });

  it('keeps favorite GIFs, newest first, alongside notification preferences', async () => {
    await ctx.service.toggleFavoriteGif(BRUNO, 'abc');
    await ctx.service.toggleFavoriteGif(BRUNO, 'def');
    await ctx.service.setNotify(BRUNO, 'none');
    expect(ctx.service.favoriteGifs(BRUNO).map((g) => g.id)).toEqual(['def', 'abc']);
    expect(ctx.service.favoriteGifs(BRUNO)[0]!.url).toBe('https://media.giphy.com/media/def/200.gif');

    await ctx.service.toggleFavoriteGif(BRUNO, 'abc'); // second toggle removes it
    const reloaded = await setup(ctx.discord);
    expect(reloaded.service.favoriteGifs(BRUNO).map((g) => g.id)).toEqual(['def']);
    expect(reloaded.store.users.get(BRUNO)?.value.notify).toBe('none');
    await expect(ctx.service.toggleFavoriteGif(BRUNO, '../x')).rejects.toThrow(HttpError);
  });

  it('fits the maximum number of favorites in one record', async () => {
    for (let i = 0; i < 70; i++) await ctx.service.toggleFavoriteGif(ALICE, `${'x'.repeat(20)}${i.toString().padStart(4, '0')}`);
    expect(ctx.service.favoriteGifs(ALICE)).toHaveLength(60);
  });

  it('accepts any standard emoji and only real server emojis', async () => {
    ctx.discord.emojis = [{ id: '123456789', name: 'livre' }];
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 2, null);
    const c = await ctx.service.addComment(ALICE, book.id, { position: 1, text: 'x', gif: null });

    for (const emoji of ['🥲', '👍🏽', '🇫🇷', '❤️', '1️⃣', '👨‍👩‍👧']) await ctx.service.toggleReaction(ALICE, book.id, c.id, emoji);
    for (const bad of ['abc', '<b>', '12', '', '😂abc'])
      await expect(ctx.service.toggleReaction(ALICE, book.id, c.id, bad)).rejects.toThrow(/inconnue/);

    // The name sent by the client is replaced by the server's current name.
    await ctx.service.toggleReaction(ALICE, book.id, c.id, 'c:123456789:oldname');
    expect(ctx.store.readings.get(book.id)!.comments.get(c.id)!.reactions['c:123456789:livre']).toEqual([ALICE]);
    await expect(ctx.service.toggleReaction(ALICE, book.id, c.id, 'c:999999999:nope')).rejects.toThrow(/plus sur le serveur/);

    // Once deleted from the server, an emoji can still be removed but not added.
    ctx.discord.emojis = [];
    await ctx.service.toggleReaction(ALICE, book.id, c.id, 'c:123456789:livre');
    expect(ctx.store.readings.get(book.id)!.comments.get(c.id)!.reactions['c:123456789:livre']).toBeUndefined();
    expect((await ctx.service.listEmojis())).toEqual([]);
  });

  it('limits the number of distinct reactions on a comment', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 2, null);
    const c = await ctx.service.addComment(ALICE, book.id, { position: 1, text: 'x', gif: null });
    const faces = [...'😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙🥲'];
    for (const f of faces.slice(0, 20)) await ctx.service.toggleReaction(ALICE, book.id, c.id, f);
    await expect(ctx.service.toggleReaction(ALICE, book.id, c.id, faces[20]!)).rejects.toThrow(/Trop de réactions/);
    // Removing one frees a slot for a new kind.
    await ctx.service.toggleReaction(ALICE, book.id, c.id, faces[0]!);
    await ctx.service.toggleReaction(ALICE, book.id, c.id, faces[20]!);
  });

  it('links replies to their original and never places them earlier', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 13, null);
    await ctx.service.setProgress(BRUNO, book.id, 10, null);
    const original = await ctx.service.addComment(ALICE, book.id, { position: 8, text: 'wow', gif: null });

    await expect(
      ctx.service.addComment(BRUNO, book.id, { position: 5, text: 'avant', gif: null, replyTo: original.id }),
    ).rejects.toThrow(/avant le message/);
    const reply = await ctx.service.addComment(BRUNO, book.id, { position: 9, text: 'oui', gif: null, replyTo: original.id });
    expect(reply.replyTo).toBe(original.id);

    // Cannot reply to something you cannot see.
    const ahead = await ctx.service.addComment(ALICE, book.id, { position: 12, text: 'plus loin', gif: null });
    await expect(
      ctx.service.addComment(BRUNO, book.id, { position: 10, text: 'x', gif: null, replyTo: ahead.id }),
    ).rejects.toThrow(/introuvable/);

    const out = buildNotifications(ctx.events, ctx.store, (id) => id, () => 'dm');
    const toAlice = out.find((o) => o.kind === 'dm' && o.userId === ALICE);
    expect(toAlice?.content).toContain('bruno t’a répondu au chapitre 9 : « oui »');
  });

  it('converts a personal edition to the reference edition', async () => {
    const book = await createBook(ctx.service, 'page', 352);
    await ctx.service.setProgress(BRUNO, book.id, 120, 410);
    const view = await ctx.service.readingView(BRUNO, book.id);
    expect(view.me).toMatchObject({ progress: 103, editionTotal: 410 });
  });

  it('respects invitation-only readings', async () => {
    const book = await ctx.service.createReading(ALICE, {
      title: 'Secret', author: '', coverUrl: null, coverData: null, unit: 'chapter', total: 5, joinMode: 'invite', invitedIds: [],
    });
    await expect(ctx.service.join(CHLOE, book.id)).rejects.toThrow(/invitation/);
    expect((await ctx.service.home(CHLOE)).readings).toHaveLength(0);
    await ctx.service.invite(ALICE, book.id, [CHLOE]);
    expect((await ctx.service.home(CHLOE)).readings).toHaveLength(1);
  });

  it('notifies only readers who reached the position', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.join(CHLOE, book.id);
    await ctx.service.setProgress(ALICE, book.id, 13, null);
    await ctx.service.setProgress(BRUNO, book.id, 5, null);
    await ctx.service.setProgress(CHLOE, book.id, 20, null);
    await ctx.service.setNotify(CHLOE, 'channel');
    await ctx.service.addComment(ALICE, book.id, { position: 13, text: 'wow', gif: null });

    const out = buildNotifications(ctx.events, ctx.store, (id) => id, (id) => ctx.store.users.get(id)?.value.notify ?? 'dm');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'channel', mentionIds: [CHLOE] });
    expect(out[0]!.content).not.toContain('wow'); // no excerpt in the shared channel
  });
});
