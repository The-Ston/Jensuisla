<script lang="ts">
  import type { Comment, MemberView, ProgressUnit } from '$shared/api-types';
  import { REACTION_EMOJIS } from '$shared/domain/limits';
  import { img, positionText, timeAgo } from '../lib/format';
  import Avatar from './Avatar.svelte';

  let {
    comment,
    members,
    unit,
    meId,
    canModerate,
    onReact,
    onEdit,
    onDelete,
  }: {
    comment: Comment;
    members: Record<string, MemberView>;
    unit: ProgressUnit;
    meId: string;
    canModerate: boolean;
    onReact: (emoji: string) => Promise<void>;
    onEdit: (text: string) => Promise<void>;
    onDelete: () => Promise<void>;
  } = $props();

  let picking = $state(false);
  let editing = $state(false);
  let draft = $state('');
  let busy = $state(false);

  const author = $derived(members[comment.authorId]);
  const mine = $derived(comment.authorId === meId);
  const reactions = $derived(Object.entries(comment.reactions).filter(([, ids]) => ids.length > 0));

  const names = (ids: string[]) => ids.map((id) => members[id]?.name ?? '?').join(', ');

  async function run(action: () => Promise<void>) {
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }

  function startEdit() {
    draft = comment.text;
    editing = true;
  }

  async function saveEdit(event: SubmitEvent) {
    event.preventDefault();
    await run(() => onEdit(draft));
    editing = false;
  }

  // Inline confirmation: browser dialogs may be blocked inside the Activity iframe.
  let confirming = $state(false);
</script>

<article>
  <Avatar member={author} size={36} />
  <div class="body">
    <div class="meta">
      <strong>{author?.name ?? 'Ancien membre'}</strong>
      <span class="muted">{positionText(unit, comment.position)} · {timeAgo(comment.createdAt)}{comment.editedAt ? ' · modifié' : ''}</span>
    </div>

    {#if editing}
      <form class="edit" onsubmit={saveEdit}>
        <label class="sr-only" for="edit-{comment.id}">Modifier le commentaire</label>
        <textarea id="edit-{comment.id}" class="input" rows="3" maxlength="1000" bind:value={draft}></textarea>
        <div class="row">
          <button type="button" class="btn small ghost" onclick={() => (editing = false)}>Annuler</button>
          <button class="btn small primary" disabled={busy}>Enregistrer</button>
        </div>
      </form>
    {:else if comment.text}
      <p>{comment.text}</p>
    {/if}

    {#if comment.gif}
      <img
        class="gif"
        src={img(comment.gif.url)}
        alt={comment.gif.title || 'GIF'}
        width={comment.gif.width || undefined}
        height={comment.gif.height || undefined}
        loading="lazy"
      />
    {/if}

    <div class="reactions">
      {#each reactions as [emoji, ids] (emoji)}
        <button
          class="pill"
          class:mine={ids.includes(meId)}
          title={names(ids)}
          aria-pressed={ids.includes(meId)}
          aria-label="{emoji} {ids.length} : {names(ids)}"
          disabled={busy}
          onclick={() => run(() => onReact(emoji))}>{emoji} {ids.length}</button
        >
      {/each}
      <button class="pill add" aria-label="Ajouter une réaction" aria-expanded={picking} onclick={() => (picking = !picking)}>
        +
      </button>
      {#if mine && !editing && comment.text}
        <button class="link" onclick={startEdit}>Modifier</button>
      {/if}
      {#if mine || canModerate}
        {#if confirming}
          <button class="link danger" disabled={busy} onclick={() => run(onDelete)}>Confirmer la suppression</button>
          <button class="link" onclick={() => (confirming = false)}>Non</button>
        {:else}
          <button class="link" onclick={() => (confirming = true)}>Supprimer</button>
        {/if}
      {/if}
    </div>

    {#if picking}
      <div class="picker" role="group" aria-label="Choisir une réaction">
        {#each REACTION_EMOJIS as emoji (emoji)}
          <button
            disabled={busy}
            onclick={async () => {
              picking = false;
              await run(() => onReact(emoji));
            }}>{emoji}</button
          >
        {/each}
      </div>
    {/if}
  </div>
</article>

<style>
  article {
    display: flex;
    gap: 12px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .meta {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .meta .muted {
    font-size: 12px;
  }
  p {
    margin: 0;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .gif {
    max-width: min(100%, 280px);
    height: auto;
    border-radius: 8px;
  }
  .reactions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .pill {
    min-height: 30px;
    padding: 0 10px;
    border-radius: 15px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-size: 13px;
  }
  .pill.mine {
    border-color: var(--accent);
    background: rgba(232, 163, 61, 0.18);
  }
  .pill.add {
    color: var(--muted);
  }
  .link {
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 12px;
    padding: 4px;
  }
  .link:hover {
    color: var(--text);
  }
  .link.danger {
    color: var(--danger);
  }
  .picker {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 6px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    width: fit-content;
  }
  .picker button {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 20px;
  }
  .picker button:hover {
    background: var(--border-strong);
  }
  .edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
</style>
