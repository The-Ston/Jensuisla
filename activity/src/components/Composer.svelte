<script lang="ts">
  import { tick } from 'svelte';
  import type { Gif, ProgressUnit } from '$shared/api-types';
  import { img, positionText } from '../lib/format';
  import GifPicker from './GifPicker.svelte';

  let {
    unit,
    max,
    position = $bindable(),
    onSend,
  }: {
    unit: ProgressUnit;
    /** Furthest position the reader may write at (their progress). */
    max: number;
    position: number;
    onSend: (text: string, gif: Gif | null, position: number) => Promise<void>;
  } = $props();

  let text = $state('');
  let gif = $state<Gif | null>(null);
  let sending = $state(false);
  let error = $state('');
  let picking = $state(false);
  let textarea: HTMLTextAreaElement | undefined = $state();

  let editingPosition = $state(false);
  let positionDraft = $state(0);
  let positionInput: HTMLInputElement | undefined = $state();

  export function focus() {
    textarea?.focus();
  }

  async function openPosition() {
    positionDraft = position;
    editingPosition = true;
    await tick();
    positionInput?.select();
  }

  function commitPosition() {
    if (!editingPosition) return;
    if (Number.isFinite(positionDraft)) position = Math.max(0, Math.min(max, Math.round(positionDraft)));
    editingPosition = false;
    textarea?.focus();
  }

  function onPositionKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitPosition();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      editingPosition = false;
      textarea?.focus();
    }
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    if (!text.trim() && !gif) return;
    sending = true;
    error = '';
    try {
      await onSend(text, gif, position);
      text = '';
      gif = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Envoi impossible';
    } finally {
      sending = false;
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
    }
  }
</script>

<div class="composer">
  {#if picking}
    <GifPicker
      onPick={(g) => {
        gif = g;
        picking = false;
        textarea?.focus();
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

  <form class="box" onsubmit={send}>
    <div class="anchor">
      {#if editingPosition}
        <label class="sr-only" for="comment-position">Position du commentaire (0 à {max})</label>
        <input
          id="comment-position"
          class="position-input"
          type="number"
          min="0"
          {max}
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
          aria-label="Position : {positionText(unit, position)}. Cliquer pour changer"
          onclick={openPosition}
        >
          {positionText(unit, position)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
        </button>
      {/if}
    </div>
    <label class="sr-only" for="comment-text">Commentaire</label>
    <textarea
      id="comment-text"
      rows="1"
      maxlength="1000"
      placeholder="Écrire un commentaire…"
      bind:value={text}
      bind:this={textarea}
      onkeydown={onKey}
    ></textarea>
    <button type="button" class="btn gif-btn" class:on={picking} aria-pressed={picking} onclick={() => (picking = !picking)}>
      GIF
    </button>
    <button class="btn primary" disabled={sending || (!text.trim() && !gif)}>Envoyer</button>
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
    border-color: #5a5e6a;
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
    background: rgba(106, 169, 255, 0.12);
    color: var(--me);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .chip:hover {
    background: rgba(106, 169, 255, 0.22);
  }
  .position-input {
    width: 84px;
    height: 32px;
    padding: 0 8px;
    border-radius: 16px;
    border: 1px solid var(--me);
    background: var(--surface);
  }
  textarea {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    max-height: 160px;
    padding: 6px 4px;
    border: 0;
    background: transparent;
    resize: none;
    align-self: center;
  }
  textarea:focus-visible {
    outline: none;
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
    textarea {
      flex-basis: 100%;
      order: -1;
    }
  }
</style>
