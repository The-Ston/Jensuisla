<script lang="ts">
  import { tick } from 'svelte';
  import type { Comment, Gif, MemberView, ProgressUnit } from '$shared/api-types';
  import { REACTION_EMOJIS } from '$shared/domain/limits';
  import { parseCustomKey } from '$shared/domain/reactions';
  import { emojis } from '../lib/emojis.svelte';
  import { img, positionText, timeAgo } from '../lib/format';
  import Avatar from './Avatar.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import ReactionGlyph from './ReactionGlyph.svelte';
  import FavoriteStar from './FavoriteStar.svelte';
  import GifPicker from './GifPicker.svelte';

  let {
    comment,
    members,
    unit,
    meId,
    canModerate,
    onReact,
    onReply,
    onEdit,
    onDelete,
  }: {
    comment: Comment;
    members: Record<string, MemberView>;
    unit: ProgressUnit;
    meId: string;
    canModerate: boolean;
    onReact: (emoji: string) => Promise<void>;
    /** Prepares the composer to answer at this comment's position. */
    onReply: () => void;
    onEdit: (text: string, gif: Gif | null) => Promise<void>;
    onDelete: () => Promise<void>;
  } = $props();

  let picking = $state(false);
  let editing = $state(false);
  let draft = $state('');
  let draftGif = $state<Gif | null>(null);
  let pickingGif = $state(false);
  let busy = $state(false);
  let error = $state('');
  // Inline confirmation: browser dialogs may be blocked inside the Activity iframe.
  let confirming = $state(false);
  let textarea: HTMLTextAreaElement | undefined = $state();

  const author = $derived(members[comment.authorId]);
  const mine = $derived(comment.authorId === meId);
  const reactions = $derived(Object.entries(comment.reactions).filter(([, ids]) => ids.length > 0));

  const names = (ids: string[]) => ids.map((id) => members[id]?.name ?? '?').join(', ');
  const emojiLabel = (key: string) => {
    const custom = parseCustomKey(key);
    return custom ? `:${custom.name}:` : key;
  };

  let pickingAll = $state(false);

  async function react(key: string) {
    picking = false;
    emojis.remember(key);
    await run(() => onReact(key));
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error = '';
    try {
      await action();
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Action impossible';
      return false;
    } finally {
      busy = false;
    }
  }

  async function startEdit() {
    draft = comment.text;
    draftGif = comment.gif;
    pickingGif = false;
    confirming = false;
    editing = true;
    await tick();
    textarea?.focus();
  }

  function cancelEdit() {
    editing = false;
    pickingGif = false;
    error = '';
  }

  async function saveEdit(event?: SubmitEvent) {
    event?.preventDefault();
    if (await run(() => onEdit(draft, draftGif))) editing = false;
  }

  function onEditKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void saveEdit();
    }
  }
</script>

