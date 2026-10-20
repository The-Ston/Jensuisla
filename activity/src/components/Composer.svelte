<script lang="ts">
  import type { Gif } from '$shared/api-types';
  import { api } from '../lib/api';
  import { img } from '../lib/format';

  let { anchorLabel, onSend }: { anchorLabel: string; onSend: (text: string, gif: Gif | null) => Promise<void> } =
    $props();

  let text = $state('');
  let gif = $state<Gif | null>(null);
  let sending = $state(false);
  let error = $state('');

  let picking = $state(false);
  let gifQuery = $state('');
  let gifs = $state<Gif[]>([]);
  let gifError = $state('');
  let loadingGifs = $state(false);

  async function send(event: SubmitEvent) {
    event.preventDefault();
    if (!text.trim() && !gif) return;
    sending = true;
    error = '';
    try {
      await onSend(text, gif);
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

  async function searchGifs(event?: SubmitEvent) {
    event?.preventDefault();
    loadingGifs = true;
    gifError = '';
    try {
      gifs = await api.gifs(gifQuery.trim());
    } catch (e) {
      gifError = e instanceof Error ? e.message : 'GIF indisponibles';
    } finally {
      loadingGifs = false;
    }
  }

  function togglePicker() {
    picking = !picking;
    if (picking && gifs.length === 0) void searchGifs();
  }
</script>

<div class="composer">
  {#if picking}
    <div class="gif-picker">
      <form class="row" onsubmit={searchGifs}>
        <label class="sr-only" for="gif-search">Chercher un GIF</label>
        <input id="gif-search" class="input" placeholder="Chercher un GIF…" bind:value={gifQuery} />
        <button class="btn" disabled={loadingGifs}>Chercher</button>
      </form>
      {#if gifError}<p class="error">{gifError}</p>{/if}
      <div class="gif-grid">
        {#each gifs as g (g.id)}
          <button
            type="button"
            onclick={() => {
              gif = g;
              picking = false;
            }}
          >
            <img src={img(g.previewUrl)} alt={g.title || 'GIF'} loading="lazy" />
          </button>
        {/each}
      </div>
      <p class="muted powered">Via GIPHY</p>
    </div>
  {/if}

  {#if gif}
    <div class="attached">
      <img src={img(gif.previewUrl)} alt={gif.title || 'GIF'} />
      <button type="button" class="btn small ghost" onclick={() => (gif = null)}>Retirer le GIF</button>
    </div>
  {/if}

  <form class="row" onsubmit={send}>
    <label class="sr-only" for="comment-text">Commentaire</label>
    <textarea
      id="comment-text"
      class="input"
      rows="1"
      maxlength="1000"
      placeholder="Commenter · {anchorLabel}"
      bind:value={text}
      onkeydown={onKey}
    ></textarea>
    <button type="button" class="btn" aria-expanded={picking} onclick={togglePicker}>GIF</button>
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
  .row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  textarea {
    min-height: 44px;
    max-height: 160px;
  }
  .gif-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .gif-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
    max-height: 240px;
    overflow-y: auto;
  }
  .gif-grid button {
    padding: 0;
    border: 0;
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
    height: 96px;
  }
  .gif-grid img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .attached {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .attached img {
    height: 72px;
    border-radius: 6px;
  }
  .powered {
    margin: 0;
    font-size: 11px;
    text-align: right;
  }
  p {
    margin: 0;
  }
</style>
