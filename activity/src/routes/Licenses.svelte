<script lang="ts">
  import { onMount } from 'svelte';

  /** Shows licenses.txt, generated at build time (see licenses-plugin.ts). */
  let { onBack }: { onBack: () => void } = $props();

  let text = $state('');
  let error = $state('');

  onMount(async () => {
    try {
      const res = await fetch('/licenses.txt');
      if (!res.ok) throw new Error();
      text = await res.text();
    } catch {
      error = 'Impossible de charger les licences';
    }
  });
</script>

<main>
  <header>
    <button class="btn ghost small" onclick={onBack}>‹ Retour</button>
    <h1>Licences</h1>
  </header>
  {#if error}
    <p class="error">{error}</p>
  {:else if text}
    <pre class="card">{text}</pre>
  {:else}
    <p class="muted">Chargement…</p>
  {/if}
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 16px 48px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h1 {
    font-size: 24px;
  }
  pre {
    margin: 0;
    padding: 16px;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
