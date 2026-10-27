<script lang="ts">
  import { tick } from 'svelte';
  import type { Comment, Gif, MemberView } from '$shared/api-types';
  import { REACTION_EMOJIS } from '$shared/domain/limits';
  import { parseCustomKey } from '$shared/domain/reactions';
  import { emojis } from '../lib/emojis.svelte';
  import { img, timeAgo } from '../lib/format';
  import { scaleLabel, type Scale } from '../lib/scale';
  import Avatar from './Avatar.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import ReactionGlyph from './ReactionGlyph.svelte';
  import FavoriteStar from './FavoriteStar.svelte';
  import GifPicker from './GifPicker.svelte';
  import PhotoAttach, { existingItems, type AttachItem } from './PhotoAttach.svelte';
  import PhotoGrid from './PhotoGrid.svelte';
  import RichInput from './RichInput.svelte';
  import { renderPageRefs, splitPageRefs } from '$shared/domain/page-refs';

  let {
    comment,
    members,
    scale,
    meId,
    canModerate,
    original,
    highlighted = false,
    spoiler = false,
    myProgress,
    onJump,
    onJumpToPosition,
    onReact,
    onReply,
    readingId,
    photoUrls,
    onEdit,
    onDelete,
  }: {
    comment: Comment;
    members: Record<string, MemberView>;
    scale: Scale;
    meId: string;
    canModerate: boolean;
    /** The comment this one replies to: undefined if not a reply, null if it was deleted. */
    original: Comment | null | undefined;
    highlighted?: boolean;
    /** Anchored past the reader's progress, shown because they chose to see spoilers. */
    spoiler?: boolean;
    /** How far the reader can see: page mentions beyond it are not clickable. */
    myProgress: number;
    onJump: (commentId: string) => void;
    onJumpToPosition: (position: number) => void;
    onReact: (emoji: string) => Promise<void>;
    /** Prepares the composer to answer at this comment's position. */
    onReply: () => void;
    readingId: string;
    photoUrls: Record<string, string>;
    onEdit: (text: string, gif: Gif | null, photos: string[]) => Promise<void>;
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
  let textarea: { focus: () => void; finalize: () => string } | undefined = $state();

  /** "p. 25" in the reader's edition ("p. ≈ 34" when converted), or "ch. 3". */
  const pageLabel = (position: number) =>
    scaleLabel(scale, position).replace(/^Page /, 'p. ').replace(/^Chapitre /, 'ch. ');

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

  let draftPhotos = $state<AttachItem[]>([]);
  let attach: { open: () => void; discardNew: () => void } | undefined = $state();
  const photosBusy = $derived(draftPhotos.some((p) => p.uploading));
  const hasDraftPhotos = $derived(draftPhotos.some((p) => p.ref && !p.error));

  async function startEdit() {
    draft = comment.text;
    draftGif = comment.gif;
    draftPhotos = existingItems(comment.photos ?? [], photoUrls);
    pickingGif = false;
    confirming = false;
    editing = true;
    await tick();
    textarea?.focus();
  }

  function cancelEdit() {
    // Photos added during this edit were uploaded already: drop them.
    attach?.discardNew();
    editing = false;
    pickingGif = false;
    error = '';
  }

  async function saveEdit(event?: SubmitEvent) {
    event?.preventDefault();
    if (photosBusy) return;
    draft = textarea?.finalize() ?? draft;
    const photos = draftPhotos.filter((p) => p.ref && !p.error).map((p) => p.ref!.id);
    if (await run(() => onEdit(draft, draftGif, photos))) editing = false;
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

<article id="comment-{comment.id}" class:editing class:highlighted class:spoiler class:reply={original !== undefined}>
  {#if original !== undefined}
    <div class="quote">
      <span class="elbow" aria-hidden="true"></span>
      {#if original}
        <button class="quote-link" title="Aller au message d’origine" onclick={() => onJump(original.id)}>
          <Avatar member={members[original.authorId]} size={16} />
          <strong>{members[original.authorId]?.name ?? 'Ancien membre'}</strong>
          <span class="excerpt">{renderPageRefs(original.text, pageLabel) || (original.photos?.length ? 'Photo' : original.gif ? 'GIF' : '')}</span>
        </button>
      {:else}
        <span class="muted deleted">Message supprimé</span>
      {/if}
    </div>
  {/if}
  <Avatar member={author} size={36} />
  <div class="body">
    <div class="meta">
      <strong>{author?.name ?? 'Ancien membre'}</strong>
      <span class="muted">{scaleLabel(scale, comment.position)} · {timeAgo(comment.createdAt)}{comment.editedAt ? ' · modifié' : ''}</span>
      {#if spoiler}<span class="spoiler-tag">Spoiler</span>{/if}
    </div>

    {#if editing}
      <form class="edit" onsubmit={saveEdit}>
        <div class="edit-box">
          <RichInput
            id="edit-{comment.id}"
            label="Modifier le commentaire"
            placeholder="Texte du commentaire"
            {scale}
            bind:value={draft}
            bind:this={textarea}
            onKeydown={onEditKey}
          />
        </div>

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
            <button type="button" class="btn small" onclick={() => attach?.open()}>Ajouter des photos</button>
          </div>
        {/if}

        <PhotoAttach {readingId} bind:items={draftPhotos} bind:this={attach} />

        <div class="row">
          <span class="muted hint">Échap pour annuler · Ctrl+Entrée pour enregistrer</span>
          <button type="button" class="btn small" onclick={cancelEdit}>Annuler</button>
          <button class="btn small primary" disabled={busy || photosBusy || (!draft.trim() && !draftGif && !hasDraftPhotos)}>
            Enregistrer
          </button>
        </div>
      </form>
    {:else}
      {#if comment.text}
        <!-- Kept on one line: the paragraph preserves whitespace (pre-wrap). -->
        <p>{#each splitPageRefs(comment.text) as seg, i (i)}{#if seg.kind === 'text'}{seg.text}{:else if seg.position <= myProgress}<button class="page-ref" title="Aller à ce passage" onclick={() => onJumpToPosition(seg.position)}>{pageLabel(seg.position)}</button>{:else}<span class="page-ref locked" title="Tu n’y es pas encore">{pageLabel(seg.position)} 🔒</span>{/if}{/each}</p>
      {/if}
      {#if comment.photos?.length}
        <PhotoGrid photos={comment.photos} urls={photoUrls} />
      {/if}
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
  article.reply {
    flex-wrap: wrap;
    row-gap: 2px;
  }
  article.spoiler {
    border-left: 2px dashed var(--danger);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  .spoiler-tag {
    align-self: center;
    padding: 0 6px;
    border: 1px solid var(--danger);
    border-radius: 6px;
    color: var(--danger);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  article.highlighted {
    animation: flash 1.6s ease-out;
  }
  @keyframes flash {
    0%,
    40% {
      background: var(--accent-soft);
    }
    100% {
      background: transparent;
    }
  }
  /* Discord-like quote line above a reply. */
  .quote {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-left: 18px;
    min-width: 0;
  }
  .elbow {
    width: 22px;
    height: 10px;
    margin-top: 8px;
    border-left: 2px solid var(--border-strong);
    border-top: 2px solid var(--border-strong);
    border-top-left-radius: 6px;
    flex-shrink: 0;
  }
  .quote-link {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 24px;
    padding: 0 4px;
    border: 0;
    border-radius: 4px;
    background: none;
    font-size: 12px;
    color: var(--muted);
  }
  .quote-link:hover {
    color: var(--text);
  }
  .quote-link strong {
    color: var(--text);
    font-weight: 600;
    flex-shrink: 0;
  }
  .excerpt {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .deleted {
    font-size: 12px;
    font-style: italic;
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
    background: var(--accent-soft);
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
  .edit-box {
    display: flex;
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--bg);
    min-height: 72px;
  }
  .page-ref {
    display: inline;
    padding: 0 6px;
    margin: 0 1px;
    border-radius: 6px;
    border: 1px solid var(--me);
    background: var(--me-soft);
    color: var(--me);
    font: inherit;
    font-weight: 600;
    font-size: 0.92em;
  }
  button.page-ref:hover {
    background: var(--me-strong);
  }
  .page-ref.locked {
    border-color: var(--border-strong);
    background: var(--surface-2);
    color: var(--muted);
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
