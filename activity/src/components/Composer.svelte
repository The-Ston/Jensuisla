<script lang="ts">
  import { tick } from 'svelte';
  import type { Comment, Gif } from '$shared/api-types';
  import { img } from '../lib/format';
  import { fromDisplay, scaleLabel, toDisplay, type Scale } from '../lib/scale';
  import GifPicker from './GifPicker.svelte';
  import PhotoAttach, { type AttachItem } from './PhotoAttach.svelte';
  import RichInput from './RichInput.svelte';

  let {
    readingId,
    scale,
    max,
    position = $bindable(),
    replyTo = $bindable(),
    replyAuthor = '',
    onSend,
  }: {
    readingId: string;
    /** Positions are reference positions; the reader sees and types them in their own scale. */
    scale: Scale;
    /** Furthest position the reader may write at (their progress). */
    max: number;
    position: number;
    /** Comment being answered, if any. */
    replyTo: Comment | null;
    replyAuthor?: string;
    onSend: (text: string, gif: Gif | null, position: number, replyTo: string | null, photos: string[]) => Promise<void>;
  } = $props();

  let photos = $state<AttachItem[]>([]);
  let attach: { open: () => void } | undefined = $state();
  const photosBusy = $derived(photos.some((p) => p.uploading));
  const photoIds = $derived(photos.filter((p) => p.ref && !p.error).map((p) => p.ref!.id));

  // A reply may not be placed before the message it answers (it would reveal it too early).
  const min = $derived(replyTo ? replyTo.position : 0);

  let text = $state('');
  let gif = $state<Gif | null>(null);
  let sending = $state(false);
  let error = $state('');
  let picking = $state(false);
  let input: { focus: () => void; finalize: () => string } | undefined = $state();
  let form: HTMLFormElement | undefined = $state();

  let editingPosition = $state(false);
  let positionDraft = $state(0);
  let positionInput: HTMLInputElement | undefined = $state();

  export function focus() {
    input?.focus();
  }

  async function openPosition() {
    positionDraft = toDisplay(scale, position);
    editingPosition = true;
    await tick();
    positionInput?.select();
  }

  function commitPosition() {
    if (!editingPosition) return;
    if (Number.isFinite(positionDraft))
      position = Math.max(min, Math.min(max, fromDisplay(scale, Math.round(positionDraft))));
    editingPosition = false;
    input?.focus();
  }

  function onPositionKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitPosition();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      editingPosition = false;
      input?.focus();
    }
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    text = input?.finalize() ?? text;
    if (photosBusy) return (error = 'Patiente, les photos sont encore en cours d’envoi');
    if (!text.trim() && !gif && photoIds.length === 0) return;
    if (text.length > 1000) return (error = 'Commentaire trop long (1000 caractères maximum)');
    sending = true;
    error = '';
    try {
      await onSend(text, gif, Math.max(min, position), replyTo?.id ?? null, photoIds);
      text = '';
      gif = null;
      replyTo = null;
      photos = [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Envoi impossible';
    } finally {
      sending = false;
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form?.requestSubmit();
    } else if (event.key === 'Escape' && replyTo) {
      event.preventDefault();
      replyTo = null;
    }
  }
</script>

