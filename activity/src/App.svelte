<script lang="ts">
  import { onMount } from 'svelte';
  import { setToken } from './lib/api';
  import { connect, inDiscord } from './lib/discord';
  import Create from './routes/Create.svelte';
  import Home from './routes/Home.svelte';
  import Reading from './routes/Reading.svelte';

  type Route = { name: 'home' } | { name: 'create' } | { name: 'reading'; id: string };

  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let error = $state('');
  let route = $state<Route>({ name: 'home' });

  onMount(async () => {
    if (!inDiscord()) {
      status = 'error';
      error = 'Jensuisla s’ouvre depuis Discord : lance l’Activity dans le salon #lectures.';
      return;
    }
    try {
      setToken(await connect());
      status = 'ready';
    } catch (e) {
      status = 'error';
      error = e instanceof Error ? e.message : 'Connexion impossible';
    }
  });

  const openReading = (id: string) => (route = { name: 'reading', id });
  const goHome = () => (route = { name: 'home' });
</script>

{#if status === 'loading'}
  <p class="center muted">Connexion à Discord…</p>
{:else if status === 'error'}
  <p class="center error">{error}</p>
{:else if route.name === 'home'}
  <Home onOpen={openReading} onCreate={() => (route = { name: 'create' })} />
{:else if route.name === 'create'}
  <Create onCancel={goHome} onCreated={openReading} />
{:else}
  {#key route.id}
    <Reading id={route.id} onBack={goHome} />
  {/key}
{/if}

<style>
  .center {
    padding: 48px 24px;
    text-align: center;
  }
</style>
