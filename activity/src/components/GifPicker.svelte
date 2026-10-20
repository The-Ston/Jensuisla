<script lang="ts">
  import { onMount } from 'svelte';
  import type { Gif } from '$shared/api-types';
  import { api } from '../lib/api';
  import { img } from '../lib/format';

  let { onPick, onClose }: { onPick: (gif: Gif) => void; onClose: () => void } = $props();

  let query = $state('');
  let gifs = $state<Gif[]>([]);
  let error = $state('');
  let loading = $state(false);
  let input: HTMLInputElement | undefined = $state();

  async function search(event?: SubmitEvent) {
    event?.preventDefault();
    loading = true;
    error = '';
    try {
      gifs = await api.gifs(query.trim());
    } catch (e) {
      error = e instanceof Error ? e.message : 'GIF indisponibles';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    input?.focus();
    void search();
  });

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }
</script>

<div class="picker" role="dialog" aria-label="Choisir un GIF" tabindex="-1" onkeydown={onKey}>
  <div class="head">
    <strong>Choisir un GIF</strong>
    <button type="button" class="close" aria-label="Fermer" onclick={onClose}>✕</button>
  </div>
  <form class="row" onsubmit={search}>
    <label class="sr-only" for="gif-search">Chercher un GIF</label>
    <input id="gif-search" class="input" placeholder="Chercher un GIF…" bind:value={query} bind:this={input} />
    <button class="btn" disabled={loading}>Chercher</button>
  </form>
  {#if error}<p class="error">{error}</p>{/if}
  <div class="grid">
    {#each gifs as g (g.id)}
      <button type="button" onclick={() => onPick(g)}>
        <img src={img(g.previewUrl)} alt={g.title || 'GIF'} loading="lazy" />
      </button>
    {:else}
      {#if !loading && !error}<p class="muted">Aucun GIF trouvé.</p>{/if}
    {/each}
  </div>
  <p class="muted powered">Via GIPHY · Échap pour fermer</p>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .close {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: var(--border-strong);
    font-size: 16px;
  }
  .close:hover {
    background: #4a4d57;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
    max-height: 240px;
    overflow-y: auto;
  }
  .grid button {
    padding: 0;
    border: 0;
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
    height: 96px;
  }
  .grid img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