<div class="composer">
  {#if picking}
    <GifPicker
      onPick={(g) => {
        gif = g;
        picking = false;
        input?.focus();
      }}
      onClose={() => (picking = false)}
    />
  {/if}

  {#if gif}
    <div class="attached">
      <img src={img(gif.previewUrl)} alt={gif.title || 'GIF'} />
      <button type="button" class="btn small" onclick={() => (picking = true)}>Changer</button>
      <button type="button" class="btn small ghost" onclick={() => (gif = null)}>Retirer</button>
    </div>
  {/if}

  <PhotoAttach {readingId} bind:items={photos} bind:this={attach} />

  {#if replyTo}
    <div class="replying">
      <span>Réponse à <strong>{replyAuthor || 'ce message'}</strong></span>
      <button type="button" class="cancel-reply" aria-label="Annuler la réponse" title="Annuler la réponse (Échap)" onclick={() => (replyTo = null)}>✕</button>
    </div>
  {/if}

  <form class="box" class:with-reply={!!replyTo} onsubmit={send} bind:this={form}>
    <div class="anchor">
      {#if editingPosition}
        <label class="sr-only" for="comment-position">
          Position du commentaire ({toDisplay(scale, min)} à {toDisplay(scale, max)}{scale.edition ? ', pages de ton édition' : ''})
        </label>
        <input
          id="comment-position"
          class="position-input"
          type="number"
          min={toDisplay(scale, min)}
          max={toDisplay(scale, max)}
          bind:value={positionDraft}
          bind:this={positionInput}
          onkeydown={onPositionKey}
          onblur={commitPosition}
        />
      {:else}
        <button
          type="button"
          class="chip"
          title="Changer la position du commentaire"
          aria-label="Position : {scaleLabel(scale, position)}. Cliquer pour changer"
          onclick={openPosition}
        >
          {scaleLabel(scale, position)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
        </button>
      {/if}
    </div>
    <RichInput
      id="comment-text"
      label="Commentaire"
      placeholder={scale.unit === 'page'
        ? 'Écrire un commentaire… (p.25 devient une page cliquable)'
        : scale.unit === 'chapter'
          ? 'Écrire un commentaire… (ch.3 devient un chapitre cliquable)'
          : 'Écrire un commentaire…'}
      {scale}
      bind:value={text}
      bind:this={input}
      onKeydown={onKey}
    />
    <button type="button" class="btn icon-btn" title="Ajouter des photos (4 max)" aria-label="Ajouter des photos" onclick={() => attach?.open()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"></path><circle cx="12" cy="13" r="4"></circle></svg>
    </button>
    <button type="button" class="btn gif-btn" class:on={picking} aria-pressed={picking} onclick={() => (picking = !picking)}>
      GIF
    </button>
    <button class="btn primary" disabled={sending || photosBusy || (!text.trim() && !gif && photoIds.length === 0)}>
      {photosBusy ? 'Envoi…' : 'Envoyer'}
    </button>
  </form>
  {#if error}<p class="error">{error}</p>{/if}
</div>

<style>
  .composer {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .box {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 6px;
    border-radius: 10px;
    border: 1px solid var(--border-strong);
    background: var(--bg);
  }
  .box:focus-within {
    border-color: var(--hover);
  }
  .box.with-reply {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    margin-top: -8px;
  }
  .replying {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 6px 4px 12px;
    border-radius: 10px 10px 0 0;
    border: 1px solid var(--border-strong);
    border-bottom: 0;
    background: var(--surface-2);
    font-size: 13px;
    color: var(--muted);
  }
  .replying strong {
    color: var(--text);
  }
  .cancel-reply {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: var(--border-strong);
    font-size: 12px;
  }
  .anchor {
    flex-shrink: 0;
    align-self: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    border-radius: 16px;
    border: 1px solid var(--me);
    background: var(--me-soft);
    color: var(--me);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .chip:hover {
    background: var(--me-strong);
  }
  .position-input {
    width: 84px;
    height: 32px;
    padding: 0 8px;
    border-radius: 16px;
    border: 1px solid var(--me);
    background: var(--surface);
  }
  .box :global(.rich) {
    align-self: center;
  }
  .icon-btn {
    padding: 0 10px;
  }
  .gif-btn.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .attached {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .attached img {
    height: 72px;
    border-radius: 6px;
  }
  p {
    margin: 0;
  }
  @media (max-width: 520px) {
    .box {
      flex-wrap: wrap;
    }
    .box :global(.rich) {
      flex-basis: 100%;
      order: -1;
    }
  }
</style>
