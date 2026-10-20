<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { emojis, normalize, type EmojiGroup } from '../lib/emojis.svelte';
  import ReactionGlyph from './ReactionGlyph.svelte';

  let { onPick, onClose }: { onPick: (key: string) => void; onClose: () => void } = $props();

  let query = $state('');
  let groups = $state<EmojiGroup[]>([]);
  let loading = $state(true);
  let input: HTMLInputElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();

  // ":joy:" and "joy" search the same way.
  const q = $derived(normalize(query.trim().replace(/^:+|:+$/g, '')));
  const byUnicode = $derived(new Map(groups.flatMap((g) => g.emojis).map((e) => [e.unicode, e])));
  const results = $derived.by(() => {
    if (!q) return null;
    const custom = emojis.custom.filter((e) => normalize(e.name).includes(q)).map((e) => e.key);
    const standard = groups.flatMap((g) => g.emojis).filter((e) => e.search.includes(q)).map((e) => e.unicode);
    return [...custom, ...standard].slice(0, 120);
  });

  onMount(async () => {
    input?.focus();
    void emojis.loadCustom();
    groups = await emojis.standard();
    loading = false;
  });

  function pick(key: string) {
    emojis.remember(key);
    onPick(key);
  }

  async function jump(id: string) {
    query = '';
    await tick();
    scroller?.querySelector(`#${id}`)?.scrollIntoView({ block: 'start' });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  function labelOf(key: string): string {
    const custom = emojis.customFor(key);
    if (custom) return `:${custom.name}:`;
    const e = byUnicode.get(key);
    if (!e) return key;
    return e.shortcode ? `:${e.shortcode}: · ${e.label}` : e.label;
  }
</script>

<div class="picker" role="dialog" aria-label="Choisir une réaction" tabindex="-1" onkeydown={onKey}>
  <div class="head">
    <label class="sr-only" for="emoji-search">Chercher un emoji</label>
    <input id="emoji-search" class="input" placeholder="Chercher (rire, cœur, :joy:…)" bind:value={query} bind:this={input} />
    <button type="button" class="close" aria-label="Fermer" onclick={onClose}>✕</button>
  </div>

  {#if !q}
    <nav aria-label="Catégories">
      {#if emojis.recents.length}
        <button type="button" title="Récents" onclick={() => jump('emoji-recents')}>🕘</button>
      {/if}
      {#if emojis.custom.length}
        <button type="button" title="Emoji du serveur" onclick={() => jump('emoji-server')}>
          <ReactionGlyph emojiKey={emojis.custom[0]!.key} size={20} />
        </button>
      {/if}
      {#each groups as g, i (g.name)}
        <button type="button" title={g.name} aria-label={g.name} onclick={() => jump(`emoji-group-${i}`)}>
          {#if g.emojis[0]}<ReactionGlyph emojiKey={g.emojis[0].unicode} size={20} label={g.name} />{/if}
        </button>
      {/each}
    </nav>
  {/if}

  <div class="scroll" bind:this={scroller}>
    {#if results}
      <div class="grid">
        {#each results as key (key)}
          <button type="button" title={labelOf(key)} aria-label={labelOf(key)} onclick={() => pick(key)}>
            <ReactionGlyph emojiKey={key} size={24} />
          </button>
        {:else}
          <p class="muted">Aucun emoji trouvé.</p>
        {/each}
      </div>
    {:else}
      {#if emojis.recents.length}
        <h3 id="emoji-recents">Récents</h3>
        <div class="grid">
          {#each emojis.recents as key (key)}
            <button type="button" title={labelOf(key)} aria-label={labelOf(key)} onclick={() => pick(key)}>
              <ReactionGlyph emojiKey={key} size={24} />
            </button>
          {/each}
        </div>
      {/if}
      {#if emojis.custom.length}
        <h3 id="emoji-server">Emoji du serveur</h3>
        <div class="grid">
          {#each emojis.custom as e (e.key)}
            <button type="button" title=":{e.name}:" aria-label=":{e.name}:" onclick={() => pick(e.key)}>
              <ReactionGlyph emojiKey={e.key} size={24} />
            </button>
          {/each}
        </div>
      {/if}
      {#if loading}
        <p class="muted">Chargement des emoji…</p>
      {/if}
      {#each groups as g, i (g.name)}
        <h3 id="emoji-group-{i}">{g.name}</h3>
        <div class="grid">
          {#each g.emojis as e (e.unicode)}
            <button type="button" title={labelOf(e.unicode)} aria-label={e.label} onclick={() => pick(e.unicode)}>
              <ReactionGlyph emojiKey={e.unicode} size={24} label={e.label} />
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    width: min(100%, 380px);
  }
  .head {
    display: flex;
    gap: 6px;
  }
  .close {
    width: 44px;
    flex-shrink: 0;
    border: 0;
    border-radius: 8px;
    background: var(--border-strong);
    font-size: 16px;
  }
  nav {
    display: flex;
    gap: 2px;
    overflow-x: auto;
  }
  nav button {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  nav button:hover {
    background: var(--border-strong);
  }
  .scroll {
    max-height: 260px;
    overflow-y: auto;
  }
  h3 {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    margin: 8px 4px 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  }
  .grid button {
    height: 40px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .grid button:hover {
    background: var(--border-strong);
  }
  p {
    margin: 4px;
    grid-column: 1 / -1;
  }
</style>
