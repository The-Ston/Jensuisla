<script lang="ts">
  import type { MemberView } from '$shared/api-types';
  import { rangeLabel, scaleLabel, toDisplay, type Scale } from '../lib/scale';
  import type { TimelinePoint } from '../lib/timeline';
  import Avatar from './Avatar.svelte';

  /**
   * Two lanes around the book's line: comment points above as labels, readers below with their
   * names. Rows are stacked within each lane so that nothing overlaps.
   */
  let {
    scale,
    points,
    readers,
    myProgress,
    selected,
    onSelect,
  }: {
    scale: Scale;
    points: TimelinePoint[];
    readers: { member: MemberView; progress: number; isMe: boolean }[];
    myProgress: number;
    selected: number | 'here' | 'all';
    onSelect: (key: number | 'here') => void;
  } = $props();

  const LABEL_ROW = 30;
  const READER_ROW = 46;
  const GAP = 6;
  const LABEL_ROWS = 3;
  const READER_ROWS = 2;
  const MAX_WIDTH = 2400;

  let width = $state(0);

  // The timeline is proportional, so it looks the same in every edition.
  const total = $derived(scale.total);
  const x = (position: number) => (total > 0 ? (position / total) * width : 0);

  function short(position: number): string {
    const n = toDisplay(scale, position);
    return scale.unit === 'page' ? `p. ${n}` : scale.unit === 'chapter' ? `ch. ${n}` : `${n} %`;
  }

  /**
   * Smallest line width at which boxes (sorted by position) fit in `rows` rows: each box must
   * clear the one `rows` places before it, which would otherwise share its row.
   */
  function neededWidth(items: { position: number; size: number }[], rows: number): number {
    let needed = 0;
    for (let i = 0; i + rows < items.length; i++) {
      const a = items[i];
      const b = items[i + rows];
      const span = total > 0 ? (b.position - a.position) / total : 0;
      if (span > 0) needed = Math.max(needed, ((a.size + b.size) / 2 + GAP) / span);
    }
    return needed;
  }

  /**
   * Places boxes centered on their position, kept inside the line's width, each in the first row
   * where it fits. Past `rows` rows (when the line can't grow wider), a new row is added rather
   * than letting boxes overlap.
   */
  function stack<T extends { position: number; size: number }>(items: T[]) {
    const rowEnds: number[] = [];
    return items.map((item) => {
      const anchor = x(item.position);
      const left = Math.max(0, Math.min(anchor - item.size / 2, width - item.size));
      let row = rowEnds.findIndex((end) => end + GAP <= left);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = left + item.size;
      return { ...item, anchor, left, row };
    });
  }

  const labelItems = $derived(
    points.map((p) => {
      const text = `${short(p.start)} · ${p.count}`;
      return { point: p, text, position: p.start, size: text.length * 7 + 20 };
    }),
  );
  const labels = $derived(stack(labelItems));
  const labelRows = $derived(Math.max(1, ...labels.map((l) => l.row + 1)));

  // Readers at the same position share one marker; mine comes first and selects "here".
  const groupItems = $derived.by(() => {
    const byProgress = new Map<number, typeof readers>();
    for (const r of readers) byProgress.set(r.progress, [...(byProgress.get(r.progress) ?? []), r]);
    if (!byProgress.has(myProgress)) byProgress.set(myProgress, []);
    return [...byProgress.entries()]
      .sort(([a], [b]) => a - b)
      .map(([progress, rs]) => {
        const sorted = [...rs].sort((a, b) => Number(b.isMe) - Number(a.isMe));
        const isHere = progress === myProgress;
        const names = sorted.map((r) => (r.isMe ? 'Toi' : r.member.name));
        const text = names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(' · ') || 'Toi';
        const avatars = sorted.slice(0, 3);
        return { progress, readers: sorted, avatars, isHere, text, position: progress, size: Math.max(24 + (avatars.length - 1) * 14, Math.min(text.length * 6.5, 120)) + 8 };
      });
  });
  const groups = $derived(stack(groupItems));
  const readerRows = $derived(Math.max(1, ...groups.map((g) => g.row + 1)));

  // Chapter readings get one graduation per chapter, numbered under the line when there's room.
  const chapters = $derived(scale.unit === 'chapter' ? scale.total : 0);
  // Wide enough for crowded spots to fit their rows; the scroller handles the overflow.
  const minWidth = $derived(
    Math.max(320, Math.min(Math.max(neededWidth(labelItems, LABEL_ROWS), neededWidth(groupItems, READER_ROWS), chapters * 14), MAX_WIDTH)),
  );
  const numberEvery = $derived(chapters && width ? Math.ceil(20 / (width / chapters)) : 1);
  const tickSpace = $derived(chapters ? 16 : 0);

  const lineTop = $derived(labelRows * LABEL_ROW + 14);
  const readersTop = $derived(lineTop + 10 + tickSpace);
  const label = (p: TimelinePoint) => rangeLabel(scale, p.start, p.end);
