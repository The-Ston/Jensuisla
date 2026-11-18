<script lang="ts">
  /**
   * Line drawing of a bookshelf behind the home greeting. One book faces out with its ribbon,
   * like the app icon. Wide screens get a longer shelf so that book clears the header's button.
   */
  type Spine = { x: number; w: number; h: number; band: boolean };
  type Shelf = { width: number; spines: Spine[]; face: { x: number; w: number; h: number } };

  const BASE = 100;
  const HEIGHTS = [58, 72, 50, 66, 80, 54, 70, 62, 76, 48, 68, 60, 74, 56];
  const FACE = { w: 40, h: 54 };

  /** Spines from left to right; the facing book goes at the first slot past `faceAt`. */
  function build(width: number, faceAt: number): Shelf {
    const spines: Spine[] = [];
    let face: Shelf['face'] | null = null;
    let x = 8;
    for (let k = 0; x < width; k++) {
      if (!face && x >= faceAt) {
        face = { x, ...FACE };
        x += FACE.w + 5;
        continue;
      }
      const w = 10 + ((k * 7) % 9);
      spines.push({ x, w, h: HEIGHTS[k % HEIGHTS.length]!, band: k % 3 === 1 });
      x += w + 3;
    }
    return { width, spines, face: face! };
  }

  const wide = build(560, 330);
  const narrow = build(560, 380);
</script>

{#snippet drawing(shelf: Shelf, cls: string)}
  {@const f = shelf.face}
  {@const ribbonX = f.x + f.w * 0.62}
  {@const lineY = BASE - f.h + f.h * 0.64}
  <svg class="shelf {cls}" viewBox="0 0 {shelf.width} {BASE}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
    {#each shelf.spines as s (s.x)}
      <rect class="spine" x={s.x} y={BASE - s.h} width={s.w} height={s.h} rx="1.5" />
      {#if s.band}<line class="spine" x1={s.x + 2} y1={BASE - s.h * 0.78} x2={s.x + s.w - 2} y2={BASE - s.h * 0.78} />{/if}
    {/each}
    <rect class="cover" x={f.x} y={BASE - f.h} width={f.w} height={f.h} rx="3" />
    <line class="cover" x1={f.x + 6} y1={BASE - f.h} x2={f.x + 6} y2={BASE} />
    <line class="cover progress" x1={f.x + 12} y1={lineY} x2={f.x + f.w - 6} y2={lineY} />
    <path class="ribbon" d="M{ribbonX - 4} {BASE - f.h - 8}h8v{lineY - (BASE - f.h - 8)}l-4 -4l-4 4z" />
    {#if cls === 'narrow'}<line class="plank" x1="0" y1={BASE - 0.75} x2={shelf.width} y2={BASE - 0.75} />{/if}
  </svg>
{/snippet}

{@render drawing(wide, 'wide')}
{@render drawing(narrow, 'narrow')}

<style>
  .shelf {
    position: absolute;
    right: 0;
    bottom: 0;
    height: 100%;
    width: auto;
    opacity: 0.5;
    pointer-events: none;
    /* Fades out towards the greeting so it never competes with the text. */
    mask-image: linear-gradient(to right, transparent, #000 35%);
  }
  /* Keeps clear of the greeting: narrower screens crop the shelf's left end. */
  .wide {
    width: min(calc(100% - 330px), 560px);
  }
  .narrow {
    display: none;
  }
  /* Phones: a low shelf standing on a plank along the header's bottom edge, under the button
     (the header leaves room for it, see Home). */
  @media (max-width: 600px) {
    .wide {
      display: none;
    }
    .narrow {
      display: block;
      height: 56px;
      width: auto;
    }
  }
  .spine {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.2;
  }
  .cover {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.4;
  }
  .progress {
    stroke-width: 1.6;
    stroke-linecap: round;
    opacity: 0.6;
  }
  .ribbon {
    fill: var(--accent);
  }
  .plank {
    stroke: var(--border-strong);
    stroke-width: 1.5;
  }
</style>
