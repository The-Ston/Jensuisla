<script lang="ts">
  import { parseCustomKey } from '$shared/domain/reactions';
  import { emojis } from '../lib/emojis.svelte';
  import { twemojiUrls } from '../lib/twemoji';

  let { emojiKey, size = 18, label = '' }: { emojiKey: string; size?: number; label?: string } = $props();

  const parsed = $derived(parseCustomKey(emojiKey));
  const custom = $derived(parsed ? emojis.customFor(emojiKey) : undefined);
  const urls = $derived(parsed ? [] : twemojiUrls(emojiKey));
  // Index of the image candidate being tried; past the end we fall back to the system font.
  let attempt = $state(0);
  $effect(() => {
    void emojiKey;
    attempt = 0;
  });
</script>

{#if parsed}
  {#if custom}
    <img src={custom.url} alt=":{custom.name}:" width={size} height={size} loading="lazy" />
  {:else}
    <span class="gone" title="Emoji supprimé du serveur">:{parsed.name}:</span>
  {/if}
{:else}
  {#if attempt < urls.length}
    <img src={urls[attempt]} alt={label || emojiKey} width={size} height={size} loading="lazy" onerror={() => attempt++} />
  {:else}
    <span style:font-size="{size}px">{emojiKey}</span>
  {/if}
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
