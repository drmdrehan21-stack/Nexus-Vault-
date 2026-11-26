/**
 * Cloudflare Pages Function handling /api/* routes when deployed to Cloudflare Pages.
 * Keeps APPS_SCRIPT_URL, VAULT_ACCESS_KEY, and SESSION_SECRET strictly on the server
 * via Cloudflare Pages Environment Variables.
 */

interface Env {
  APPS_SCRIPT_URL?: string;
  VAULT_ACCESS_KEY?: string;
  SESSION_SECRET?: string;
}

const SESSION_COOKIE_NAME = 'nv_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      ...extraHeaders,
    },
  });
}

function parseCookies(header: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!header) return map;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        map[key] = decodeURIComponent(val);
      } catch {
        map[key] = val;
      }
    }
  }
  return map;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signValue(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(sig));
}

async function createSessionToken(secret: string): Promise<string> {
  const payload = JSON.stringify({ sid: crypto.randomUUID(), exp: Date.now() + SESSION_TTL_MS });
  const encoded = toBase64Url(new TextEncoder().encode(payload));
  const sig = await signValue(secret, encoded);
  return `${encoded}.${sig}`;
}

async function verifySessionToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, providedSig] = parts;
  const expectedSig = await signValue(secret, encoded);
  if (providedSig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < providedSig.length; i++) {
    diff |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return false;
  try {
    const json = new TextDecoder().decode(fromBase64Url(encoded));
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

async function callAppsScript(
  env: Env,
  action: string,
  payload: Record<string, unknown> = {},
  requestId = ''
) {
  const url = (env.APPS_SCRIPT_URL || '').trim();
  const accessKey = (env.VAULT_ACCESS_KEY || '').trim();
  if (!url || !accessKey) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'Unable to connect to server.', status: 503 };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, action, accessKey, requestId, payload }),
    redirect: 'follow',
  });
  if (!res.ok) {
    return { ok: false, code: 'SERVER_UNAVAILABLE', message: 'Unable to connect to server.', status: 502 };
  }
  const parsed = (await res.json()) as {
    ok?: boolean;
    success?: boolean;
    data?: Record<string, unknown>;
    error?: { code?: string; message?: string };
  };
  if (parsed.ok !== true && parsed.success !== true) {
    const code = parsed.error?.code || 'API_ERROR';
    return {
      ok: false,
      code,
      message: parsed.error?.message || 'Unable to process request on server.',
      status: code === 'PIN_LOCKED' ? 429 : code === 'INVALID_PIN' ? 401 : 400,
    };
  }
  return { ok: true, data: parsed.data || {} };
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, '');
  const secret = env.SESSION_SECRET || env.VAULT_ACCESS_KEY || 'nexus-vault-cf-fallback';
  const cookies = parseCookies(request.headers.get('Cookie'));
  const authHeader = (request.headers.get('Authorization') || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : undefined;
  const sessionToken = cookies[SESSION_COOKIE_NAME] || bearerToken;

  if (request.method === 'POST') {
    const xrw = request.headers.get('X-Requested-With');
    const origin = request.headers.get('Origin');
    if (xrw !== 'XMLHttpRequest' && (!origin || new URL(origin).host !== url.host)) {
      return jsonResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Invalid request origin.' } }, 403);
    }
  }

  if (route === 'auth/status' && request.method === 'GET') {
    if (!env.APPS_SCRIPT_URL || !env.VAULT_ACCESS_KEY) {
      return jsonResponse({
        ok: true,
        data: {
          backendConfigured: false,
          pinConfigured: false,
          authenticated: false,
          locked: false,
          remainingSeconds: 0,
          attemptsRemaining: 5,
        },
      });
    }
    const authenticated = await verifySessionToken(secret, sessionToken);
    const pinRes = await callAppsScript(env, 'getPinStatus');
    if (!pinRes.ok) {
      return jsonResponse({ ok: false, error: { code: pinRes.code, message: pinRes.message } }, pinRes.status);
    }
    return jsonResponse({
      ok: true,
      data: {
        backendConfigured: true,
        pinConfigured: Boolean(pinRes.data?.pinConfigured),
        authenticated,
        locked: Boolean(pinRes.data?.locked),
        remainingSeconds: Number(pinRes.data?.remainingSeconds || 0),
        attemptsRemaining: Number(pinRes.data?.attemptsRemaining ?? 5),
      },
    });
  }

  if (route === 'auth/logout' && request.method === 'POST') {
    return jsonResponse(
      { ok: true, data: { locked: true } },
      200,
      { 'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned` }
    );
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (route === 'auth/setup-pin') {
    const res = await callAppsScript(env, 'setupPin', body);
    if (!res.ok) return jsonResponse({ ok: false, error: { code: res.code, message: res.message } }, res.status);
    const token = await createSessionToken(secret);
    return jsonResponse(
      { ok: true, data: { authenticated: true, pinConfigured: true, sessionToken: token } },
      200,
      {
        'Set-Cookie': `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=None; Partitioned`,
      }
    );
  }

  if (route === 'auth/verify-pin') {
    const res = await callAppsScript(env, 'verifyPin', body);
    if (!res.ok) return jsonResponse({ ok: false, error: { code: res.code, message: res.message } }, res.status);
    const token = await createSessionToken(secret);
    return jsonResponse(
      { ok: true, data: { authenticated: true, sessionToken: token } },
      200,
      {
        'Set-Cookie': `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=None; Partitioned`,
      }
    );
  }

  const isAuth = await verifySessionToken(secret, sessionToken);
  if (!isAuth) {
    return jsonResponse({ ok: false, error: { code: 'SESSION_REQUIRED', message: 'PIN verification required.' } }, 401);
  }

  if (route === 'auth/change-pin') {
    const res = await callAppsScript(env, 'changePin', body);
    if (!res.ok) return jsonResponse({ ok: false, error: { code: res.code, message: res.message } }, res.status);
    const token = await createSessionToken(secret);
    return jsonResponse(
      { ok: true, data: { changed: true, sessionToken: token } },
      200,
      {
        'Set-Cookie': `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=None; Partitioned`,
      }
    );
  }

  if (route === 'vault') {
    const action = String(body.action || '');
    const payload = (body.payload as Record<string, unknown>) || {};
    const requestId = String(body.requestId || '');

    let res = await callAppsScript(env, action, payload, requestId);
    if (!res.ok && res.code === 'UNKNOWN_ACTION') {
      if (action === 'updateTransaction') {
        res = await callAppsScript(env, 'editTransaction', payload, requestId);
      } else if (action === 'upsertGoal') {
        res = await callAppsScript(env, 'saveGoal', payload, requestId);
      }
    }

    if (!res.ok) return jsonResponse({ ok: false, error: { code: res.code, message: res.message } }, res.status);
    return jsonResponse({ ok: true, data: res.data });
  }

  return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404);
}
