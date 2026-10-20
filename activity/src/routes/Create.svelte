<script lang="ts">
  import { onMount } from 'svelte';
  import type { BookSuggestion, JoinMode, MemberView, ProgressUnit } from '$shared/api-types';
  import Avatar from '../components/Avatar.svelte';
  import { api } from '../lib/api';
  import { img, unitNames } from '../lib/format';

  let { onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void } = $props();

  const MAX_COVER_BYTES = 2 * 1024 * 1024;

  let query = $state('');
  let searching = $state(false);
  let suggestions = $state<BookSuggestion[]>([]);

  let title = $state('');
  let author = $state('');
  let coverUrl = $state<string | null>(null);
  let coverData = $state<{ base64: string; contentType: string } | null>(null);
  let coverPreview = $state<string | null>(null);
  let unit = $state<ProgressUnit>('chapter');
  let total = $state<number | null>(null);
  let joinMode = $state<JoinMode>('both');
  let invited = $state<string[]>([]);
  let members = $state<MemberView[]>([]);
  let myId = $state('');

  let error = $state('');
  let saving = $state(false);

  onMount(async () => {
    try {
      const [list, home] = await Promise.all([api.members(), api.home()]);
      myId = home.me.id;
      members = list.filter((m) => m.id !== myId);
    } catch {
      // The invite list is optional; the form still works without it.
    }
  });

  async function search(event: SubmitEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    searching = true;
    try {
      suggestions = await api.books(query.trim());
      if (suggestions.length === 0) error = 'Aucun livre trouvé, remplis le formulaire à la main.';
      else error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Recherche impossible';
    } finally {
      searching = false;
    }
  }

  function pick(book: BookSuggestion) {
    title = book.title;
    author = book.author;
    coverUrl = book.coverUrl;
    coverData = null;
    coverPreview = book.coverUrl ? img(book.coverUrl) : null;
    if (book.pages) {
      if (unit === 'page') total = book.pages;
      pagesHint = book.pages;
    }
    suggestions = [];
  }

  let pagesHint = $state<number | null>(null);

  function onUnitChange(next: ProgressUnit) {
    unit = next;
    if (next === 'page' && pagesHint && !total) total = pagesHint;
  }

  async function onFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_COVER_BYTES) {
      error = 'Image trop lourde (2 Mo maximum)';
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    coverData = { base64: dataUrl.split(',')[1]!, contentType: file.type };
    coverUrl = null;
    coverPreview = dataUrl;
    error = '';
  }

  function removeCover() {
    coverData = null;
    coverUrl = null;
    coverPreview = null;
  }

  function toggleInvite(id: string) {
    invited = invited.includes(id) ? invited.filter((x) => x !== id) : [...invited, id];
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim()) return (error = 'Indique un titre');
    if (unit !== 'percent' && (!total || total < 1)) return (error = unit === 'chapter' ? 'Indique le nombre de chapitres' : 'Indique le nombre de pages');
    saving = true;
    error = '';
    try {
      const created = await api.create({
        title,
        author,
        coverUrl,
        coverData,
        unit,
        total: unit === 'percent' ? 100 : total!,
        joinMode,
        invitedIds: joinMode === 'open' ? [] : invited,
      });
      onCreated(created.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Création impossible';
      saving = false;
    }
  }
</script>

