// Photos are displayed with <img>, which can't send the Activity's access token. Instead, readers
// allowed to see a photo get a signed link. Expiry is bucketed so links stay identical (and
// cacheable) for hours instead of changing on every refresh.

const BUCKET_MS = 6 * 3600_000;

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`jensuisla-photos:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signPhotoLink(secret: string, readingId: string, photoId: string, now = Date.now()): Promise<string> {
  // Valid for 6 to 12 hours; readers refresh their view far more often than that.
  const expires = (Math.floor(now / BUCKET_MS) + 2) * BUCKET_MS;
  const sig = await hmac(secret, `${readingId}/${photoId}/${expires}`);
  return `/api/photo/${readingId}/${photoId}?e=${expires}&s=${sig}`;
}

export async function verifyPhotoLink(
  secret: string,
  readingId: string,
  photoId: string,
  expires: string | null,
  sig: string | null,
  now = Date.now(),
): Promise<boolean> {
  if (!expires || !sig || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  const expected = await hmac(secret, `${readingId}/${photoId}/${expires}`);
  // Constant-time comparison.
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
