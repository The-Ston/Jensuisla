<script lang="ts">
  import { parseCustomKey } from '$shared/domain/reactions';
  import { emojis } from '../lib/emojis.svelte';

  let { emojiKey, size = 18 }: { emojiKey: string; size?: number } = $props();

  const parsed = $derived(parseCustomKey(emojiKey));
  const custom = $derived(parsed ? emojis.customFor(emojiKey) : undefined);
</script>

{#if parsed}
  {#if custom}
    <img src={custom.url} alt=":{custom.name}:" title=":{custom.name}:" width={size} height={size} />
  {:else}
    <span class="gone" title="Emoji supprimé du serveur">:{parsed.name}:</span>
  {/if}
{:else}
  <span style:font-size="{size}px">{emojiKey}</span>
{/if}

<style>
  img {
    object-fit: contain;
    vertical-align: middle;
  }
  span {
    line-height: 1;
  }
  .gone {
    font-size: 12px;
    color: var(--muted);
  }
</style>