<article class:editing>
  <Avatar member={author} size={36} />
  <div class="body">
    <div class="meta">
      <strong>{author?.name ?? 'Ancien membre'}</strong>
      <span class="muted">{positionText(unit, comment.position)} · {timeAgo(comment.createdAt)}{comment.editedAt ? ' · modifié' : ''}</span>
    </div>

    {#if editing}
      <form class="edit" onsubmit={saveEdit}>
        <label class="sr-only" for="edit-{comment.id}">Modifier le commentaire</label>
        <textarea
          id="edit-{comment.id}"
          class="input"
          rows="3"
          maxlength="1000"
          placeholder="Texte du commentaire"
          bind:value={draft}
          bind:this={textarea}
          onkeydown={onEditKey}
        ></textarea>

        {#if pickingGif}
          <GifPicker
            onPick={(g) => {
              draftGif = g;
              pickingGif = false;
            }}
            onClose={() => (pickingGif = false)}
          />
        {:else}
          <div class="gif-edit">
            {#if draftGif}
              <img src={img(draftGif.previewUrl)} alt={draftGif.title || 'GIF'} />
              <button type="button" class="btn small" onclick={() => (pickingGif = true)}>Changer le GIF</button>
              <button type="button" class="btn small ghost" onclick={() => (draftGif = null)}>Retirer le GIF</button>
            {:else}
              <button type="button" class="btn small" onclick={() => (pickingGif = true)}>Ajouter un GIF</button>
            {/if}
          </div>
        {/if}

        <div class="row">
          <span class="muted hint">Échap pour annuler · Ctrl+Entrée pour enregistrer</span>
          <button type="button" class="btn small" onclick={cancelEdit}>Annuler</button>
          <button class="btn small primary" disabled={busy || (!draft.trim() && !draftGif)}>Enregistrer</button>
        </div>
      </form>
    {:else}
      {#if comment.text}<p>{comment.text}</p>{/if}
      {#if comment.gif}
        <div class="gif-box">
          <img
            class="gif"
            src={img(comment.gif.url)}
            alt={comment.gif.title || 'GIF'}
            width={comment.gif.width || undefined}
            height={comment.gif.height || undefined}
            loading="lazy"
          />
          <FavoriteStar gif={comment.gif} />
        </div>
      {/if}

      <div class="reactions">
        {#each reactions as [emoji, ids] (emoji)}
          <button
            class="pill"
            class:mine={ids.includes(meId)}
            title={names(ids)}
            aria-pressed={ids.includes(meId)}
            aria-label="{emojiLabel(emoji)} {ids.length} : {names(ids)}"
            disabled={busy}
            onclick={() => react(emoji)}><ReactionGlyph emojiKey={emoji} size={16} /> {ids.length}</button
          >
        {/each}
        <button class="pill add" aria-label="Ajouter une réaction" aria-expanded={picking} onclick={() => (picking = !picking)}>
          +
        </button>
      </div>

      {#if pickingAll}
        <EmojiPicker
          onPick={(key) => {
            pickingAll = false;
            void react(key);
          }}
          onClose={() => (pickingAll = false)}
        />
      {:else if picking}
        <div class="picker" role="group" aria-label="Choisir une réaction">
          {#each REACTION_EMOJIS as emoji (emoji)}
            <button disabled={busy} aria-label={emoji} onclick={() => react(emoji)}><ReactionGlyph emojiKey={emoji} size={22} /></button>
          {/each}
          <button
            class="more"
            title="Tous les emoji"
            onclick={() => {
              picking = false;
              pickingAll = true;
            }}>Plus…</button
          >
        </div>
      {/if}

      <div class="actions">
        <button class="action" onclick={onReply}>Répondre</button>
        {#if mine}
          <button class="action" onclick={startEdit}>Modifier</button>
        {/if}
        {#if mine || canModerate}
          {#if confirming}
            <button class="action danger" disabled={busy} onclick={() => run(onDelete)}>Oui, supprimer</button>
            <button class="action" onclick={() => (confirming = false)}>Non</button>
          {:else}
            <button class="action" onclick={() => (confirming = true)}>Supprimer</button>
          {/if}
        {/if}
      </div>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
  </div>
</article>

<style>
  article {
    display: flex;
    gap: 12px;
    padding: 6px;
    margin: -6px;
    border-radius: 10px;
  }
  article.editing {
    background: var(--surface-2);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .meta {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .meta .muted {
    font-size: 12px;
  }
  p {
    margin: 0;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .gif-box {
    position: relative;
    width: fit-content;
    max-width: min(100%, 280px);
  }
  .gif {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
  .reactions,
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .pill {
    min-height: 30px;
    padding: 0 10px;
    border-radius: 15px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-size: 13px;
  }
  .pill.mine {
    border-color: var(--accent);
    background: rgba(232, 163, 61, 0.18);
  }
  .pill.add {
    color: var(--muted);
  }
  .action {
    min-height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
  }
  .action:hover {
    color: var(--text);
    background: var(--surface-2);
    border-color: var(--border-strong);
  }
  .action.danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  .picker {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 6px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    width: fit-content;
  }
  .picker button {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 20px;
  }
  .picker button:hover {
    background: var(--border-strong);
  }
  .picker .more {
    width: auto;
    padding: 0 10px;
    font-size: 13px;
    color: var(--muted);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gif-edit {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .gif-edit img {
    height: 72px;
    border-radius: 6px;
  }
  .row {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
  }
  .hint {
    font-size: 12px;
    margin-right: auto;
  }
</style>
