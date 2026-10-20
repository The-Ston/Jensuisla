import { searchBooks } from './books';
import { IMAGE_HOSTS } from './discord/cdn';
import { exchangeOAuthCode } from './discord/rest';
import { verifyInteraction } from './discord/verify';
import type { Env } from './env';
import { searchGifs } from './gifs';
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
  const interaction = JSON.parse(raw) as { type: number; data?: { custom_id?: string } };
  if (interaction.type === 1) return json({ type: 1 }); // PING -> PONG
  // "Ouvrir Jensuisla" button on notifications: launch the Activity.
  if (interaction.type === 3 && interaction.data?.custom_id === 'jsl:launch') return json({ type: 12 });
  return json({ type: 4, data: { content: 'Ouvre Jensuisla depuis le lanceur d’Activités.', flags: 64 } });
}

/** Proxies an allow-listed external image (the Activity sandbox only reaches its own origin). */
async function proxyImage(url: string | null): Promise<Response> {
  if (!url || !IMAGE_HOSTS.test(url)) return new Response('forbidden', { status: 403 });
  const upstream = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!upstream.ok) return new Response('not found', { status: 404 });
  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': 'public, max-age=86400',
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

/** Routes that need a signed-in user, mapped to store operations. */
function toOp(method: string, parts: string[], data: Record<string, any>): Op | null {
  const [resource, id, sub, subId, subSub] = parts;
  if (resource === 'home' && method === 'GET') return { op: 'home' };
  if (resource === 'members' && method === 'GET') return { op: 'members' };
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
        };
    }
  }
  if (sub === 'comments' && subId) {
    if (method === 'PATCH' && !subSub)
      return {
        op: 'editComment',
        readingId: id,
        commentId: subId,
        text: String(data.text ?? ''),
        gif: 'gif' in data ? (data.gif ?? null) : undefined,
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
