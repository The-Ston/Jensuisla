<script lang="ts">
  import type { PhotoRef } from '$shared/api-types';

  let { photos, urls }: { photos: PhotoRef[]; urls: Record<string, string> } = $props();

  let open = $state<number | null>(null);
  const current = $derived(open === null ? null : photos[open]);

  function onKey(event: KeyboardEvent) {
    if (open === null) return;
    if (event.key === 'Escape') open = null;
    else if (event.key === 'ArrowRight') open = (open + 1) % photos.length;
    else if (event.key === 'ArrowLeft') open = (open - 1 + photos.length) % photos.length;
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="grid" class:single={photos.length === 1}>
  {#each photos as photo, i (photo.id)}
    <button class="cell" aria-label="Agrandir la photo {i + 1}" onclick={() => (open = i)}>
      <img
        src={urls[photo.id]}
        alt="Image {i + 1}"
        loading="lazy"
        width={photo.width || undefined}
        height={photo.height || undefined}
      />
    </button>
  {/each}
</div>

{#if current}
  <div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo agrandie">
    <button class="backdrop" aria-label="Fermer" onclick={() => (open = null)}></button>
    <img src={urls[current.id]} alt="Image {open! + 1} sur {photos.length}" />
    <button class="close" aria-label="Fermer" onclick={() => (open = null)}>✕</button>
    {#if photos.length > 1}
      <button class="nav prev" aria-label="Photo précédente" onclick={() => (open = (open! - 1 + photos.length) % photos.length)}>‹</button>
      <button class="nav next" aria-label="Photo suivante" onclick={() => (open = (open! + 1) % photos.length)}>›</button>
      <span class="count">{open! + 1} / {photos.length}</span>
    {/if}
  </div>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    max-width: min(100%, 360px);
    border-radius: 8px;
    overflow: hidden;
  }
  .grid.single {
    grid-template-columns: minmax(0, 1fr);
  }
  .cell {
    padding: 0;
    border: 0;
    background: var(--surface-2);
    aspect-ratio: 1;
    overflow: hidden;
  }
  .single .cell {
    aspect-ratio: auto;
    max-height: 360px;
  }
  .cell img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .single .cell img {
    height: auto;
    max-height: 360px;
    object-fit: contain;
  }
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(0, 0, 0, 0.88);
  }
  .lightbox img {
    position: relative;
    max-width: calc(100% - 32px);
    max-height: calc(100% - 96px);
    object-fit: contain;
    border-radius: 6px;
  }
  .close,
  .nav {
    position: absolute;
    border: 0;
    border-radius: 50%;
    background: rgba(31, 33, 39, 0.9);
    color: #fff;
  }
  .close {
    top: 12px;
    right: 12px;
    width: 44px;
    height: 44px;
    font-size: 18px;
  }
  .nav {
    top: 50%;
    width: 48px;
    height: 48px;
    margin-top: -24px;
    font-size: 28px;
  }
  .prev {
    left: 12px;
  }
  .next {
    right: 12px;
  }
  .count {
    position: absolute;
    bottom: 16px;
    font-size: 13px;
    color: #ddd;
  }
</style>
