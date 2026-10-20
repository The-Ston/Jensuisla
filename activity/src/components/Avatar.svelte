<script lang="ts">
  import type { MemberView } from '$shared/api-types';

  let { member, size = 32, ring = '' }: { member: MemberView | undefined; size?: number; ring?: string } = $props();
</script>

{#if member?.avatarUrl}
  <img
    class="avatar"
    src={member.avatarUrl}
    alt=""
    title={member.name}
    width={size}
    height={size}
    style:box-shadow={ring ? `0 0 0 2px ${ring}` : undefined}
  />
{:else}
  <span class="avatar fallback" style:width="{size}px" style:height="{size}px" title={member?.name} aria-hidden="true">
    {member?.name.slice(0, 1).toUpperCase() ?? '?'}
  </span>
{/if}

<style>
  .fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 13px;
    color: var(--muted);
  }
</style>
