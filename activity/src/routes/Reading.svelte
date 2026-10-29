<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import type { Comment, Gif, MemberView, ProgressUnit, ReadingView } from '$shared/api-types';
  import Avatar from '../components/Avatar.svelte';
  import CommentItem from '../components/CommentItem.svelte';
  import Composer from '../components/Composer.svelte';
  import ProgressPanel from '../components/ProgressPanel.svelte';
  import Timeline from '../components/Timeline.svelte';
  import { api } from '../lib/api';
  import { emojis } from '../lib/emojis.svelte';
  import { displayTotal, makeScale, rangeLabel, scaleLabel } from '../lib/scale';
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
  const spoilers = $derived(!!view?.me?.spoilers);
  const autoAdvance = $derived(!!view?.me?.autoAdvance);
  // How far the reader can read and write: the whole book once they chose to see spoilers.
  const reach = $derived(spoilers ? (view?.reading.total ?? 0) : myProgress);
  let settingsOpen = $state(false);
  let settingsEl: HTMLElement | undefined = $state();
  // Everything is shown in the reader's own scale: their edition, or percent <-> pages.
  const scale = $derived(
    makeScale(
      view?.reading.unit ?? 'chapter',
      view?.reading.total ?? 1,
      view?.me ? { unit: view.me.unit, editionTotal: view.me.editionTotal } : null,
      view?.me ? { progress: view.me.progress, shown: view.me.shownProgress } : null,
    ),
  );
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
  let composerReply = $state<Comment | null>(null);
  let composer: { focus: () => void } | undefined = $state();
  $effect(() => {
    // A reply can't move before its original, even when another point is selected.
    composerPosition = Math.max(anchor, untrack(() => composerReply?.position ?? 0));
  });
  const commentsById = $derived(new Map((view?.comments ?? []).map((c) => [c.id, c])));
  // Originals are always visible when their reply is: a reply is never placed before them.
  const originalOf = (c: Comment) => (c.replyTo ? (commentsById.get(c.replyTo) ?? null) : undefined);
  let highlightedId = $state<string | null>(null);
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
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
    // Server emojis are needed to display existing reactions.
    void emojis.loadCustom();
    timer = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
  });

  onDestroy(() => {
    clearInterval(timer);
    clearTimeout(highlightTimer);
    if (toast) clearTimeout(toast.timer);
  });

  // Everything shown until now counts as read on the home page, so the visit is saved before it loads.
  let leaving = $state(false);
  async function back() {
    leaving = true;
    if (view?.me) await api.visited(id).catch(() => undefined);
    onBack();
  }

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

  async function changeProgress(value: number, editionTotal: number | null, unit: ProgressUnit) {
    await mutate(() => api.progress(id, value, editionTotal, unit));
    if (view?.me) showToast(`Avancement enregistré : ${scaleLabel(scale, view.me.progress)}`);
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

  async function toggleSpoilers() {
    try {
      await mutate(() => api.spoilers(id, !spoilers));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Enregistrement impossible';
    }
  }

  async function toggleAutoAdvance() {
    try {
      await mutate(() => api.autoAdvance(id, !autoAdvance));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Enregistrement impossible';
    }
  }

  function closeSettingsOutside(event: MouseEvent) {
    if (settingsOpen && settingsEl && !settingsEl.contains(event.target as Node)) settingsOpen = false;
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

  async function sendComment(text: string, gif: Gif | null, position: number, replyTo: string | null, photos: string[]) {
    const before = myProgress;
    await mutate(() => api.comment(id, { position, text, gif, replyTo, photos }));
    // Commenting ahead moved the progress (auto-advance): say so, with a way back.
    if (view?.me && view.me.progress > before) showToast(`Avancement passé à ${scaleLabel(scale, view.me.progress).toLowerCase()}`);
  }

  function replyTo(comment: Comment) {
    composerReply = comment;
    composerPosition = comment.position;
    composer?.focus();
  }

  /** Follows a page mention: selects the timeline point closest to that page. */
  async function jumpToPosition(position: number) {
    if (position > reach) return;
    const containing = points.find((p) => p.start <= position && position <= p.end);
    const closest =
      containing ??
      [...points].sort((a, b) => Math.abs(a.start - position) - Math.abs(b.start - position))[0];
    select(closest ? closest.start : 'here');
    await tick();
    document.querySelector('.thread')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** Shows the original of a reply: selects its point, scrolls to it and flashes it. */
  async function jumpTo(commentId: string) {
    const point = points.find((p) => p.comments.some((c) => c.id === commentId));
    if (point && selected !== 'all') select(point.start);
    await tick();
    document.getElementById(`comment-${commentId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    clearTimeout(highlightTimer);
    highlightedId = commentId;
    highlightTimer = setTimeout(() => (highlightedId = null), 1600);
  }

  /**
   * Opens a reader's furthest comment among those I can see (the server only sends visible
   * ones): the closest to where they are, as far as my own reach allows.
   */
  function jumpToReader(userId: string) {
    const latest = view?.comments
      .filter((c) => c.authorId === userId)
      .reduce<Comment | undefined>(
        (best, c) => (!best || c.position > best.position || (c.position === best.position && c.createdAt > best.createdAt) ? c : best),
        undefined,
      );
    if (latest) void jumpTo(latest.id);
    else showToast(`${view?.members[userId]?.name ?? 'Cette personne'} n’a encore rien écrit que tu peux lire.`);
  }

  function step(delta: number) {
    const target = points[selectedIndex + delta] ?? (delta < 0 && selected !== 'all' && selectedIndex === -1 ? points[points.length - 1] : undefined);
    if (target) select(target.start);
  }
</script>

<svelte:window
  onclick={closeSettingsOutside}
  onkeydown={(e) => e.key === 'Escape' && (settingsOpen = false)}
/>

<main>
  {#if view && reading}
    <header>
      <button class="btn ghost small" disabled={leaving} onclick={back}>‹ Mes lectures</button>
      <div class="book">
        {#if reading.coverUrl}
          <img src={reading.coverUrl} alt="" class="cover" />
        {/if}
        <div>
          <h1>{reading.title}</h1>
          <p class="muted">
            {reading.author ? `${reading.author} · ` : ''}{displayTotal(scale)}&nbsp;{scale.unit === 'chapter' ? 'chapitres' : scale.unit === 'page' ? 'pages' : '%'}{scale.edition && scale.unit === 'page' ? ' (ton édition)' : ''} · {view.participants.length} lecteur{view.participants.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div class="actions">
        {#if reading.canInvite}
          <button class="btn small" aria-expanded={inviting} onclick={openInvite}>Inviter</button>
        {/if}
        {#if view.me}
          <div class="settings" bind:this={settingsEl}>
            <button
              class="btn small gear"
              aria-label="Réglages de cette lecture"
              aria-expanded={settingsOpen}
              aria-controls="reading-settings"
              onclick={() => (settingsOpen = !settingsOpen)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {#if settingsOpen}
              <div class="menu" id="reading-settings">
                <h3>Réglages de cette lecture</h3>
                <label class="setting">
                  <span class="setting-text">
                    <strong>Voir les spoilers</strong>
                    <span class="muted small">Affiche aussi les messages après ta position ({scaleLabel(scale, myProgress).toLowerCase()}) et permet d’y écrire.</span>
                  </span>
                  <span class="switch">
                    <input type="checkbox" role="switch" checked={spoilers} onchange={toggleSpoilers} />
                    <span class="knob" aria-hidden="true"></span>
                  </span>
                </label>
                <!-- Only means something with spoilers: without them, writing ahead isn't possible. -->
                <label class="setting" class:disabled={!spoilers}>
                  <span class="setting-text">
                    <strong>Avancer en commentant</strong>
                    <span class="muted small">
                      {spoilers ? 'Commenter après ta position y déplace ton avancement.' : 'Active « Voir les spoilers » pour l’utiliser.'}
                    </span>
                  </span>
                  <span class="switch calm">
                    <input type="checkbox" role="switch" checked={spoilers && autoAdvance} disabled={!spoilers} onchange={toggleAutoAdvance} />
                    <span class="knob" aria-hidden="true"></span>
                  </span>
                </label>
              </div>
            {/if}
          </div>
        {/if}
      </div>
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
        {#if spoilers}
          <span class="spoilers-on">Spoilers visibles</span>
        {:else}
          <span class="muted small">Clique sur un point pour voir ses messages</span>
        {/if}
      </div>
      <Timeline
        {scale}
        {points}
        {readers}
        {myProgress}
        {spoilers}
        {selected}
        onSelect={select}
        onReader={jumpToReader}
      />
    </section>

    {#if view.me}
      <section class="card thread" aria-label="Messages">
        <div class="thread-head">
          <h2>
            {#if selected === 'all'}
              Tous les messages
            {:else if selectedPoint}
              {rangeLabel(scale, selectedPoint.start, selectedPoint.end)}
            {:else}
              Ma position : {scaleLabel(scale, myProgress)}
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
          {#each shownComments as comment, i (comment.id)}
            {@const previous = shownComments[i - 1]}
            {#if comment.position > myProgress && (!previous || previous.position <= myProgress)}
              <div class="separator spoiler" role="separator">
                <span>Après ta position · {scaleLabel(scale, myProgress)}</span>
              </div>
            {:else if previous && comment.position !== previous.position}
              <div class="separator" role="separator">
                <span>{scaleLabel(scale, comment.position)}</span>
              </div>
            {/if}
            <CommentItem
              {comment}
              members={view.members}
              {scale}
              meId={view.viewerId}
              canModerate={reading.organizerId === view.viewerId}
              onReact={(emoji) => mutate(() => api.react(id, comment.id, emoji))}
              original={originalOf(comment)}
              highlighted={highlightedId === comment.id}
              spoiler={comment.position > myProgress}
              onJump={jumpTo}
              myProgress={reach}
              onJumpToPosition={jumpToPosition}
              onReply={() => replyTo(comment)}
              readingId={id}
              photoUrls={view.photoUrls}
              onEdit={(text, gif, photos) => mutate(() => api.editComment(id, comment.id, text, gif, photos))}
              onDelete={() => mutate(() => api.deleteComment(id, comment.id))}
            />
          {:else}
            <p class="muted">
              {selected === 'all' ? 'Aucun message visible pour l’instant.' : 'Personne n’a encore écrit ici. Lance la discussion !'}
            </p>
          {/each}
          {#if selected === 'all' && !spoilers && myProgress < reading.total}
            <p class="muted small locked-note">Les messages après {scaleLabel(scale, myProgress).toLowerCase()} sont masqués.</p>
          {/if}
        </div>

        <Composer
          bind:this={composer}
          bind:position={composerPosition}
          bind:replyTo={composerReply}
          replyAuthor={composerReply ? (view.members[composerReply.authorId]?.name ?? '') : ''}
          readingId={id}
          {scale}
          max={reach}
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
    <button class="btn" disabled={leaving} onclick={back}>Retour</button>
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
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-left: auto;
  }
  .settings {
    position: relative;
  }
  .gear {
    width: 32px;
    padding: 0;
  }
  .gear svg {
    width: 17px;
    height: 17px;
  }
  .gear[aria-expanded='true'] {
    border-color: var(--text);
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 5;
    width: min(300px, calc(100vw - 32px));
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  }
  .menu h3 {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .setting {
    display: flex;
    gap: 12px;
    align-items: center;
    cursor: pointer;
  }
  .setting-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .switch {
    position: relative;
    flex-shrink: 0;
    width: 40px;
    height: 24px;
  }
  .switch input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .knob {
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: var(--border-strong);
    pointer-events: none;
    transition: background 0.15s;
  }
  .knob::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--text);
    transition: transform 0.15s;
  }
  .switch input:checked + .knob {
    background: var(--danger);
  }
  .switch.calm input:checked + .knob {
    background: var(--me);
  }
  .setting.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .setting.disabled .switch input {
    cursor: not-allowed;
  }
  .switch input:checked + .knob::after {
    transform: translateX(16px);
  }
  .switch input:focus-visible + .knob {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .knob,
    .knob::after {
      transition: none;
    }
  }
  .spoilers-on {
    padding: 0 8px;
    border: 1px solid var(--danger);
    border-radius: 999px;
    color: var(--danger);
    font-size: 11px;
    font-weight: 700;
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
  .separator {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .separator::before,
  .separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-strong);
  }
  .separator.spoiler {
    color: var(--danger);
  }
  .separator.spoiler::before,
  .separator.spoiler::after {
    height: 0;
    border-top: 1px dashed var(--danger);
    background: none;
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
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    max-width: calc(100% - 32px);
  }
</style>
