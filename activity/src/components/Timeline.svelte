<script lang="ts">
  import type { MemberView } from '$shared/api-types';
  import { rangeLabel, scaleLabel, type Scale } from '../lib/scale';
  import type { TimelinePoint } from '../lib/timeline';
  import Avatar from './Avatar.svelte';

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

  // The timeline is proportional, so it looks the same in every edition.
  const total = $derived(scale.total);
  const pct = (position: number) => (total > 0 ? (position / total) * 100 : 0);

  // Readers at the same position are spread slightly so every avatar stays visible.
  const placed = $derived.by(() => {
    const seen = new Map<number, number>();
    return readers.map((r) => {
      const index = seen.get(r.progress) ?? 0;
      seen.set(r.progress, index + 1);
      return { ...r, offset: index * 14 };
    });
  });

  const label = (p: TimelinePoint) => rangeLabel(scale, p.start, p.end);
</script>

<div class="scroller">
  <div class="timeline" style:min-width="{Math.max(320, Math.min(points.length * 44, 1400))}px">
    {#each placed as r (r.member.id)}
      <span class="reader" style:left="calc({pct(r.progress)}% + {r.offset}px)" title="{r.member.name} : {scaleLabel(scale, r.progress)}">
        <Avatar member={r.member} size={24} ring={r.isMe ? 'var(--me)' : 'var(--surface)'} />
      </span>
    {/each}

    <div class="track"></div>
    <div class="fill" style:width="{pct(myProgress)}%"></div>
    {#if myProgress < total}
      <div class="locked" style:left="calc({pct(myProgress)}% + 18px)"><span>verrouillé</span></div>
    {/if}

    {#each points as p (p.start)}
      {@const size = 24 + Math.min(p.count, 5) * 4}
      <button
        class="point"
        class:selected={selected === p.start}
        style:left="{pct(p.start)}%"
        style:width="{size}px"
        style:height="{size}px"
        aria-label="{label(p)}, {p.count} message{p.count > 1 ? 's' : ''}{p.isNew ? ', nouveau' : ''}"
        aria-pressed={selected === p.start}
        onclick={() => onSelect(p.start)}
      >
        {p.count}
        {#if p.isNew}<span class="new" aria-hidden="true"></span>{/if}
      </button>
    {/each}

    <button
      class="here"
      class:selected={selected === 'here'}
      style:left="{pct(myProgress)}%"
      aria-label="Ma position : {scaleLabel(scale, myProgress)}"
      aria-pressed={selected === 'here'}
      onclick={() => onSelect('here')}>ici</button
    >
  </div>
</div>

<style>
  .scroller {
    overflow-x: auto;
    padding: 0 18px;
  }
  .timeline {
    position: relative;
    height: 96px;
    margin: 0 4px;
  }
  .reader {
    position: absolute;
    top: 4px;
    transform: translateX(-50%);
    display: flex;
  }
  .track,
  .fill {
    position: absolute;
    left: 0;
    top: 52px;
    height: 4px;
    border-radius: 2px;
  }
  .track {
    right: 0;
    background: var(--border);
  }
  .fill {
    background: var(--accent);
  }
  .locked {
    position: absolute;
    right: -4px;
    top: 38px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--border-strong);
    border-radius: 6px;
    background: #1b1c21;
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
  }
  .point,
  .here {
    position: absolute;
    top: 54px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 0;
    padding: 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--accent-ink);
  }
  .point {
    background: var(--accent);
  }
  .here {
    width: 30px;
    height: 30px;
    font-size: 10px;
    background: var(--me);
    z-index: 1;
  }
  .selected {
    background: #fff;
    box-shadow: 0 0 0 4px rgba(232, 163, 61, 0.5);
  }
  .here.selected {
    box-shadow: 0 0 0 4px rgba(106, 169, 255, 0.5);
  }
  .new {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ok);
    border: 2px solid var(--surface);
  }
</style>