</script>

<div class="scroller">
  <div
    class="timeline"
    bind:clientWidth={width}
    style:min-width="{minWidth}px"
    style:height="{readersTop + readerRows * READER_ROW}px"
  >
    {#each labels as l (l.point.start)}
      {@const top = l.row * LABEL_ROW}
      <span class="stem" style:left="{l.anchor}px" style:top="{top + 22}px" style:height="{lineTop - top - 22}px"></span>
      <button
        class="label"
        class:selected={selected === l.point.start}
        style:left="{l.left}px"
        style:top="{top}px"
        style:width="{l.size}px"
        aria-label="{label(l.point)}, {l.point.count} message{l.point.count > 1 ? 's' : ''}{l.point.isNew ? ', nouveau' : ''}"
        aria-pressed={selected === l.point.start}
        title={label(l.point)}
        onclick={() => onSelect(l.point.start)}
      >
        {l.text}
        {#if l.point.isNew}<span class="new" aria-hidden="true"></span>{/if}
      </button>
    {/each}

    <div class="track" style:top="{lineTop}px"></div>
    <div class="fill" style:top="{lineTop}px" style:width="{x(myProgress)}px"></div>

    {#each { length: chapters + 1 }, i (i)}
      <span class="tick" class:read={i <= myProgress} style:left="{x(i)}px" style:top="{lineTop}px"></span>
      {#if i > 0 && (i === 1 || i % numberEvery === 0)}
        <span class="chapter" class:read={i <= myProgress} style:left="{x(i - 0.5)}px" style:top="{lineTop + 8}px">{i}</span>
      {/if}
    {/each}

    {#each groups as g (g.progress)}
      {@const top = readersTop + g.row * READER_ROW}
      {#if g.row > 0}
        <span class="stem low" style:left="{g.anchor}px" style:top="{lineTop + 6}px" style:height="{top - lineTop - 6}px"></span>
      {/if}
      {#if g.isHere}
        <button
          class="readers here"
          class:selected={selected === 'here'}
          style:left="{g.left}px"
          style:top="{top}px"
          style:width="{g.size}px"
          aria-label="Ma position : {scaleLabel(scale, g.progress)}"
          aria-pressed={selected === 'here'}
          onclick={() => onSelect('here')}
        >
          {@render faces(g)}
        </button>
      {:else}
        <span class="readers" style:left="{g.left}px" style:top="{top}px" style:width="{g.size}px" title={g.readers.map((r) => r.member.name).join(', ') + ' : ' + scaleLabel(scale, g.progress)}>
          {@render faces(g)}
        </span>
      {/if}
    {/each}
  </div>
</div>

{#snippet faces(g: (typeof groups)[number])}
  <span class="faces">
    {#each g.avatars as r (r.member.id)}
      <Avatar member={r.member} size={24} ring={r.isMe ? 'var(--me)' : 'var(--surface)'} />
    {:else}
      <span class="dot-me"></span>
    {/each}
  </span>
  <span class="names">{g.text}</span>
{/snippet}

<style>
  .scroller {
    overflow-x: auto;
    padding: 0 18px;
  }
  .timeline {
    position: relative;
    margin: 0 4px;
  }
  .stem {
    position: absolute;
    width: 2px;
    transform: translateX(-50%);
    background: var(--border-strong);
  }
  .label {
    position: absolute;
    height: 22px;
    padding: 0 6px;
    border: 0;
    border-radius: 11px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .track,
  .fill {
    position: absolute;
    left: 0;
    height: 4px;
    margin-top: -2px;
    border-radius: 2px;
  }
  .track {
    right: 0;
    background: var(--border);
  }
  .fill {
    background: var(--accent);
  }
  .tick {
    position: absolute;
    width: 2px;
    height: 14px;
    transform: translate(-50%, -50%);
    border-radius: 1px;
    background: var(--border-strong);
  }
  .tick.read {
    background: var(--accent);
  }
  .chapter {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    line-height: 1;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .chapter.read {
    color: var(--accent);
  }
  .readers {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 2px 0;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font: inherit;
  }
  .faces {
    display: flex;
  }
  .faces > :global(* + *) {
    margin-left: -10px;
  }
  .dot-me {
    width: 14px;
    height: 14px;
    margin: 5px;
    border-radius: 50%;
    background: var(--me);
  }
  .names {
    max-width: 100%;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .here .names {
    color: var(--me);
    font-weight: 700;
  }
  .label.selected {
    background: #fff;
    box-shadow: 0 0 0 3px rgba(232, 163, 61, 0.5);
  }
  .here.selected {
    background: rgba(106, 169, 255, 0.15);
    box-shadow: 0 0 0 2px rgba(106, 169, 255, 0.5);
  }
  .new {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ok);
    border: 2px solid var(--surface);
  }
</style>
