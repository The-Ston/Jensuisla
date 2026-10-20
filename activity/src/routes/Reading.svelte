<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Gif, MemberView, ReadingView } from '$shared/api-types';
  import Avatar from '../components/Avatar.svelte';
  import CommentItem from '../components/CommentItem.svelte';
  import Composer from '../components/Composer.svelte';
  import ProgressPanel from '../components/ProgressPanel.svelte';
  import Timeline from '../components/Timeline.svelte';
  import { api } from '../lib/api';
  import { positionText } from '../lib/format';
  import { buildPoints } from '../lib/timeline';

  let { id, onBack }: { id: string; onBack: () => void } = $props();

  const REFRESH_MS = 20_000;
  const TOAST_MS = 8_000;

  let view = $state<ReadingView | null>(null);
  let error = $state('');
  let selected = $state<number | 'here' | 'all'>('here');
  // Last visit as it was when the page opened: drives the "new" badges for this session.
  let lastVisit = $state<{ at: number; progress: number } | null>(null);
  let seen = $state(new Set<number>());
  let toast = $state<{ text: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  let inviting = $state(false);
  let members = $state<MemberView[]>([]);
  let toInvite = $state<string[]>([]);
  let timer: ReturnType<typeof setInterval> | undefined;

  const reading = $derived(view?.reading);
  const myProgress = $derived(view?.me?.progress ?? 0);
  const points = $derived(view ? buildPoints(view, view.viewerId, lastVisit, seen) : []);
  const selectedPoint = $derived(typeof selected === 'number' ? points.find((p) => p.start === selected) : undefined);
  const selectedIndex = $derived(selectedPoint ? points.indexOf(selectedPoint) : -1);
  const shownComments = $derived.by(() => {
    if (!view) return [];
    if (selected === 'all') return view.comments;
    if (selectedPoint) return selectedPoint.comments;
    return view.comments.filter((c) => c.position === myProgress);
  });
  const anchor = $derived(selectedPoint ? selectedPoint.end : myProgress);
  // Position used by the composer: follows the selection, but the reader can change it.
  let composerPosition = $state(0);
  let composer: { focus: () => void } | undefined = $state();
  $effect(() => {
    composerPosition = anchor;
  });
  const readers = $derived(
    view
      ? view.participants.map((p) => ({
          member: view!.members[p.userId]!,
          progress: p.progress,
          isMe: p.userId === view!.viewerId,
        }))
      : [],
  );

  async function load(first = false) {
    try {
      const next = await api.reading(id);
      if (first) {
        lastVisit = next.me?.lastVisit ?? null;
        if (next.me) void api.visited(id).catch(() => undefined);
      }
      apply(next);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Chargement impossible';
    }
  }

  function apply(next: ReadingView) {
    view = next;
    // A point may vanish (after going back): fall back to my position.
    if (typeof selected === 'number' && !buildPoints(next, next.viewerId, null, seen).some((p) => p.start === selected))
      selected = 'here';
  }

  onMount(() => {
    void load(true);
    timer = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
  });

  onDestroy(() => {
    clearInterval(timer);
    if (toast) clearTimeout(toast.timer);
  });

  function select(key: number | 'here' | 'all') {
    selected = key;
    if (typeof key === 'number') seen = new Set([...seen, key]);
  }

  async function mutate(action: () => Promise<ReadingView>) {
    apply(await action());
  }

  function showToast(text: string) {
    if (toast) clearTimeout(toast.timer);
    toast = { text, timer: setTimeout(() => (toast = null), TOAST_MS) };
  }

  async function changeProgress(value: number, editionTotal: number | null) {
    await mutate(() => api.progress(id, value, editionTotal));
    if (view?.me) showToast(`Avancement enregistré : ${positionText(view.reading.unit, view.me.progress)}`);
  }

  async function undo() {
    if (toast) clearTimeout(toast.timer);
    toast = null;
    await mutate(() => api.undo(id));
  }

  async function join() {
    try {
      await mutate(() => api.join(id));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Impossible de rejoindre';
    }
  }

  async function openInvite() {
    inviting = !inviting;
    if (inviting && members.length === 0) members = await api.members().catch(() => []);
  }

  async function sendInvites() {
    if (toInvite.length === 0) return;
    try {
      await mutate(() => api.invite(id, toInvite));
      toInvite = [];
      inviting = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Invitation impossible';
    }
  }

  const sendComment = (text: string, gif: Gif | null, position: number) =>
    mutate(() => api.comment(id, { position, text, gif }));

  function replyTo(position: number) {
    composerPosition = position;
    composer?.focus();
  }

  function step(delta: number) {
    const target = points[selectedIndex + delta] ?? (delta < 0 && selected !== 'all' && selectedIndex === -1 ? points[points.length - 1] : undefined);
    if (target) select(target.start);
  }
</script>

<main>
  {#if view && reading}
    <header>
      <button class="btn ghost small" onclick={onBack}>‹ Mes lectures</button>
      <div class="book">
        {#if reading.coverUrl}
          <img src={reading.coverUrl} alt="" class="cover" />
        {/if}
        <div>
          <h1>{reading.title}</h1>
          <p class="muted">
            {reading.author ? `${reading.author} · ` : ''}{reading.total}
            {reading.unit === 'chapter' ? 'chapitres' : reading.unit === 'page' ? 'pages' : '%'} · {view.participants.length} lecteur{view.participants.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>
      {#if reading.canInvite}
        <button class="btn small" aria-expanded={inviting} onclick={openInvite}>Inviter</button>
      {/if}
    </header>

    {#if error}<p class="error">{error}</p>{/if}

    {#if inviting}
      <section class="card invite">
        <div class="members">
          {#each members.filter((m) => !view!.participants.some((p) => p.userId === m.id)) as m (m.id)}
            <label class="member" class:active={toInvite.includes(m.id)}>
              <input
                type="checkbox"
                checked={toInvite.includes(m.id)}
                onchange={() => (toInvite = toInvite.includes(m.id) ? toInvite.filter((x) => x !== m.id) : [...toInvite, m.id])}
              />
              <Avatar member={m} size={24} />
              {m.name}
            </label>
          {:else}
            <p class="muted">Tout le monde participe déjà.</p>
          {/each}
        </div>
        <button class="btn primary small" disabled={toInvite.length === 0} onclick={sendInvites}>Inviter</button>
      </section>
    {/if}

    {#if !view.me}
      <section class="card join">
        <p>Tu ne participes pas encore à cette lecture : les commentaires sont masqués.</p>
        {#if reading.canJoin}<button class="btn primary" onclick={join}>Je participe</button>{/if}
      </section>
    {:else}
      <ProgressPanel unit={reading.unit} total={reading.total} me={view.me} onChange={changeProgress} onUndo={undo} />
    {/if}

    <section class="card timeline-card" aria-label="Frise">
      <div class="timeline-head">
        <h2>Frise</h2>
        <span class="muted small">Clique sur un point pour voir ses messages</span>
      </div>
      <Timeline
        unit={reading.unit}
        total={reading.total}
        {points}
        {readers}
        {myProgress}
        {selected}
        onSelect={select}
      />
    </section>

    {#if view.me}
      <section class="card thread" aria-label="Messages">
        <div class="thread-head">
          <h2>
            {#if selected === 'all'}
              Tous les messages
            {:else if selectedPoint}
              {selectedPoint.start === selectedPoint.end
                ? positionText(reading.unit, selectedPoint.start)
                : `${positionText(reading.unit, selectedPoint.start)} à ${selectedPoint.end}`}
            {:else}
              Ma position : {positionText(reading.unit, myProgress)}
            {/if}
          </h2>
          <div class="nav">
            <button class="btn small" disabled={selected === 'all' || selectedIndex === 0 || points.length === 0} onclick={() => step(-1)}>‹ Précédent</button>
            <button class="btn small" disabled={selected === 'all' || selectedIndex === -1 || selectedIndex >= points.length - 1} onclick={() => step(1)}>Suivant ›</button>
            <button class="btn small" class:on={selected === 'all'} aria-pressed={selected === 'all'} onclick={() => select(selected === 'all' ? 'here' : 'all')}>
              Tout voir
            </button>
          </div>
        </div>

        <div class="comments">
          {#each shownComments as comment (comment.id)}
            <CommentItem
              {comment}
              members={view.members}
              unit={reading.unit}
              meId={view.viewerId}
              canModerate={reading.organizerId === view.viewerId}
              onReact={(emoji) => mutate(() => api.react(id, comment.id, emoji))}
              onReply={() => replyTo(comment.position)}
              onEdit={(text, gif) => mutate(() => api.editComment(id, comment.id, text, gif))}
              onDelete={() => mutate(() => api.deleteComment(id, comment.id))}
            />
          {:else}
            <p class="muted">
              {selected === 'all' ? 'Aucun message visible pour l’instant.' : 'Personne n’a encore écrit ici. Lance la discussion !'}
            </p>
          {/each}
          {#if selected === 'all' && myProgress < reading.total}
            <p class="muted small locked-note">Les messages après {positionText(reading.unit, myProgress).toLowerCase()} sont masqués.</p>
          {/if}
        </div>

        <Composer
          bind:this={composer}
          bind:position={composerPosition}
          unit={reading.unit}
          max={myProgress}
          onSend={sendComment}
        />
      </section>
    {/if}

    {#if toast}
      <div class="toast" role="status">
        <span>{toast.text}</span>
        <button class="btn small" onclick={undo}>Annuler</button>
      </div>
    {/if}
  {:else if error}
    <p class="error">{error}</p>
    <button class="btn" onclick={onBack}>Retour</button>
  {:else}
    <p class="muted">Chargement…</p>
  {/if}
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 16px 16px 96px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .book {
    display: flex;
    gap: 12px;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .cover {
    width: 44px;
    height: 64px;
    border-radius: 4px;
    object-fit: cover;
  }
  h1 {
    font-size: 22px;
  }
  h2 {
    font-size: 17px;
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .invite,
  .join {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  .members {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .member {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 20px;
    border: 1px solid var(--border-strong);
  }
  .member.active {
    border-color: var(--accent);
  }
  .timeline-card {
    padding: 12px 0 8px;
  }
  .timeline-head {
    display: flex;
    gap: 12px;
    align-items: baseline;
    padding: 0 16px;
    flex-wrap: wrap;
  }
  .thread {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .thread-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .nav {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .nav .on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .comments {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .locked-note {
    text-align: center;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 10px 12px 10px 16px;
    border-radius: 10px;
    background: #2f3240;
    border: 1px solid var(--border-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    max-width: calc(100% - 32px);
  }
</style>
