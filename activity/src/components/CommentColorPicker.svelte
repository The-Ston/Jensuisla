<script lang="ts">
  import type { CommentColor } from '$shared/api-types';
  import { COMMENT_COLORS, inkColor } from '../lib/appearance';

  /** Color picker for the user's comments. Each choice is written in its own color, as others will see it. */
  let { color, onChange }: { color: CommentColor | null; onChange: (next: CommentColor | null) => void } = $props();
</script>

<div class="colors" role="group" aria-label="Couleur de mes commentaires">
  {#each COMMENT_COLORS as c (c.id)}
    <button class="color" aria-pressed={color === c.id} style:color={inkColor(c.id)} onclick={() => onChange(c.id)}>
      <span class="dot" aria-hidden="true"></span>
      {c.name}
    </button>
  {/each}
</div>

<style>
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .color {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px 0 8px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: none;
    font-size: 13px;
    font-weight: 600;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: currentColor;
  }
  .color[aria-pressed='true'] {
    border-color: currentColor;
    box-shadow: 0 0 0 1px currentColor;
  }
</style>
