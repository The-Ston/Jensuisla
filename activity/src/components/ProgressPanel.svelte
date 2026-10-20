<script lang="ts">
  import type { MyProgressView, ProgressUnit } from '$shared/api-types';
  import { stepSize } from '$shared/domain/progress';
  import { positionText } from '../lib/format';

  let {
    unit,
    total,
    me,
    onChange,
    onUndo,
  }: {
    unit: ProgressUnit;
    total: number;
    me: MyProgressView;
    onChange: (value: number, editionTotal: number | null) => Promise<void>;
    onUndo: () => Promise<void>;
  } = $props();

  let busy = $state(false);
  let editing = $state(false);
  let ownEdition = $state(false);
  let editionInput = $state<number | null>(null);
  let valueInput = $state<number | null>(null);
  let error = $state('');

  // In page mode a reader may use another edition: everything they type is in their own pages.
  const edition = $derived(unit === 'page' ? me.editionTotal : null);
  const myTotal = $derived(edition ?? total);
  // Exactly what the reader typed (a round trip through the reference edition could shift it).
  const shown = $derived(me.shownProgress);
  const step = $derived(stepSize(unit));

  async function run(action: () => Promise<void>) {
    busy = true;
    error = '';
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Enregistrement impossible';
    } finally {
      busy = false;
    }
  }

  const bump = (delta: number) =>
    run(() => onChange(Math.max(0, Math.min(myTotal, shown + delta)), edition));

  function openEditor() {
    valueInput = shown;
    ownEdition = edition !== null;
    editionInput = edition ?? total;
    editing = true;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (valueInput === null || Number.isNaN(valueInput)) return;
    const editionTotal = unit === 'page' && ownEdition ? editionInput : null;
    await run(() => onChange(valueInput!, editionTotal));
    if (!error) editing = false;
  }
</script>

<section class="card progress" aria-label="Mon avancement">
  <div class="current">
    <span class="muted">Tu en es à</span>
    <strong>{positionText(unit, shown)}</strong>
    {#if unit !== 'percent'}<span class="muted">sur {myTotal}{edition ? ' (ton édition)' : ''}</span>{/if}
  </div>

  {#if editing}
    <form class="editor" onsubmit={save}>
      <label class="field">
        <span>{unit === 'chapter' ? 'Dernier chapitre terminé' : unit === 'page' ? 'Page atteinte' : 'Pourcentage lu'}</span>
        <input class="input" type="number" min="0" max={unit === 'page' && ownEdition ? (editionInput ?? total) : total} bind:value={valueInput} />
      </label>
      {#if unit === 'page'}
        <label class="check">
          <input type="checkbox" bind:checked={ownEdition} />
          Mon édition n’a pas {total} pages
        </label>
        {#if ownEdition}
          <label class="field">
            <span>Nombre de pages de mon édition</span>
            <input class="input" type="number" min="1" max="10000" bind:value={editionInput} />
          </label>
        {/if}
      {/if}
      <div class="row">
        <button type="button" class="btn ghost" onclick={() => (editing = false)}>Annuler</button>
        <button class="btn primary" disabled={busy}>Enregistrer</button>
      </div>
    </form>
  {:else}
    <div class="row">
      <button class="btn" disabled={busy || shown <= 0} onclick={() => bump(-step)} aria-label="Reculer de {step}">−{step}</button>
      <button class="btn primary" disabled={busy || shown >= myTotal} onclick={() => bump(step)}>
        {unit === 'chapter' ? `J’ai fini le chapitre ${shown + 1}` : `+${step}${unit === 'percent' ? ' %' : ' pages'}`}
      </button>
      <button class="btn ghost" onclick={openEditor}>Saisir…</button>
      {#if me.canUndo}
        <button class="btn ghost" disabled={busy} onclick={() => run(onUndo)}>Annuler le dernier changement</button>
      {/if}
    </div>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .progress {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .current {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .current strong {
    color: var(--me);
    font-size: 17px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 420px;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 14px;
  }
  p {
    margin: 0;
  }
</style>
