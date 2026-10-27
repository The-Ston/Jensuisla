<script lang="ts">
  import type { Appearance } from '$shared/api-types';
  import { ACCENTS, THEMES } from '../lib/appearance';

  /** Theme and accent pickers. Each tile previews its own colors with the chosen accent. */
  let { appearance, onChange }: { appearance: Appearance; onChange: (next: Appearance) => void } = $props();
</script>

<div class="appearance">
  <div class="group" role="group" aria-labelledby="theme-label">
    <span id="theme-label" class="label">Thème</span>
    <div class="themes">
      {#each THEMES as t (t.id)}
        <button
          class="theme"
          aria-pressed={appearance.theme === t.id}
          onclick={() => onChange({ ...appearance, theme: t.id })}
        >
          <span class="mini" data-theme={t.id} data-accent={appearance.accent ?? undefined} aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
          {t.name}
        </button>
      {/each}
    </div>
  </div>

  <div class="group" role="group" aria-labelledby="accent-label">
    <span id="accent-label" class="label">Couleur d’accent</span>
    <div class="accents">
      {#each ACCENTS as a (a.id)}
        <button
          class="accent"
          aria-pressed={appearance.accent === a.id}
          onclick={() => onChange({ ...appearance, accent: a.id })}
        >
          <span class="swatch" data-theme={appearance.theme} data-accent={a.id ?? undefined} aria-hidden="true"></span>
          {a.name}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .appearance {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    font-size: 13px;
    color: var(--muted);
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid var(--border-strong);
    background: none;
    text-align: left;
    font-size: 13px;
  }
  .mini {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    height: 48px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .mini i {
    display: block;
    height: 5px;
    border-radius: 3px;
    background: var(--border-strong);
  }
  .mini i:first-child {
    width: 60%;
    background: var(--accent);
  }
  .mini i:last-child {
    width: 35%;
    background: var(--me);
  }
  .accents {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .accent {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px 0 6px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: none;
    font-size: 13px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent);
  }
  .theme[aria-pressed='true'],
  .accent[aria-pressed='true'] {
    border-color: var(--text);
    box-shadow: 0 0 0 1px var(--text);
    font-weight: 600;
  }
</style>
