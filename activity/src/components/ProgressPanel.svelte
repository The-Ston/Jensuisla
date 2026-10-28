<script lang="ts">
  import type { MyProgressView, ProgressUnit } from '$shared/api-types';
  import { fromReference, stepSize } from '$shared/domain/progress';
  import { positionText } from '../lib/format';

  let {
    unit,
    total,
    me,
    onChange,
    onUndo,
  }: {
    /** The reading's unit; the reader may follow their own (`me.unit`). */
    unit: ProgressUnit;
    total: number;
    me: MyProgressView;
    onChange: (value: number, editionTotal: number | null, unit: ProgressUnit) => Promise<void>;
    onUndo: () => Promise<void>;
  } = $props();

  let busy = $state(false);
  let editing = $state(false);
  let unitInput = $state<ProgressUnit>('page');
  let ownEdition = $state(false);
  let editionInput = $state<number | null>(null);
  let valueInput = $state<number | null>(null);
  let error = $state('');

  // Pages and percent convert to each other: a reader may follow the other one (e-reader, paper
  // book), or use another edition. Everything they type is in their own scale.
  const switchable = $derived(unit !== 'chapter');
  const myUnit = $derived(me.unit);
  const edition = $derived(me.editionTotal);
  const myTotal = $derived(edition ?? total);
  // Exactly what the reader typed (a round trip through the reference edition could shift it).
  const shown = $derived(me.shownProgress);
  const step = $derived(stepSize(myUnit));
  // Pages of the reader's book, as typed in the editor: needed when the reading is in percent.
  const pagesInput = $derived(unit === 'page' && !ownEdition ? total : editionInput);
  const inputMax = $derived(unitInput === 'percent' ? 100 : unitInput === 'page' ? (pagesInput ?? undefined) : total);

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
    run(() => onChange(Math.max(0, Math.min(myTotal, shown + delta)), edition, myUnit));

  function openEditor() {
    valueInput = shown;
    unitInput = myUnit;
    const pages = myUnit === 'page' ? edition : null;
    ownEdition = pages !== null;
    editionInput = pages ?? (unit === 'page' ? total : null);
    editing = true;
  }

  /** Switching unit shows the current progress in the new one, when it can be converted. */
  function onUnitChange() {
    if (unitInput === myUnit) valueInput = shown;
    else {
      const target = unitInput === 'percent' ? 100 : pagesInput;
      valueInput = target ? fromReference(me.progress, target, total) : null;
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (unitInput === 'page' && !pagesInput) return (error = 'Indique le nombre de pages de ton livre');
    if (valueInput === null || Number.isNaN(valueInput)) return;
    const editionTotal =
      unitInput === 'percent' ? 100 : unitInput === 'page' && (unit !== 'page' || ownEdition) ? editionInput : null;
    await run(() => onChange(valueInput!, editionTotal, unitInput));
    if (!error) editing = false;
  }
</script>

<section class="card progress" aria-label="Mon avancement">
  <div class="current">
    <span class="muted">Tu en es à</span>
    <strong>{positionText(myUnit, shown)}</strong>
    {#if myUnit !== 'percent'}<span class="muted">sur {myTotal}{edition ? ' (ton édition)' : ''}</span>{/if}
  </div>

  {#if editing}
    <form class="editor" onsubmit={save}>
      {#if switchable}
        <div class="units" role="radiogroup" aria-label="Unité">
          <span>Je suis en</span>
          <label class="check"><input type="radio" value="page" bind:group={unitInput} onchange={onUnitChange} /> pages</label>
          <label class="check"><input type="radio" value="percent" bind:group={unitInput} onchange={onUnitChange} /> %</label>
        </div>
      {/if}
      {#if unitInput === 'page' && unit === 'page'}
        <label class="check">
          <input type="checkbox" bind:checked={ownEdition} />
          Mon édition n’a pas {total} pages
        </label>
      {/if}
      {#if unitInput === 'page' && (unit !== 'page' || ownEdition)}
        <label class="field">
          <span>{unit === 'page' ? 'Nombre de pages de mon édition' : 'Nombre de pages de mon livre'}</span>
          <input class="input" type="number" min="1" max="10000" bind:value={editionInput} />
        </label>
      {/if}
      <label class="field">
        <span>{unitInput === 'chapter' ? 'Dernier chapitre terminé' : unitInput === 'page' ? 'Page atteinte' : 'Pourcentage lu'}</span>
        <input class="input" type="number" min="0" max={inputMax} bind:value={valueInput} />
      </label>
      <div class="row">
        <button type="button" class="btn ghost" onclick={() => (editing = false)}>Annuler</button>
        <button class="btn primary" disabled={busy}>Enregistrer</button>
      </div>
    </form>
  {:else}
    <div class="row">
      <button class="btn" disabled={busy || shown <= 0} onclick={() => bump(-step)} aria-label="Reculer de {step}">−{step}</button>
      <button class="btn primary" disabled={busy || shown >= myTotal} onclick={() => bump(step)}>
        {myUnit === 'chapter' ? `J’ai fini le chapitre ${shown + 1}` : `+${step}${myUnit === 'percent' ? ' %' : ' pages'}`}
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
  .units {
    display: flex;
    gap: 14px;
    align-items: center;
    font-size: 14px;
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
