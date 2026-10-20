<script lang="ts">
  import type { Gif } from '$shared/api-types';
  import { favorites } from '../lib/favorites.svelte';

  let { gif }: { gif: Gif } = $props();

  let busy = $state(false);
  const on = $derived(favorites.has(gif.id));

  async function toggle(event: MouseEvent) {
    event.stopPropagation();
    busy = true;
    try {
      await favorites.toggle(gif);
    } finally {
      busy = false;
    }
  }
</script>

<button
  type="button"
  class="star"
  class:on
  disabled={busy}
  aria-pressed={on}
  aria-label={on ? 'Retirer des GIF favoris' : 'Ajouter aux GIF favoris'}
  title={on ? 'Retirer des favoris' : 'Ajouter aux favoris'}
  onclick={toggle}
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"></path>
  </svg>
</button>

<style>
  .star {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 16, 19, 0.75);
    color: #fff;
  }
  .star.on {
    color: var(--accent);
  }
  .star:hover {
    background: rgba(15, 16, 19, 0.95);
  }
</style>