<main>
  <header>
    <button class="btn ghost small" onclick={onCancel}>‹ Retour</button>
    <h1>Nouvelle lecture</h1>
  </header>

  <form class="card search" onsubmit={search}>
    <label class="field">
      <span>Chercher le livre (titre, auteur…) pour pré-remplir la couverture et le nombre de pages</span>
      <div class="row">
        <input class="input" bind:value={query} placeholder="Ex. : Le Nom du vent" />
        <button class="btn" disabled={searching}>{searching ? 'Recherche…' : 'Chercher'}</button>
      </div>
    </label>
    {#if suggestions.length > 0}
      <ul class="suggestions">
        {#each suggestions as book, i (i)}
          <li>
            <button type="button" onclick={() => pick(book)}>
              {#if book.coverUrl}
                <img src={img(book.coverUrl)} alt="" />
              {:else}
                <span class="nocover" aria-hidden="true"></span>
              {/if}
              <span>
                <strong>{book.title}</strong><br />
                <span class="muted">
                  {book.author}{book.year ? ` · ${book.year}` : ''}{book.pages ? ` · ${book.pages} p.` : ''}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </form>

  <form class="card form" onsubmit={submit}>
    <div class="top">
      <div class="cover-box">
        {#if coverPreview}
          <img src={coverPreview} alt="Couverture" class="cover" />
          <button type="button" class="btn ghost small" onclick={removeCover}>Retirer</button>
        {:else}
          <span class="cover empty">Pas de couverture</span>
        {/if}
        <label class="btn small">
          Importer une image
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only" onchange={onFile} />
        </label>
      </div>
      <div class="fields">
        <label class="field">
          <span>Titre</span>
          <input class="input" bind:value={title} required maxlength="200" />
        </label>
        <label class="field">
          <span>Auteur</span>
          <input class="input" bind:value={author} maxlength="120" />
        </label>
      </div>
    </div>

    <fieldset>
      <legend>Comment mesure-t-on l’avancement ?</legend>
      <div class="choices">
        {#each ['chapter', 'page', 'percent'] as const as u (u)}
          <label class="choice" class:active={unit === u}>
            <input type="radio" name="unit" value={u} checked={unit === u} onchange={() => onUnitChange(u)} />
            {unitNames[u]}
          </label>
        {/each}
      </div>
      {#if unit === 'chapter'}
        <label class="field">
          <span>Nombre de chapitres</span>
          <input class="input" type="number" min="1" max="10000" bind:value={total} />
        </label>
      {:else if unit === 'page'}
        <label class="field">
          <span>Nombre de pages de l’édition de référence (les autres éditions seront converties)</span>
          <input class="input" type="number" min="1" max="10000" bind:value={total} />
        </label>
      {:else}
        <p class="muted">Chacun indiquera un pourcentage de 0 à 100 %.</p>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Comment rejoindre la lecture ?</legend>
      <div class="choices">
        <label class="choice" class:active={joinMode === 'invite'}>
          <input type="radio" name="join" value="invite" bind:group={joinMode} /> Sur invitation
        </label>
        <label class="choice" class:active={joinMode === 'open'}>
          <input type="radio" name="join" value="open" bind:group={joinMode} /> Bouton « Je participe »
        </label>
        <label class="choice" class:active={joinMode === 'both'}>
          <input type="radio" name="join" value="both" bind:group={joinMode} /> Les deux
        </label>
      </div>
      {#if joinMode !== 'open' && members.length > 0}
        <p class="muted">Inviter maintenant (tu pourras en inviter d’autres plus tard) :</p>
        <div class="members">
          {#each members as m (m.id)}
            <label class="member" class:active={invited.includes(m.id)}>
              <input type="checkbox" checked={invited.includes(m.id)} onchange={() => toggleInvite(m.id)} />
              <Avatar member={m} size={24} />
              {m.name}
            </label>
          {/each}
        </div>
      {/if}
    </fieldset>

    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn ghost" onclick={onCancel}>Annuler</button>
      <button class="btn primary" disabled={saving}>{saving ? 'Création…' : 'Créer la lecture'}</button>
    </div>
  </form>
</main>

<style>
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 20px 16px 48px;
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
  .search,
  .form {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .suggestions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow-y: auto;
  }
  .suggestions button {
    width: 100%;
    display: flex;
    gap: 12px;
    align-items: center;
    text-align: left;
    padding: 8px;
    border-radius: 8px;
    border: 0;
    background: transparent;
  }
  .suggestions button:hover {
    background: var(--surface-2);
  }
  .suggestions img,
  .nocover {
    width: 36px;
    height: 54px;
    object-fit: cover;
    border-radius: 3px;
    background: var(--surface-2);
    flex-shrink: 0;
  }
  .top {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .cover-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .cover {
    width: 104px;
    height: 152px;
    border-radius: 6px;
    object-fit: cover;
  }
  .cover.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
    border: 1px dashed var(--border-strong);
    padding: 8px;
  }
  .fields {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  legend {
    font-weight: 600;
    margin-bottom: 8px;
  }
  .choices,
  .members {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .choice,
  .member {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 20px;
    border: 1px solid var(--border-strong);
    cursor: pointer;
  }
  .choice.active,
  .member.active {
    border-color: var(--accent);
    background: rgba(232, 163, 61, 0.15);
  }
  .choice input,
  .member input {
    accent-color: var(--accent);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  p {
    margin: 0;
  }
</style>
