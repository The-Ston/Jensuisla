import { searchBooks } from './books';
import { isAllowedImage, TWEMOJI } from './discord/cdn';
import { LAUNCH_ID } from './discord/launch';
import { exchangeOAuthCode } from './discord/rest';
import { verifyInteraction } from './discord/verify';
import type { Env } from './env';
import { searchGifs } from './gifs';
import { MAX_PHOTO_BYTES } from './domain/limits';
import { verifyPhotoLink } from './photo-links';
import type { Op, OpResult } from './store-do';

export { JensuislaStore } from './store-do';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function fail(status: number, error: string): Response {
  return json({ error }, status);
}

function store(env: Env) {
  return env.STORE.get(env.STORE.idFromName('main'));
}

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function fromResult(result: OpResult): Response {
  return result.ok ? json(result.data) : fail(result.status, result.error);
}

async function handleInteraction(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  const valid = await verifyInteraction(
    env.DISCORD_PUBLIC_KEY,
    request.headers.get('X-Signature-Ed25519'),
    request.headers.get('X-Signature-Timestamp'),
    raw,
  );
  if (!valid) return new Response('invalid signature', { status: 401 });
  const interaction = JSON.parse(raw) as { type: number; data?: { custom_id?: string; type?: number } };
  if (interaction.type === 1) return json({ type: 1 }); // PING -> PONG
  // Activity launcher's entry point, and the "Ouvrir Jensuisla" buttons: launch the Activity.
  if (interaction.type === 2 && interaction.data?.type === 4) return json({ type: 12 });
  if (interaction.type === 3 && interaction.data?.custom_id === LAUNCH_ID) return json({ type: 12 });
  return json({ type: 4, data: { content: 'Ouvre Jensuisla depuis le lanceur d’Activités.', flags: 64 } });
}

/** Proxies an allow-listed external image (the Activity sandbox only reaches its own origin). */
async function proxyImage(url: string | null): Promise<Response> {
  if (!url || !isAllowedImage(url)) return new Response('forbidden', { status: 403 });
  // Versioned Twemoji files never change; other images (avatars…) may.
  const ttl = TWEMOJI.test(url) ? 30 * 86400 : 86400;
  const upstream = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!upstream.ok) return new Response('not found', { status: 404 });
  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': `public, max-age=${ttl}`,
      // SVGs are served from our origin: never let one run scripts if opened directly.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

async function serveCover(request: Request, env: Env, ctx: ExecutionContext, readingId: string): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const source = await store(env).coverSource(readingId);
  if (!source) return new Response('not found', { status: 404 });
  const upstream = await fetch(source);
  if (!upstream.ok) return new Response('not found', { status: 404 });
  const response = new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=604800',
    },
  });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

