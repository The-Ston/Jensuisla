import { beforeEach, describe, expect, it } from 'vitest';
import { ChannelType } from '../src/discord/api';
import { buildNotifications, type NotifyEvent } from '../src/service/notifications';
import type { ProgressUnit } from '../src/domain/types';
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
    signPhoto: async (readingId, photoId) => `signed:${readingId}/${photoId}`,
    onEvent: (e) => events.push(e),
    now: () => clock++,
  });
  return { discord, store, service, events };
}

async function createBook(service: Service, unit: ProgressUnit = 'chapter', total = 22) {
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

  it('lets a reader opt into spoilers for one reading: see and write ahead, nothing leaks elsewhere', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 13, null);
    await ctx.service.setProgress(BRUNO, book.id, 5, null);
    await ctx.service.addComment(ALICE, book.id, { position: 12, text: 'plus loin', gif: null });
    await expect(ctx.service.addComment(BRUNO, book.id, { position: 9, text: 'en avance', gif: null })).rejects.toThrow(HttpError);

    await ctx.service.setSpoilers(BRUNO, book.id, true);
    const view = await ctx.service.readingView(BRUNO, book.id);
    expect(view.me?.spoilers).toBe(true);
    expect(view.comments.map((c) => c.text)).toEqual(['plus loin']);
    const ahead = await ctx.service.addComment(BRUNO, book.id, { position: 9, text: 'en avance', gif: null });
    await ctx.service.toggleReaction(BRUNO, book.id, ahead.id, '👍');
    expect((await ctx.service.home(BRUNO)).readings[0]!.unread).toBe(0); // the badge ignores spoilers

    // Others only see it once they reach it, as usual.
    expect((await ctx.service.readingView(ALICE, book.id)).comments.map((c) => c.text)).toEqual(['en avance', 'plus loin']);

    // Progress changes keep the choice; turning it off hides everything past the progress again.
    await ctx.service.setProgress(BRUNO, book.id, 6, null);
    expect((await ctx.service.readingView(BRUNO, book.id)).me?.spoilers).toBe(true);
    await ctx.service.setSpoilers(BRUNO, book.id, false);
    expect((await ctx.service.readingView(BRUNO, book.id)).comments).toEqual([]);
  });

  it('moves the progress to a comment written ahead, when the reader asked for it', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(BRUNO, book.id, 5, null);
    await ctx.service.setSpoilers(BRUNO, book.id, true);
    await ctx.service.addComment(BRUNO, book.id, { position: 8, text: 'sans suivre', gif: null });
    expect((await ctx.service.readingView(BRUNO, book.id)).me?.progress).toBe(5);

    await ctx.service.setAutoAdvance(BRUNO, book.id, true);
    await ctx.service.addComment(BRUNO, book.id, { position: 3, text: 'en arrière', gif: null });
    expect((await ctx.service.readingView(BRUNO, book.id)).me?.progress).toBe(5); // never moves back
    await ctx.service.addComment(BRUNO, book.id, { position: 9, text: 'je suis là', gif: null });
    expect((await ctx.service.readingView(BRUNO, book.id)).me).toMatchObject({ progress: 9, autoAdvance: true });

    // It can be undone like any progress change.
    await ctx.service.undoProgress(BRUNO, book.id);
    expect((await ctx.service.readingView(BRUNO, book.id)).me?.progress).toBe(5);

    // Without spoilers, the option does nothing, even left on: writing ahead is refused and the
    // progress stays put.
    await ctx.service.setSpoilers(BRUNO, book.id, false);
    await expect(ctx.service.addComment(BRUNO, book.id, { position: 9, text: 'non', gif: null })).rejects.toThrow(HttpError);
    await ctx.service.addComment(BRUNO, book.id, { position: 5, text: 'ici', gif: null });
    expect((await ctx.service.readingView(BRUNO, book.id)).me).toMatchObject({ progress: 5, autoAdvance: true, spoilers: false });

    // Turning spoilers back on brings the option back as it was.
    await ctx.service.setSpoilers(BRUNO, book.id, true);
    await ctx.service.addComment(BRUNO, book.id, { position: 11, text: 'de retour', gif: null });
    expect((await ctx.service.readingView(BRUNO, book.id)).me?.progress).toBe(11);
  });

  it('counts unread comments on the home page: visible, by others, since the last visit', async () => {
    const book = await createBook(ctx.service);
    await ctx.service.setProgress(ALICE, book.id, 13, null);
    await ctx.service.setProgress(BRUNO, book.id, 5, null);
    await ctx.service.addComment(ALICE, book.id, { position: 2, text: 'avant', gif: null });
    await ctx.service.markVisited(BRUNO, book.id);
    await ctx.service.addComment(ALICE, book.id, { position: 3, text: 'lisible', gif: null });
    await ctx.service.addComment(ALICE, book.id, { position: 12, text: 'trop loin', gif: null });
    await ctx.service.addComment(BRUNO, book.id, { position: 4, text: 'le mien', gif: null });

    const unread = async (userId: string) => (await ctx.service.home(userId)).readings.find((r) => r.id === book.id)?.unread;
    expect(await unread(BRUNO)).toBe(1);
    expect(await unread(CHLOE)).toBe(0); // not a participant
    await ctx.service.markVisited(BRUNO, book.id);
    expect(await unread(BRUNO)).toBe(0);
  });

  it('keeps each reader’s appearance, defaulting to the night theme', async () => {
    expect((await ctx.service.home(BRUNO)).me.appearance).toEqual({ theme: 'night', accent: null });
    await ctx.service.setNotify(BRUNO, 'none');
    await ctx.service.setAppearance(BRUNO, 'paper', 'coral');
    await ctx.service.setAppearance(ALICE, 'day', null);

    const reloaded = await setup(ctx.discord);
    expect((await reloaded.service.home(BRUNO)).me.appearance).toEqual({ theme: 'paper', accent: 'coral' });
    expect((await reloaded.service.home(ALICE)).me.appearance).toEqual({ theme: 'day', accent: null });
    expect(reloaded.store.users.get(BRUNO)?.value.notify).toBe('none');
    await expect(ctx.service.setAppearance(BRUNO, 'neon' as never, null)).rejects.toThrow(HttpError);
  });

  it('shows each author’s comment color to every reader', async () => {
    const book = await createBook(ctx.service);
    expect((await ctx.service.home(ALICE)).me.commentColor).toBeNull();
    await ctx.service.setCommentColor(ALICE, 'red');
    expect((await ctx.service.home(ALICE)).me.commentColor).toBe('red');

    await ctx.service.setProgress(ALICE, book.id, 3, null);
    await ctx.service.setProgress(BRUNO, book.id, 3, null);
    await ctx.service.addComment(ALICE, book.id, { position: 2, text: 'en rouge', gif: null });
    const members = (await ctx.service.readingView(BRUNO, book.id)).members;
    expect(members[ALICE]?.commentColor).toBe('red');
    expect(members[BRUNO]?.commentColor).toBeNull();

    const reloaded = await setup(ctx.discord);
    expect((await reloaded.service.home(ALICE)).me.commentColor).toBe('red');
    await ctx.service.setCommentColor(ALICE, null);
    expect((await ctx.service.home(ALICE)).me.commentColor).toBeNull();
    await expect(ctx.service.setCommentColor(ALICE, 'fuchsia' as never)).rejects.toThrow(HttpError);
    await expect(ctx.service.setAppearance(BRUNO, 'day', '#ff0000' as never)).rejects.toThrow(HttpError);
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

  describe('photos', () => {
    const jpeg = { data: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' };

    it('attaches uploaded photos and only signs visible ones', async () => {
      const book = await createBook(ctx.service);
      await ctx.service.setProgress(ALICE, book.id, 10, null);
      await ctx.service.setProgress(BRUNO, book.id, 5, null);
      const a = await ctx.service.uploadPhoto(ALICE, book.id, jpeg, 800, 600);
      const b = await ctx.service.uploadPhoto(ALICE, book.id, jpeg, 600, 800);
      await ctx.service.addComment(ALICE, book.id, { position: 9, text: '', gif: null, photos: [a.id, b.id] });

      const alice = await ctx.service.readingView(ALICE, book.id);
      expect(alice.comments[0]?.photos).toEqual([a, b]);
      expect(alice.photoUrls[a.id]).toBe(`signed:${book.id}/${a.id}`);
      // Bruno is at 5: no comment, no photo link.
      expect((await ctx.service.readingView(BRUNO, book.id)).photoUrls).toEqual({});
      expect(ctx.events.at(-1)?.kind).toBe('photo');
    });

    it('refuses photos of others, reused ones and wrong files', async () => {
      const book = await createBook(ctx.service);
      await ctx.service.setProgress(ALICE, book.id, 3, null);
      await ctx.service.setProgress(BRUNO, book.id, 3, null);
      const mine = await ctx.service.uploadPhoto(ALICE, book.id, jpeg, 1, 1);
      await expect(ctx.service.addComment(BRUNO, book.id, { position: 1, text: 'x', gif: null, photos: [mine.id] })).rejects.toThrow(
        /introuvable/,
      );
      await ctx.service.addComment(ALICE, book.id, { position: 1, text: 'x', gif: null, photos: [mine.id] });
      await expect(ctx.service.addComment(ALICE, book.id, { position: 1, text: 'y', gif: null, photos: [mine.id] })).rejects.toThrow(
        /introuvable/,
      );
      await expect(ctx.service.uploadPhoto(ALICE, book.id, { ...jpeg, contentType: 'image/heic' }, 1, 1)).rejects.toThrow(/Format/);
      await expect(
        ctx.service.uploadPhoto(ALICE, book.id, { data: new Uint8Array(10 * 1024 * 1024 + 1), contentType: 'image/png' }, 1, 1),
      ).rejects.toThrow(/lourde/);
      const many = await Promise.all([1, 2, 3, 4, 5].map(() => ctx.service.uploadPhoto(ALICE, book.id, jpeg, 1, 1)));
      await expect(
        ctx.service.addComment(ALICE, book.id, { position: 1, text: 'x', gif: null, photos: many.map((p) => p.id) }),
      ).rejects.toThrow(/4 photos/);
    });

    it('deletes photos removed by an edit or with their comment', async () => {
      const book = await createBook(ctx.service);
      await ctx.service.setProgress(ALICE, book.id, 3, null);
      const a = await ctx.service.uploadPhoto(ALICE, book.id, jpeg, 1, 1);
      const b = await ctx.service.uploadPhoto(ALICE, book.id, jpeg, 1, 1);
      const c = await ctx.service.addComment(ALICE, book.id, { position: 2, text: 'x', gif: null, photos: [a.id, b.id] });
      const photos = ctx.store.readings.get(book.id)!.photos;

      await ctx.service.editComment(ALICE, book.id, c.id, 'x', undefined, [b.id]);
      expect(photos.has(a.id)).toBe(false);
      expect(ctx.store.readings.get(book.id)!.comments.get(c.id)?.photos).toEqual([b]);

      await ctx.service.deleteComment(ALICE, book.id, c.id);
      expect(photos.size).toBe(0);

      // Photos survive a reload from Discord.
      const d = await ctx.service.uploadPhoto(ALICE, book.id, jpeg, 4, 3);
      await ctx.service.addComment(ALICE, book.id, { position: 2, text: '', gif: null, photos: [d.id] });
      const reloaded = await setup(ctx.discord);
      expect(reloaded.store.readings.get(book.id)!.photos.get(d.id)).toMatchObject({ width: 4, height: 3 });
    });

    it('cleans up forgotten uploads', async () => {
      const book = await createBook(ctx.service);
      for (let i = 0; i < 12; i++) await ctx.service.uploadPhoto(ALICE, book.id, jpeg, 1, 1);
      expect(ctx.store.readings.get(book.id)!.photos.size).toBe(8);
    });
  });

  it('converts a personal edition to the reference edition', async () => {
    const book = await createBook(ctx.service, 'page', 352);
    await ctx.service.setProgress(BRUNO, book.id, 120, 410);
    const view = await ctx.service.readingView(BRUNO, book.id);
    // Stored in reference pages, shown back exactly as typed.
    expect(view.me).toMatchObject({ progress: 103, editionTotal: 410, shownProgress: 120 });
    expect(view.reading).toMatchObject({ myShownProgress: 120, myShownTotal: 410 });

    // Notifications use the reader's own pages, marked as approximate.
    await ctx.service.setProgress(ALICE, book.id, 100, null);
    await ctx.service.addComment(ALICE, book.id, { position: 100, text: 'ici', gif: null });
    const out = buildNotifications(ctx.events, ctx.store, (id) => id, () => 'dm');
    expect(out.find((o) => o.kind === 'dm' && o.userId === BRUNO)?.content).toContain('vers la page 116');

    await ctx.service.undoProgress(BRUNO, book.id);
    expect((await ctx.service.readingView(BRUNO, book.id)).me?.shownProgress).toBe(0);
  });

  it('lets a reader follow percent in a page reading', async () => {
    const book = await createBook(ctx.service, 'page', 352);
    await ctx.service.setProgress(BRUNO, book.id, 50, null, 'percent');
    const view = await ctx.service.readingView(BRUNO, book.id);
    expect(view.me).toMatchObject({ progress: 176, unit: 'percent', editionTotal: 100, shownProgress: 50 });
    expect(view.reading).toMatchObject({ myUnit: 'percent', myShownProgress: 50, myShownTotal: 100 });

    // Positions and mentions reach them in percent.
    await ctx.service.setProgress(ALICE, book.id, 100, null);
    await ctx.service.addComment(ALICE, book.id, { position: 100, text: 'cf [[p:35]]', gif: null });
    const out = buildNotifications(ctx.events, ctx.store, (id) => id, () => 'dm');
    const dm = out.find((o) => o.kind === 'dm' && o.userId === BRUNO)?.content;
    expect(dm).toContain('vers 28 %');
    expect(dm).toContain('cf ≈ 10 %');

    // Back to pages.
    await ctx.service.setProgress(BRUNO, book.id, 200, null, 'page');
    expect((await ctx.service.readingView(BRUNO, book.id)).me).toMatchObject({ progress: 200, unit: 'page', editionTotal: null });
  });

  it('lets a reader follow pages in a percent reading', async () => {
    const book = await createBook(ctx.service, 'percent', 100);
    await expect(ctx.service.setProgress(BRUNO, book.id, 120, null, 'page')).rejects.toThrow(/nombre de pages/);
    await ctx.service.setProgress(BRUNO, book.id, 176, 352, 'page');
    expect((await ctx.service.readingView(BRUNO, book.id)).me).toMatchObject({
      progress: 50,
      unit: 'page',
      editionTotal: 352,
      shownProgress: 176,
    });
  });

  it('keeps chapter readers in chapters', async () => {
    const book = await createBook(ctx.service, 'chapter', 22);
    await ctx.service.setProgress(BRUNO, book.id, 5, null, 'percent');
    expect((await ctx.service.readingView(BRUNO, book.id)).me).toMatchObject({ progress: 5, unit: 'chapter', editionTotal: null });
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

describe('edits sent after answering', () => {
  it('answers from memory, then sends one edit per record however many were made', async () => {
    const discord = new FakeDiscord();
    let flushes = 0;
    const store = await DataStore.load(discord, { guildId: GUILD, botUserId: BOT, onPendingEdits: () => flushes++ });
    const service = new Service({
      store,
      members: async () => members(),
      emojis: async () => new Map(),
      signPhoto: async () => '',
      onEvent: () => undefined,
    });
    const book = await createBook(service);
    await service.setProgress(BRUNO, book.id, 1, null); // first save creates the record, right away

    const before = discord.calls;
    for (const on of [true, false, true, false, true]) await service.setSpoilers(BRUNO, book.id, on);
    await service.setProgress(BRUNO, book.id, 4, null);
    // Nothing sent yet, but the reader already sees the result.
    expect(discord.calls).toBe(before);
    expect(flushes).toBeGreaterThan(0);
    expect((await service.readingView(BRUNO, book.id)).me).toMatchObject({ progress: 4, spoilers: true });

    await store.flush();
    expect(discord.calls).toBe(before + 1);
    expect(store.hasPendingEdits).toBe(false);
    const reloaded = await setup(discord);
    expect((await reloaded.service.readingView(BRUNO, book.id)).me).toMatchObject({ progress: 4, spoilers: true });
  });

  it('retries a failed edit a few times, then gives up without blocking the others', async () => {
    const discord = new FakeDiscord();
    const store = await DataStore.load(discord, { guildId: GUILD, botUserId: BOT, onPendingEdits: () => undefined });
    const service = new Service({
      store,
      members: async () => members(),
      emojis: async () => new Map(),
      signPhoto: async () => '',
      onEvent: () => undefined,
    });
    const book = await createBook(service);
    await service.setProgress(ALICE, book.id, 1, null);
    await service.setProgress(BRUNO, book.id, 1, null);
    await store.flush();

    const edit = discord.editMessage.bind(discord);
    let failures = 0;
    discord.editMessage = async (channelId, messageId, body) => {
      if (body.content?.includes(`"userId":"${ALICE}"`)) {
        failures++;
        throw new Error('discord down');
      }
      return edit(channelId, messageId, body);
    };
    await service.setProgress(ALICE, book.id, 5, null);
    await service.setProgress(BRUNO, book.id, 6, null);
    await store.flush();
    expect(failures).toBe(3);
    expect(store.hasPendingEdits).toBe(false);
    expect((await (await setup(discord)).service.readingView(BRUNO, book.id)).me?.progress).toBe(6);
  });
});
