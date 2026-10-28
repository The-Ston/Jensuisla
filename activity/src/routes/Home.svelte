<script lang="ts">
  import { onMount } from 'svelte';
  import type { Appearance, HomeView, NotifyPref, ReadingSummary } from '$shared/api-types';
  import AppearanceSettings from '../components/AppearanceSettings.svelte';
  import Avatar from '../components/Avatar.svelte';
  import { api } from '../lib/api';
  import { applyAppearance } from '../lib/appearance';
  import { progressText } from '../lib/format';

  let { onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void } = $props();

  let home = $state<HomeView | null>(null);
  let error = $state('');
  let busy = $state('');

  const mine = $derived(home?.readings.filter((r) => r.isParticipant) ?? []);
  const open = $derived(home?.readings.filter((r) => r.canJoin) ?? []);

  async function load() {
    try {
      home = await api.home();
      applyAppearance(home.me.appearance);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Chargement impossible';
    }
  }

  onMount(load);

  async function join(reading: ReadingSummary) {
    busy = reading.id;
    try {
      await api.join(reading.id);
      onOpen(reading.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Impossible de rejoindre';
    } finally {
      busy = '';
    }
  }

  async function setNotify(event: Event) {
    const pref = (event.currentTarget as HTMLSelectElement).value as NotifyPref;
    try {
      await api.setNotify(pref);
      if (home) home.me.notify = pref;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Enregistrement impossible';
    }
  }

  // Applied right away; put back if the server refuses it.
  async function setAppearance(next: Appearance) {
    if (!home) return;
    const previous = home.me.appearance;
    home.me.appearance = next;
    applyAppearance(next);
    try {
      await api.setAppearance(next);
    } catch (e) {
      if (home.me.appearance === next) {
        home.me.appearance = previous;
        applyAppearance(previous);
      }
      error = e instanceof Error ? e.message : 'Enregistrement impossible';
    }
  }
</script>

<main>
  {#if home}
    <header>
      <div class="hello">
        <Avatar member={home.me} size={40} />
        <div>
          <h1>Bonjour {home.me.name}</h1>
          <p class="muted">Vos lectures communes, sans spoiler.</p>
        </div>
      </div>
      {#if home.me.isOrganizer}
        <button class="btn primary" onclick={onCreate}>Nouvelle lecture</button>
      {/if}
    </header>

    {#if error}<p class="error">{error}</p>{/if}

    <section>
      <h2>Mes lectures</h2>
      {#if mine.length === 0}
        <p class="muted">Tu ne participes à aucune lecture pour l’instant.</p>
      {/if}
      <div class="grid">
        {#each mine as reading (reading.id)}
          <button class="book card" onclick={() => onOpen(reading.id)}>
            <span class="cover-wrap">
              {#if reading.coverUrl}
                <img src={reading.coverUrl} alt="" class="cover" />
              {:else}
                <span class="cover placeholder" aria-hidden="true">{reading.title.slice(0, 1)}</span>
              {/if}
              {#if reading.unread > 0}
                <span class="unread">
                  {reading.unread > 99 ? '99+' : reading.unread}
                  <span class="sr-only">nouveau{reading.unread > 1 ? 'x' : ''} message{reading.unread > 1 ? 's' : ''}</span>
                </span>
              {/if}
            </span>
            <span class="info">
              <strong>{reading.title}</strong>
              {#if reading.author}<span class="muted">{reading.author}</span>{/if}
              <span class="progress">
                <span class="bar"><span style:width="{((reading.myProgress ?? 0) / reading.total) * 100}%"></span></span>
                {progressText(reading.myUnit, reading.myShownProgress ?? 0, reading.myShownTotal)}
              </span>
              <span class="muted small">{reading.participantCount} lecteur{reading.participantCount > 1 ? 's' : ''}</span>
            </span>
          </button>
        {/each}
      </div>
    </section>

    {#if open.length > 0}
      <section>
        <h2>Lectures ouvertes</h2>
        <div class="grid">
          {#each open as reading (reading.id)}
            <div class="book card">
              {#if reading.coverUrl}
                <img src={reading.coverUrl} alt="" class="cover" />
              {:else}
                <span class="cover placeholder" aria-hidden="true">{reading.title.slice(0, 1)}</span>
              {/if}
              <span class="info">
                <strong>{reading.title}</strong>
                {#if reading.author}<span class="muted">{reading.author}</span>{/if}
                <span class="muted small">{reading.participantCount} lecteur{reading.participantCount > 1 ? 's' : ''}</span>
                <button class="btn primary small" disabled={busy === reading.id} onclick={() => join(reading)}>
                  Je participe
                </button>
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section>
      <h2>Réglages</h2>
      <div class="prefs card">
        <div class="pref">
          <h3>Apparence</h3>
          <p class="muted small">Rien que pour toi : les autres lecteurs gardent la leur.</p>
          <AppearanceSettings appearance={home.me.appearance} onChange={setAppearance} />
        </div>
        <div class="pref">
          <h3>Notifications</h3>
          <label class="field">
            <span>Quand quelqu’un commente ou réagit dans un passage que tu as lu</span>
            <select class="input" value={home.me.notify} onchange={setNotify}>
              <option value="dm">Message privé du bot</option>
              <option value="channel">Mention dans #lectures</option>
              <option value="none">Aucune</option>
            </select>
          </label>
        </div>
      </div>
    </section>
  {:else if error}
    <p class="error">{error}</p>
    <button class="btn" onclick={load}>Réessayer</button>
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
    gap: 28px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .hello {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  h1 {
    font-size: 24px;
  }
  h2 {
    font-size: 18px;
    margin-bottom: 12px;
  }
  p {
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .book {
    display: flex;
    gap: 14px;
    padding: 12px;
    text-align: left;
    align-items: flex-start;
  }
  button.book:hover {
    border-color: var(--border-strong);
  }
  .cover {
    width: 64px;
    height: 94px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--surface-2);
  }
  .cover-wrap {
    position: relative;
    flex-shrink: 0;
    display: flex;
  }
  .unread {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    border: 2px solid var(--surface);
    background: var(--ok);
    color: var(--bg);
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: 28px;
    color: var(--muted);
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    align-items: flex-start;
  }
  .small {
    font-size: 12px;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .bar {
    width: 80px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-strong);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .prefs {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .pref {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pref + .pref {
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }
  h3 {
    font-size: 15px;
  }
</style>