/** Serves a photo to whoever holds a valid signed link (handed out only to readers allowed to see it). */
async function servePhoto(env: Env, ctx: ExecutionContext, url: URL, readingId: string, photoId: string): Promise<Response> {
  const valid = await verifyPhotoLink(
    env.DISCORD_CLIENT_SECRET,
    readingId,
    photoId,
    url.searchParams.get('e'),
    url.searchParams.get('s'),
  );
  if (!valid) return new Response('forbidden', { status: 403 });
  // Cached by photo, not by link: links change every few hours, the file never does.
  const cacheKey = new Request(`https://photos.jensuisla/${readingId}/${photoId}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;
  const source = await store(env).photoSource(readingId, photoId);
  if (!source) return new Response('not found', { status: 404 });
  const upstream = await fetch(source.url);
  if (!upstream.ok) return new Response('not found', { status: 404 });
  const response = new Response(upstream.body, {
    // "public" so the edge cache keeps it; the signed URL already restricts who gets it.
    headers: { 'Content-Type': source.contentType, 'Cache-Control': 'public, max-age=86400' },
  });
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

/** Routes that need a signed-in user, mapped to store operations. */
function toOp(method: string, parts: string[], data: Record<string, any>): Op | null {
  const [resource, id, sub, subId, subSub] = parts;
  if (resource === 'home' && method === 'GET') return { op: 'home' };
  if (resource === 'members' && method === 'GET') return { op: 'members' };
  if (resource === 'emojis' && method === 'GET') return { op: 'emojis' };
  if (resource === 'me' && id === 'notify' && method === 'PUT') return { op: 'notify', pref: data.pref };
  if (resource !== 'readings') return null;
  if (!id) return method === 'POST' ? { op: 'create', input: data as any } : null;
  if (!sub) return method === 'GET' ? { op: 'view', readingId: id } : null;
  if (method === 'POST' && !subId) {
    switch (sub) {
      case 'join':
        return { op: 'join', readingId: id };
      case 'invite':
        return { op: 'invite', readingId: id, userIds: Array.isArray(data.userIds) ? data.userIds : [] };
      case 'progress':
        return { op: 'progress', readingId: id, value: Number(data.value), editionTotal: data.editionTotal ?? null };
      case 'undo':
        return { op: 'undo', readingId: id };
      case 'visited':
        return { op: 'visited', readingId: id };
      case 'comments':
        return {
          op: 'comment',
          readingId: id,
          position: Number(data.position),
          text: String(data.text ?? ''),
          gif: data.gif ?? null,
          replyTo: typeof data.replyTo === 'string' ? data.replyTo : null,
          photos: Array.isArray(data.photos) ? data.photos.map(String) : [],
        };
    }
  }
  if (sub === 'photos' && subId && method === 'DELETE') return { op: 'discardPhoto', readingId: id, photoId: subId };
  if (sub === 'comments' && subId) {
    if (method === 'PATCH' && !subSub)
      return {
        op: 'editComment',
        readingId: id,
        commentId: subId,
        text: String(data.text ?? ''),
        gif: 'gif' in data ? (data.gif ?? null) : undefined,
        photos: Array.isArray(data.photos) ? data.photos.map(String) : undefined,
      };
    if (method === 'DELETE' && !subSub) return { op: 'deleteComment', readingId: id, commentId: subId };
    if (method === 'POST' && subSub === 'reactions')
      return { op: 'react', readingId: id, commentId: subId, emoji: String(data.emoji ?? '') };
  }
  return null;
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const method = request.method;

  // Public routes (images can't send an Authorization header).
  if (parts[0] === 'token' && method === 'POST') {
    const { code } = await body<{ code?: string }>(request);
    if (!code) return fail(400, 'code manquant');
    const token = await exchangeOAuthCode(env.DISCORD_APPLICATION_ID, env.DISCORD_CLIENT_SECRET, code);
    return token ? json({ access_token: token }) : fail(401, 'Connexion refusée par Discord');
  }
  if (parts[0] === 'img' && method === 'GET') return proxyImage(url.searchParams.get('u'));
  if (parts[0] === 'cover' && parts[1] && method === 'GET') return serveCover(request, env, ctx, parts[1]);
  if (parts[0] === 'photo' && parts[1] && parts[2] && method === 'GET') return servePhoto(env, ctx, url, parts[1], parts[2]);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const userId = token ? await store(env).authenticate(token) : null;
  if (!userId) return fail(401, 'Session expirée, relance l’Activity');

  if (parts[0] === 'books' && method === 'GET') {
    const q = url.searchParams.get('q')?.trim();
    return json(q ? await searchBooks(q) : []);
  }
  if (parts[0] === 'gifs' && parts[1] === 'favorites') {
    if (method === 'GET') return fromResult(await store(env).run(userId, { op: 'favorites' }));
    if (method === 'POST') {
      const { id } = await body<{ id?: string }>(request);
      return fromResult(await store(env).run(userId, { op: 'toggleFavorite', gifId: String(id ?? '') }));
    }
  }
  if (parts[0] === 'gifs' && method === 'GET') {
    if (!env.GIPHY_API_KEY) return fail(503, 'GIF non configurés');
    return json(await searchGifs(env.GIPHY_API_KEY, url.searchParams.get('q')?.trim() ?? ''));
  }

  // Photo upload: the raw file is the request body.
  if (parts[0] === 'readings' && parts[1] && parts[2] === 'photos' && !parts[3] && method === 'POST') {
    const size = Number(request.headers.get('Content-Length') ?? 0);
    if (size > MAX_PHOTO_BYTES) return fail(413, 'Photo trop lourde (10 Mo maximum)');
    const data = await request.arrayBuffer();
    return fromResult(
      await store(env).run(userId, {
        op: 'uploadPhoto',
        readingId: parts[1],
        data,
        contentType: (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim(),
        width: Number(url.searchParams.get('w')),
        height: Number(url.searchParams.get('h')),
      }),
    );
  }

  const data = method === 'GET' || method === 'DELETE' ? {} : await body<Record<string, any>>(request);
  const op = toOp(method, parts, data);
  if (!op) return fail(404, 'Route inconnue');
  return fromResult(await store(env).run(userId, op));
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/interactions' && request.method === 'POST') return handleInteraction(request, env);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx, url);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
