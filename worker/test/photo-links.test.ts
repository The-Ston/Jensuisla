import { describe, expect, it } from 'vitest';
import { signPhotoLink, verifyPhotoLink } from '../src/photo-links';

describe('photo links', () => {
  const now = Date.UTC(2026, 9, 20, 15);

  async function parts(link: string) {
    const u = new URL(link, 'https://x');
    return { e: u.searchParams.get('e'), s: u.searchParams.get('s') };
  }

  it('accepts its own links and stays stable for hours', async () => {
    const link = await signPhotoLink('secret', 'r1', 'p1', now);
    const { e, s } = await parts(link);
    expect(await verifyPhotoLink('secret', 'r1', 'p1', e, s, now)).toBe(true);
    expect(await signPhotoLink('secret', 'r1', 'p1', now + 60_000)).toBe(link);
  });

  it('rejects tampered, foreign or expired links', async () => {
    const { e, s } = await parts(await signPhotoLink('secret', 'r1', 'p1', now));
    expect(await verifyPhotoLink('secret', 'r1', 'p2', e, s, now)).toBe(false);
    expect(await verifyPhotoLink('other', 'r1', 'p1', e, s, now)).toBe(false);
    expect(await verifyPhotoLink('secret', 'r1', 'p1', String(Number(e) + 1), s, now)).toBe(false);
    expect(await verifyPhotoLink('secret', 'r1', 'p1', e, s, now + 13 * 3600_000)).toBe(false);
    expect(await verifyPhotoLink('secret', 'r1', 'p1', null, s, now)).toBe(false);
  });
});
