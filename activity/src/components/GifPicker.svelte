<script lang="ts">
  import { onMount } from 'svelte';
  import type { Gif } from '$shared/api-types';
  import { api } from '../lib/api';
  import { favorites } from '../lib/favorites.svelte';
  import { img } from '../lib/format';
  import FavoriteStar from './FavoriteStar.svelte';

  let { onPick, onClose }: { onPick: (gif: Gif) => void; onClose: () => void } = $props();

  let tab = $state<'search' | 'favorites'>('search');
  let query = $state('');
  let results = $state<Gif[]>([]);
  let error = $state('');
  let loading = $state(false);
  let input: HTMLInputElement | undefined = $state();

  const shown = $derived(tab === 'favorites' ? favorites.list : results);

  async function search(event?: SubmitEvent) {
    event?.preventDefault();
    tab = 'search';
    loading = true;
    error = '';
    try {
      results = await api.gifs(query.trim());
    } catch (e) {
      error = e instanceof Error ? e.message : 'GIF indisponibles';
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    input?.focus();
    void search();
    await favorites.load();
    // Open on favorites when there are some: that's usually what people reach for.
    if (favorites.list.length > 0 && !query) tab = 'favorites';
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
    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'favorites'} class:active={tab === 'favorites'} onclick={() => (tab = 'favorites')}>
        Favoris{favorites.list.length ? ` (${favorites.list.length})` : ''}
      </button>
      <button type="button" role="tab" aria-selected={tab === 'search'} class:active={tab === 'search'} onclick={() => (tab = 'search')}>
        Recherche
      </button>
    </div>
    <button type="button" class="close" aria-label="Fermer" onclick={onClose}>✕</button>
  </div>
  <form class="row" onsubmit={search}>
    <label class="sr-only" for="gif-search">Chercher un GIF</label>
    <input id="gif-search" class="input" placeholder="Chercher un GIF…" bind:value={query} bind:this={input} />
    <button class="btn" disabled={loading}>Chercher</button>
  </form>
  {#if error && tab === 'search'}<p class="error">{error}</p>{/if}
  <div class="grid">
    {#each shown as g (g.id)}
      <div class="tile">
        <button type="button" class="pick" onclick={() => onPick(g)}>
          <img src={img(g.previewUrl)} alt={g.title || 'GIF'} loading="lazy" />
        </button>
        <FavoriteStar gif={g} />
      </div>
    {:else}
      {#if tab === 'favorites'}
        <p class="muted empty">Pas encore de favoris : clique sur l’étoile d’un GIF pour l’ajouter ici.</p>
      {:else if !loading && !error}
        <p class="muted empty">Aucun GIF trouvé.</p>
      {/if}
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
    gap: 8px;
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs button {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    font-weight: 500;
  }
  .tabs button.active {
    color: var(--text);
    background: var(--bg);
    border-color: var(--border-strong);
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
  .tile {
    position: relative;
    height: 96px;
  }
  .pick {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
  }
  .pick img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .empty {
    grid-column: 1 / -1;
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
