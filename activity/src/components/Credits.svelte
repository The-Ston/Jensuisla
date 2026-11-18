<script lang="ts">
  import { openExternal } from '../lib/discord';

  /** Homepage listing all of The-Ston's projects. */
  const PROJECTS_URL = 'https://home.theston.workers.dev';
  const TWEMOJI_URL = 'https://github.com/jdecked/twemoji';

  let { onLicenses }: { onLicenses: () => void } = $props();

  function external(event: MouseEvent, url: string) {
    event.preventDefault();
    openExternal(url);
  }
</script>

<footer>
  <p class="who">
    <b>Jensuisla</b> · un projet de The-Ston ·
    <a href={PROJECTS_URL} onclick={(e) => external(e, PROJECTS_URL)}>Mes autres projets ↗</a>
  </p>
  <p>
    Emojis <a href={TWEMOJI_URL} onclick={(e) => external(e, TWEMOJI_URL)}>Twemoji</a> (CC-BY 4.0) · GIFs Powered by
    GIPHY · <button class="link" onclick={onLicenses}>Licences</button>
  </p>
  <p class="version">v{__APP_VERSION__} · {__APP_COMMIT__}</p>
</footer>

<style>
  footer {
    border-top: 1px solid var(--border);
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  p {
    margin: 0;
  }
  .who {
    font-size: 13px;
    color: var(--text);
  }
  .who b {
    font-family: var(--font-display);
  }
  .version {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }
  a,
  .link {
    color: var(--accent);
    text-decoration: none;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }
  a:hover,
  .link:hover {
    text-decoration: underline;
  }
</style>
