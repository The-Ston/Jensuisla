<script lang="ts" module>
  import type { PhotoRef } from '$shared/api-types';

  export interface AttachItem {
    key: string;
    preview: string;
    ref: PhotoRef | null;
    uploading: boolean;
    error: string;
    /** Already part of the comment being edited (not uploaded in this session). */
    existing: boolean;
  }

  export function existingItems(photos: PhotoRef[], urls: Record<string, string>): AttachItem[] {
    return photos.map((p) => ({ key: p.id, preview: urls[p.id] ?? '', ref: p, uploading: false, error: '', existing: true }));
  }
</script>

<script lang="ts">
  import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_TYPES } from '$shared/domain/limits';
  import { api } from '../lib/api';

  let { readingId, items = $bindable() }: { readingId: string; items: AttachItem[] } = $props();

  let input: HTMLInputElement | undefined = $state();
  let notice = $state('');

  export function open() {
    input?.click();
  }

  /** Uploaded photos that were added in this session but not sent: deletes them. */
  export function discardNew() {
    for (const item of items) if (!item.existing && item.ref) void api.discardPhoto(readingId, item.ref.id).catch(() => undefined);
  }

  async function dimensions(file: File): Promise<{ width: number; height: number }> {
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    } catch {
      return { width: 0, height: 0 };
    }
  }

  async function upload(item: AttachItem, file: File) {
    try {
      const { width, height } = await dimensions(file);
      const ref = await api.uploadPhoto(readingId, file, width, height);
      items = items.map((i) => (i.key === item.key ? { ...i, ref, uploading: false } : i));
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Envoi impossible';
      items = items.map((i) => (i.key === item.key ? { ...i, uploading: false, error } : i));
    }
  }

  function onFiles(event: Event) {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    (event.currentTarget as HTMLInputElement).value = '';
    notice = '';
    for (const file of files) {
      if (items.length >= MAX_PHOTOS) {
        notice = `${MAX_PHOTOS} photos maximum par commentaire`;
        break;
      }
      if (!PHOTO_TYPES.includes(file.type)) {
        notice = `${file.name} : format non pris en charge (JPEG, PNG, WebP ou GIF)`;
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        notice = `${file.name} : trop lourde (10 Mo maximum)`;
        continue;
      }
      const item: AttachItem = {
        key: crypto.randomUUID(),
        preview: URL.createObjectURL(file),
        ref: null,
        uploading: true,
        error: '',
        existing: false,
      };
      items = [...items, item];
      void upload(item, file);
    }
  }

  function remove(item: AttachItem) {
    items = items.filter((i) => i.key !== item.key);
    if (!item.existing && item.ref) void api.discardPhoto(readingId, item.ref.id).catch(() => undefined);
    if (item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview);
  }
</script>

<input
  bind:this={input}
  type="file"
  accept={PHOTO_TYPES.join(',')}
  multiple
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  onchange={onFiles}
/>

{#if items.length > 0 || notice}
  <div class="attach">
    {#each items as item (item.key)}
      <div class="thumb" class:failed={!!item.error}>
        <img src={item.preview} alt="Pièce jointe" />
        {#if item.uploading}<span class="state">Envoi…</span>{/if}
        {#if item.error}<span class="state error-state" title={item.error}>Échec</span>{/if}
        <button type="button" class="remove" aria-label="Retirer la photo" onclick={() => remove(item)}>✕</button>
      </div>
    {/each}
    {#if notice}<p class="error notice">{notice}</p>{/if}
  </div>
{/if}

<style>
  .attach {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .thumb {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface-2);
  }
  .thumb.failed {
    outline: 2px solid var(--danger);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .state {
    position: absolute;
    inset: auto 0 0 0;
    padding: 2px;
    font-size: 11px;
    text-align: center;
    background: rgba(15, 16, 19, 0.8);
  }
  .error-state {
    color: var(--danger);
  }
  .remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 50%;
    background: rgba(15, 16, 19, 0.8);
    font-size: 12px;
  }
  .notice {
    margin: 0;
    font-size: 13px;
    flex-basis: 100%;
  }
</style>
