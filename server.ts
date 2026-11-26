import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_NAME = 'nv_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const FALLBACK_SECURITY_FILE = path.resolve(process.cwd(), '.vault-security.json');
const APPS_SCRIPT_TIMEOUT_MS = 25000;

const SECURITY_STORE_FILE = FALLBACK_SECURITY_FILE;

function readSecurityFileRaw(): Record<string, unknown> {
  try {
    if (!fs.existsSync(SECURITY_STORE_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(SECURITY_STORE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function updateSecurityFileRaw(patch: Record<string, unknown>): void {
  const current = readSecurityFileRaw();
  const next = { ...current, ...patch };
  fs.writeFileSync(SECURITY_STORE_FILE, JSON.stringify(next), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function resolveSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret) return envSecret;

  const existing = readSecurityFileRaw().sessionSecret;
  if (typeof existing === 'string' && existing.length >= 32) {
    return existing;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    updateSecurityFileRaw({ sessionSecret: generated });
  } catch {
    // Fallback to in-memory secret if filesystem is read-only
  }
  return generated;
}

const SESSION_SECRET = resolveSessionSecret();

interface BackendConfig {
  endpointUrl: string;
  accessKey: string;
}

// Runtime in-memory cache (also persisted in 0600 .vault-security.json if configured via /api/admin/configure-backend)
let runtimeBackendConfig: BackendConfig | null = null;

function getBackendConfig(): BackendConfig | null {
  const envUrl = process.env.APPS_SCRIPT_URL?.trim();
  const envKey = process.env.VAULT_ACCESS_KEY?.trim();
  if (envUrl && envKey) {
    return { endpointUrl: envUrl, accessKey: envKey };
  }
  if (runtimeBackendConfig) {
    return runtimeBackendConfig;
  }
  const raw = readSecurityFileRaw();
  const storedUrl = typeof raw.backendEndpointUrl === 'string' ? raw.backendEndpointUrl.trim() : '';
  const storedKey = typeof raw.backendAccessKey === 'string' ? raw.backendAccessKey.trim() : '';
  if (storedUrl && storedKey) {
    runtimeBackendConfig = { endpointUrl: storedUrl, accessKey: storedKey };
    return runtimeBackendConfig;
  }
  return null;
}

function validateAppsScriptEndpoint(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'https:') return null;
    if (
      parsed.hostname !== 'script.google.com' &&
      parsed.hostname !== 'script.googleusercontent.com'
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/* ============================================================================
 * COOKIE & SESSION SIGNING HELPERS
 * ==========================================================================*/

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const result: Record<string, string> = {};
  if (!header) return result;

  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function createSessionToken(): string {
  const payload = JSON.stringify({
    sid: crypto.randomUUID(),
    exp: Date.now() + SESSION_TTL_MS,
  });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return false;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function isSecureRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  const referer = String(req.headers.referer || '').toLowerCase();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').toLowerCase();
  const isLocalHttpOrigin =
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    referer.startsWith('http://localhost') ||
    referer.startsWith('http://127.0.0.1');

  if (isLocalHttpOrigin) {
    return false;
  }

  return (
    req.secure ||
    proto === 'https' ||
    origin.startsWith('https://') ||
    referer.startsWith('https://') ||
    (Boolean(forwardedHost) &&
      !forwardedHost.startsWith('localhost') &&
      !forwardedHost.startsWith('127.0.0.1')) ||
    IS_PROD
  );
}

function getSessionTokenFromRequest(req: Request): string | undefined {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() || undefined;
  }
  return undefined;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const attrs = isSecureRequest(req)
    ? 'HttpOnly; Secure; SameSite=None; Partitioned'
    : 'HttpOnly; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; ${attrs}`
  );
}

function clearSessionCookie(req: Request, res: Response): void {
  const attrs = isSecureRequest(req)
    ? 'HttpOnly; Secure; SameSite=None; Partitioned'
    : 'HttpOnly; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; ${attrs}`
  );
}

/* ============================================================================
 * CSRF & ORIGIN CHECK MIDDLEWARE FOR MUTATING ROUTES
 * ==========================================================================*/

function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  const xRequestedWith = req.headers['x-requested-with'];
  if (xRequestedWith === 'XMLHttpRequest') {
    next();
    return;
  }

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        next();
        return;
      }
    } catch {
      // Fall through to reject
    }
  }

  res.status(403).json({
    ok: false,
    error: { code: 'FORBIDDEN', message: 'Invalid request origin.' },
  });
}

function requireAuthenticatedSession(req: Request, res: Response, next: NextFunction): void {
  if (!verifySessionToken(getSessionTokenFromRequest(req))) {
    res.status(401).json({
      ok: false,
      error: { code: 'SESSION_REQUIRED', message: 'PIN verification required.' },
    });
    return;
  }
  next();
}

/* ============================================================================
 * GOOGLE APPS SCRIPT CLIENT
 * ==========================================================================*/

interface AppsScriptRawResponse {
  ok?: boolean;
  success?: boolean;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

class BackendGatewayError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function callAppsScript(
  cfg: BackendConfig,
  action: string,
  payload: Record<string, unknown> = {},
  requestId = ''
): Promise<Record<string, unknown>> {
  const safeUrl = validateAppsScriptEndpoint(cfg.endpointUrl);
  if (!safeUrl) {
    throw new BackendGatewayError('INVALID_ENDPOINT', 'Unable to connect to server.', 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        ...payload,
        action,
        accessKey: cfg.accessKey,
        requestId,
        payload,
      }),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new BackendGatewayError(
        'SERVER_UNAVAILABLE',
        'Unable to connect to server.',
        502
      );
    }

    const parsed = (await response.json()) as AppsScriptRawResponse;
    const isSuccess = parsed.ok === true || parsed.success === true;
    if (!isSuccess) {
      const code = parsed.error?.code || 'API_ERROR';
      const message = parsed.error?.message || 'Unable to process request on server.';
      throw new BackendGatewayError(code, message, code === 'UNKNOWN_ACTION' ? 404 : 400);
    }

    return parsed.data || {};
  } catch (err) {
    if (err instanceof BackendGatewayError) throw err;
    throw new BackendGatewayError('NETWORK_ERROR', 'Unable to connect to server.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================================
 * FALLBACK SERVER-SIDE PIN STORE (USED ONLY IF DEPLOYED APPS SCRIPT PREDATES PIN)
 * Stores only salted scrypt hashes, never plain-text PINs.
 * ==========================================================================*/

interface FallbackPinStore {
  salt: string;
  hash: string;
  attempts: number;
  lockUntil: number;
}

function readFallbackPinStore(): FallbackPinStore | null {
  try {
    const parsed = readSecurityFileRaw();
    if (!parsed.salt || !parsed.hash) return null;
    return {
      salt: String(parsed.salt),
      hash: String(parsed.hash),
      attempts: Number(parsed.attempts || 0),
      lockUntil: Number(parsed.lockUntil || 0),
    };
  } catch {
    return null;
  }
}

function writeFallbackPinStore(store: FallbackPinStore): void {
  updateSecurityFileRaw({
    salt: store.salt,
    hash: store.hash,
    attempts: store.attempts,
    lockUntil: store.lockUntil,
  });
}

function hashPinScrypt(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 64).toString('hex');
}

function verifyPinScrypt(pin: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPinScrypt(pin, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function getFallbackPinStatus() {
  const store = readFallbackPinStore();
  if (!store) {
    return {
      pinConfigured: false,
      locked: false,
      remainingSeconds: 0,
      attemptsRemaining: MAX_PIN_ATTEMPTS,
    };
  }

  const now = Date.now();
  if (store.lockUntil > now) {
    return {
      pinConfigured: true,
      locked: true,
      remainingSeconds: Math.ceil((store.lockUntil - now) / 1000),
      attemptsRemaining: 0,
    };
  }

  if (store.lockUntil > 0 && store.lockUntil <= now) {
    writeFallbackPinStore({ ...store, attempts: 0, lockUntil: 0 });
    return {
      pinConfigured: true,
      locked: false,
      remainingSeconds: 0,
      attemptsRemaining: MAX_PIN_ATTEMPTS,
    };
  }

  return {
    pinConfigured: true,
    locked: false,
    remainingSeconds: 0,
    attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - store.attempts),
  };
}

/* ============================================================================
 * DATA NORMALIZATION HELPERS (BACKWARD COMPATIBLE WITH ALL CODE.GS VERSIONS)
 * ==========================================================================*/

function normalizeCurrency(raw: unknown): 'INR' | 'USD' | 'EUR' | 'GBP' {
  const upper = String(raw || 'INR').trim().toUpperCase();
  if (upper === 'USD' || upper === 'EUR' || upper === 'GBP' || upper === 'INR') {
    return upper;
  }
  return 'INR';
}

function normalizeTransaction(raw: Record<string, unknown>) {
  return {
    id: String(raw.id ?? raw.ID ?? '').trim(),
    date: String(raw.date ?? raw.Date ?? '').trim(),
    amount: Math.round(Number(raw.amount ?? raw.Amount ?? 0) * 100) / 100,
    note: String(raw.note ?? raw.Note ?? ''),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? '').trim(),
  };
}

function normalizeGoal(
  rawGoal: Record<string, unknown> | null | undefined,
  totalSavings: number,
  fallback?: { completionPercentage?: number; remainingAmount?: number }
) {
  if (!rawGoal) return null;
  const goalName = String(rawGoal.goalName ?? rawGoal.GoalName ?? '').trim();
  const targetAmount = Number(rawGoal.targetAmount ?? rawGoal.TargetAmount ?? 0);
  if (!goalName || !Number.isFinite(targetAmount) || targetAmount <= 0) return null;

  const currentSavings = Math.round(Number(rawGoal.currentSavings ?? totalSavings) * 100) / 100;
  const remainingAmount = Math.max(
    0,
    Math.round(
      Number(
        rawGoal.remainingAmount ?? fallback?.remainingAmount ?? targetAmount - currentSavings
      ) * 100
    ) / 100
  );
  const rawPct =
    rawGoal.completionPercentage ??
    fallback?.completionPercentage ??
    (targetAmount > 0 ? Math.min(100, (currentSavings / targetAmount) * 100) : 0);

  return {
    goalId: String(rawGoal.goalId ?? rawGoal.GoalID ?? '').trim(),
    goalName,
    targetAmount: Math.round(targetAmount * 100) / 100,
    currentSavings,
    remainingAmount,
    completionPercentage: Math.round(Number(rawPct) * 10) / 10,
    isCompleted: Boolean(rawGoal.isCompleted ?? currentSavings >= targetAmount),
    createdAt: String(rawGoal.createdAt ?? rawGoal.CreatedAt ?? '').trim(),
    updatedAt: String(rawGoal.updatedAt ?? rawGoal.UpdatedAt ?? '').trim(),
  };
}

async function fetchBootstrapFromBackend(cfg: BackendConfig, year: number, month: number) {
  try {
    const raw = await callAppsScript(cfg, 'getBootstrapData', { year, month });
    const rawTxns = Array.isArray(raw.transactions)
      ? (raw.transactions as Record<string, unknown>[]).map(normalizeTransaction)
      : [];
    const totalSavings =
      typeof raw.totalSavings === 'number'
        ? raw.totalSavings
        : rawTxns.reduce((sum, t) => sum + t.amount, 0);
    const currency = normalizeCurrency(
      (raw.settings as Record<string, unknown> | undefined)?.currency ?? raw.currency
    );

    const rawMonth = (raw.thisMonth || {}) as Record<string, unknown>;
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month, 0).getDate();

    const dateWiseSavings: Record<string, { date: string; total: number; count: number }> = {};
    for (const txn of rawTxns) {
      if (!dateWiseSavings[txn.date]) {
        dateWiseSavings[txn.date] = { date: txn.date, total: 0, count: 0 };
      }
      dateWiseSavings[txn.date].total =
        Math.round((dateWiseSavings[txn.date].total + txn.amount) * 100) / 100;
      dateWiseSavings[txn.date].count += 1;
    }

    const rawCal = (raw.calendarActivity || {}) as Record<string, unknown>;

    return {
      transactions: rawTxns,
      totalSavings: Math.round(totalSavings * 100) / 100,
      currentGoal: normalizeGoal(raw.currentGoal as Record<string, unknown> | null, totalSavings),
      settings: { currency },
      thisMonth: {
        year: Number(rawMonth.year ?? year),
        month: Number(rawMonth.month ?? month),
        monthPrefix: String(rawMonth.monthPrefix ?? monthPrefix),
        totalSavings: Number(rawMonth.totalSavings ?? rawMonth.monthlySavings ?? 0),
        savingDays: Number(rawMonth.savingDays ?? 0),
        transactionCount: Number(rawMonth.transactionCount ?? 0),
      },
      calendarActivity: {
        year: Number(rawCal.year ?? year),
        month: Number(rawCal.month ?? month),
        daysInMonth: Number(rawCal.daysInMonth ?? daysInMonth),
        monthlyTotal: Number(rawCal.monthlyTotal ?? rawCal.monthlySavings ?? 0),
        savingDays: Number(rawCal.savingDays ?? rawCal.activeDaysCount ?? 0),
        days: (rawCal.days || rawCal.activityByDate || {}) as Record<
          string,
          { date: string; total: number; count: number }
        >,
      },
      dateWiseSavings:
        (raw.dateWiseSavings as Record<string, { date: string; total: number; count: number }>) ||
        dateWiseSavings,
    };
  } catch (err) {
    if (!(err instanceof BackendGatewayError) || err.code !== 'UNKNOWN_ACTION') {
      throw err;
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const [txnsRes, totalRes, monthlyRes, goalRes, calRes] = await Promise.all([
      callAppsScript(cfg, 'getTransactions'),
      callAppsScript(cfg, 'getTotalSavings'),
      callAppsScript(cfg, 'getMonthlySavings', { year, month: monthKey }),
      callAppsScript(cfg, 'getCurrentGoal'),
      callAppsScript(cfg, 'getCalendarActivity', { year, month: monthKey }),
    ]);

    const transactions = Array.isArray(txnsRes.transactions)
      ? (txnsRes.transactions as Record<string, unknown>[]).map(normalizeTransaction)
      : [];
    transactions.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });

    const totalSavings = Number(
      totalRes.totalSavings ?? transactions.reduce((sum, t) => sum + t.amount, 0)
    );
    const currency = normalizeCurrency(
      txnsRes.currency ?? totalRes.currency ?? goalRes.currency
    );

    const monthTransactions = transactions.filter((t) => t.date.startsWith(monthKey));
    const uniqueSavingDays = new Set(monthTransactions.map((t) => t.date)).size;

    const dateWiseSavings: Record<string, { date: string; total: number; count: number }> = {};
    const daysMap: Record<string, { date: string; total: number; count: number }> = {};
    for (const txn of transactions) {
      if (!dateWiseSavings[txn.date]) {
        dateWiseSavings[txn.date] = { date: txn.date, total: 0, count: 0 };
      }
      dateWiseSavings[txn.date].total =
        Math.round((dateWiseSavings[txn.date].total + txn.amount) * 100) / 100;
      dateWiseSavings[txn.date].count += 1;
      if (txn.date.startsWith(monthKey)) {
        daysMap[txn.date] = dateWiseSavings[txn.date];
      }
    }

    return {
      transactions,
      totalSavings: Math.round(totalSavings * 100) / 100,
      currentGoal: normalizeGoal(goalRes.goal as Record<string, unknown> | null, totalSavings, {
        completionPercentage: Number(goalRes.completionPercentage ?? 0),
        remainingAmount: Number(goalRes.remainingAmount ?? 0),
      }),
      settings: { currency },
      thisMonth: {
        year,
        month,
        monthPrefix: monthKey,
        totalSavings: Number(
          monthlyRes.totalSavings ??
            monthlyRes.monthlySavings ??
            monthTransactions.reduce((sum, t) => sum + t.amount, 0)
        ),
        savingDays: Number(
          monthlyRes.savingDays ?? calRes.activeDaysCount ?? uniqueSavingDays
        ),
        transactionCount: Number(monthlyRes.transactionCount ?? monthTransactions.length),
      },
      calendarActivity: {
        year,
        month,
        daysInMonth: new Date(year, month, 0).getDate(),
        monthlyTotal: Number(
          calRes.monthlyTotal ??
            calRes.monthlySavings ??
            monthTransactions.reduce((sum, t) => sum + t.amount, 0)
        ),
        savingDays: Number(calRes.savingDays ?? calRes.activeDaysCount ?? uniqueSavingDays),
        days: daysMap,
      },
      dateWiseSavings,
    };
  }
}

/* ============================================================================
 * EXPRESS SERVER SETUP
 * ==========================================================================*/

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  // 1. Auth & Connection Status
  app.get('/api/auth/status', async (req: Request, res: Response) => {
    const cfg = getBackendConfig();
    const authenticated = Boolean(cfg) && verifySessionToken(getSessionTokenFromRequest(req));

    if (!cfg) {
      res.json({
        ok: true,
        data: {
          backendConfigured: false,
          pinConfigured: false,
          authenticated: false,
          locked: false,
          remainingSeconds: 0,
          attemptsRemaining: MAX_PIN_ATTEMPTS,
        },
      });
      return;
    }

    try {
      const pinStatus = await callAppsScript(cfg, 'getPinStatus');
      res.json({
        ok: true,
        data: {
          backendConfigured: true,
          pinConfigured: Boolean(pinStatus.pinConfigured),
          authenticated,
          locked: Boolean(pinStatus.locked),
          remainingSeconds: Number(pinStatus.remainingSeconds || 0),
          attemptsRemaining: Number(pinStatus.attemptsRemaining ?? MAX_PIN_ATTEMPTS),
        },
      });
    } catch (err) {
      if (err instanceof BackendGatewayError && err.code === 'UNKNOWN_ACTION') {
        const fallback = getFallbackPinStatus();
        res.json({
          ok: true,
          data: {
            backendConfigured: true,
            pinConfigured: fallback.pinConfigured,
            authenticated: authenticated && fallback.pinConfigured,
            locked: fallback.locked,
            remainingSeconds: fallback.remainingSeconds,
            attemptsRemaining: fallback.attemptsRemaining,
          },
        });
        return;
      }

      res.status(502).json({
        ok: false,
        error: {
          code: 'SERVER_UNAVAILABLE',
          message: 'Unable to connect to server.',
        },
      });
    }
  });

  // 2. One-time server connection bootstrap (only active if process.env is unconfigured)
  app.post('/api/admin/configure-backend', verifyCsrf, async (req: Request, res: Response) => {
    if (getBackendConfig()) {
      res.status(409).json({
        ok: false,
        error: { code: 'ALREADY_CONFIGURED', message: 'Backend connection is already configured.' },
      });
      return;
    }

    const endpointUrl = String(req.body?.endpointUrl || '').trim();
    const accessKey = String(req.body?.accessKey || '').trim();
    const safeUrl = validateAppsScriptEndpoint(endpointUrl);

    if (!safeUrl || !accessKey) {
      res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid backend URL and access key are required.' },
      });
      return;
    }

    try {
      await callAppsScript({ endpointUrl: safeUrl, accessKey }, 'getTransactions');
      runtimeBackendConfig = { endpointUrl: safeUrl, accessKey };
      try {
        updateSecurityFileRaw({
          backendEndpointUrl: safeUrl,
          backendAccessKey: accessKey,
        });
      } catch {
        // Ignore if filesystem is read-only
      }
      res.json({ ok: true, data: { configured: true } });
    } catch (err) {
      const msg = err instanceof BackendGatewayError ? err.message : 'Unable to connect to server.';
      res.status(400).json({
        ok: false,
        error: { code: 'CONNECTION_FAILED', message: msg },
      });
    }
  });

  // 3. First-time 4-digit PIN setup
  app.post('/api/auth/setup-pin', verifyCsrf, async (req: Request, res: Response) => {
    const cfg = getBackendConfig();
    if (!cfg) {
      res.status(503).json({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'Unable to connect to server.' },
      });
      return;
    }

    const pin = String(req.body?.pin || '').trim();
    const confirmPin = String(req.body?.confirmPin || '').trim();

    if (!/^\d{4}$/.test(pin)) {
      res.status(400).json({
        ok: false,
        error: { code: 'INVALID_PIN_FORMAT', message: 'PIN must be exactly 4 digits.' },
      });
      return;
    }
    if (pin !== confirmPin) {
      res.status(400).json({
        ok: false,
        error: { code: 'PIN_MISMATCH', message: 'PINs do not match.' },
      });
      return;
    }

    try {
      await callAppsScript(cfg, 'setupPin', { pin, confirmPin });
      const token = createSessionToken();
      setSessionCookie(req, res, token);
      res.json({ ok: true, data: { authenticated: true, pinConfigured: true, sessionToken: token } });
    } catch (err) {
      if (err instanceof BackendGatewayError && err.code === 'UNKNOWN_ACTION') {
        if (readFallbackPinStore()) {
          res.status(400).json({
            ok: false,
            error: { code: 'PIN_ALREADY_SET', message: 'A PIN is already configured.' },
          });
          return;
        }
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = hashPinScrypt(pin, salt);
        writeFallbackPinStore({ salt, hash, attempts: 0, lockUntil: 0 });
        const token = createSessionToken();
        setSessionCookie(req, res, token);
        res.json({ ok: true, data: { authenticated: true, pinConfigured: true, sessionToken: token } });
        return;
      }

      const status = err instanceof BackendGatewayError ? err.status : 502;
      const code = err instanceof BackendGatewayError ? err.code : 'SERVER_ERROR';
      const message = err instanceof BackendGatewayError ? err.message : 'Unable to connect to server.';
      res.status(status).json({ ok: false, error: { code, message } });
    }
  });

  // 4. Verify 4-digit PIN (returning visits)
  app.post('/api/auth/verify-pin', verifyCsrf, async (req: Request, res: Response) => {
    const cfg = getBackendConfig();
    if (!cfg) {
      res.status(503).json({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'Unable to connect to server.' },
      });
      return;
    }

    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      res.status(400).json({
        ok: false,
        error: { code: 'INVALID_PIN_FORMAT', message: 'Enter a 4-digit PIN.' },
      });
      return;
    }

    try {
      await callAppsScript(cfg, 'verifyPin', { pin });
      const token = createSessionToken();
      setSessionCookie(req, res, token);
      res.json({ ok: true, data: { authenticated: true, sessionToken: token } });
    } catch (err) {
      if (err instanceof BackendGatewayError && err.code === 'UNKNOWN_ACTION') {
        const store = readFallbackPinStore();
        if (!store) {
          res.status(400).json({
            ok: false,
            error: { code: 'PIN_NOT_CONFIGURED', message: 'PIN has not been set up yet.' },
          });
          return;
        }

        const now = Date.now();
        if (store.lockUntil > now) {
          const remaining = Math.ceil((store.lockUntil - now) / 1000);
          res.status(429).json({
            ok: false,
            error: {
              code: 'PIN_LOCKED',
              message: `Too many incorrect attempts. Try again in ${remaining} seconds.`,
            },
          });
          return;
        }

        if (!verifyPinScrypt(pin, store.salt, store.hash)) {
          const nextAttempts = (store.lockUntil > 0 && store.lockUntil <= now ? 0 : store.attempts) + 1;
          if (nextAttempts >= MAX_PIN_ATTEMPTS) {
            writeFallbackPinStore({
              ...store,
              attempts: nextAttempts,
              lockUntil: now + PIN_LOCKOUT_MS,
            });
            res.status(429).json({
              ok: false,
              error: {
                code: 'PIN_LOCKED',
                message: 'Too many incorrect attempts. Try again in 300 seconds.',
              },
            });
            return;
          }

          writeFallbackPinStore({ ...store, attempts: nextAttempts, lockUntil: 0 });
          const remainingAttempts = MAX_PIN_ATTEMPTS - nextAttempts;
          res.status(401).json({
            ok: false,
            error: {
              code: 'INVALID_PIN',
              message: `Incorrect PIN. ${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining.`,
            },
          });
          return;
        }

        writeFallbackPinStore({ ...store, attempts: 0, lockUntil: 0 });
        const token = createSessionToken();
        setSessionCookie(req, res, token);
        res.json({ ok: true, data: { authenticated: true, sessionToken: token } });
        return;
      }

      const status =
        err instanceof BackendGatewayError
          ? err.code === 'PIN_LOCKED'
            ? 429
            : err.code === 'INVALID_PIN'
              ? 401
              : err.status
          : 502;
      const code = err instanceof BackendGatewayError ? err.code : 'SERVER_ERROR';
      const message = err instanceof BackendGatewayError ? err.message : 'Unable to connect to server.';
      res.status(status).json({ ok: false, error: { code, message } });
    }
  });

  // 5. Change 4-digit PIN (authenticated)
  app.post(
    '/api/auth/change-pin',
    verifyCsrf,
    requireAuthenticatedSession,
    async (req: Request, res: Response) => {
      const cfg = getBackendConfig();
      if (!cfg) {
        res.status(503).json({
          ok: false,
          error: { code: 'NOT_CONFIGURED', message: 'Unable to connect to server.' },
        });
        return;
      }

      const currentPin = String(req.body?.currentPin || '').trim();
      const newPin = String(req.body?.newPin || '').trim();
      const confirmPin = String(req.body?.confirmPin || '').trim();

      if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
        res.status(400).json({
          ok: false,
          error: { code: 'INVALID_PIN_FORMAT', message: 'PINs must be exactly 4 digits.' },
        });
        return;
      }
      if (newPin !== confirmPin) {
        res.status(400).json({
          ok: false,
          error: { code: 'PIN_MISMATCH', message: 'New PIN and confirmation do not match.' },
        });
        return;
      }

      try {
        await callAppsScript(cfg, 'changePin', { currentPin, newPin, confirmPin });
        const token = createSessionToken();
        setSessionCookie(req, res, token);
        res.json({ ok: true, data: { changed: true, sessionToken: token } });
      } catch (err) {
        if (err instanceof BackendGatewayError && err.code === 'UNKNOWN_ACTION') {
          const store = readFallbackPinStore();
          if (!store) {
            res.status(400).json({
              ok: false,
              error: { code: 'PIN_NOT_CONFIGURED', message: 'PIN has not been set up yet.' },
            });
            return;
          }

          const now = Date.now();
          if (store.lockUntil > now) {
            const remaining = Math.ceil((store.lockUntil - now) / 1000);
            res.status(429).json({
              ok: false,
              error: {
                code: 'PIN_LOCKED',
                message: `Too many incorrect attempts. Try again in ${remaining} seconds.`,
              },
            });
            return;
          }

          if (!verifyPinScrypt(currentPin, store.salt, store.hash)) {
            const nextAttempts = store.attempts + 1;
            if (nextAttempts >= MAX_PIN_ATTEMPTS) {
              writeFallbackPinStore({
                ...store,
                attempts: nextAttempts,
                lockUntil: now + PIN_LOCKOUT_MS,
              });
              res.status(429).json({
                ok: false,
                error: {
                  code: 'PIN_LOCKED',
                  message: 'Too many incorrect attempts. Try again in 300 seconds.',
                },
              });
              return;
            }
            writeFallbackPinStore({ ...store, attempts: nextAttempts, lockUntil: 0 });
            res.status(401).json({
              ok: false,
              error: {
                code: 'INVALID_PIN',
                message: `Current PIN is incorrect. ${MAX_PIN_ATTEMPTS - nextAttempts} attempts remaining.`,
              },
            });
            return;
          }

          const newSalt = crypto.randomBytes(16).toString('hex');
          const newHash = hashPinScrypt(newPin, newSalt);
          writeFallbackPinStore({ salt: newSalt, hash: newHash, attempts: 0, lockUntil: 0 });
          const token = createSessionToken();
          setSessionCookie(req, res, token);
          res.json({ ok: true, data: { changed: true, sessionToken: token } });
          return;
        }

        const status = err instanceof BackendGatewayError ? err.status : 502;
        const code = err instanceof BackendGatewayError ? err.code : 'SERVER_ERROR';
        const message = err instanceof BackendGatewayError ? err.message : 'Unable to connect to server.';
        res.status(status).json({ ok: false, error: { code, message } });
      }
    }
  );

  // 6. Lock / Logout session
  app.post('/api/auth/logout', verifyCsrf, (req: Request, res: Response) => {
    clearSessionCookie(req, res);
    res.json({ ok: true, data: { locked: true } });
  });

  // 7. Authenticated Vault Data Operations
  app.post(
    '/api/vault',
    verifyCsrf,
    requireAuthenticatedSession,
    async (req: Request, res: Response) => {
      const cfg = getBackendConfig();
      if (!cfg) {
        res.status(503).json({
          ok: false,
          error: { code: 'NOT_CONFIGURED', message: 'Unable to connect to server.' },
        });
        return;
      }

      const action = String(req.body?.action || '').trim();
      const payload =
        req.body?.payload && typeof req.body.payload === 'object'
          ? (req.body.payload as Record<string, unknown>)
          : {};
      const requestId = String(req.body?.requestId || '').trim();

      try {
        switch (action) {
          case 'getBootstrapData': {
            const now = new Date();
            const year = Number(payload.year || now.getFullYear());
            const month = Number(payload.month || now.getMonth() + 1);
            const data = await fetchBootstrapFromBackend(cfg, year, month);
            res.json({ ok: true, data });
            return;
          }

          case 'addTransaction': {
            const data = await callAppsScript(cfg, 'addTransaction', payload, requestId);
            res.json({
              ok: true,
              data: {
                transaction: normalizeTransaction(
                  (data.transaction as Record<string, unknown>) || {}
                ),
              },
            });
            return;
          }

          case 'updateTransaction': {
            try {
              const data = await callAppsScript(cfg, 'updateTransaction', payload);
              res.json({
                ok: true,
                data: {
                  transaction: normalizeTransaction(
                    (data.transaction as Record<string, unknown>) || {}
                  ),
                },
              });
            } catch (err) {
              if (err instanceof BackendGatewayError && err.code === 'UNKNOWN_ACTION') {
                const data = await callAppsScript(cfg, 'editTransaction', payload);
                res.json({
                  ok: true,
                  data: {
                    transaction: normalizeTransaction(
                      (data.transaction as Record<string, unknown>) || {}
                    ),
                  },
                });
                return;
              }
              throw err;
            }
            return;
          }

          case 'deleteTransaction': {
            const data = await callAppsScript(cfg, 'deleteTransaction', payload);
            res.json({ ok: true, data });
            return;
          }

          case 'upsertGoal': {
            try {
              const data = await callAppsScript(cfg, 'upsertGoal', payload, requestId);
              res.json({ ok: true, data });
            } catch (err) {
              if (err instanceof BackendGatewayError && err.code === 'UNKNOWN_ACTION') {
                const data = await callAppsScript(cfg, 'saveGoal', payload, requestId);
                res.json({ ok: true, data });
                return;
              }
              throw err;
            }
            return;
          }

          case 'updateSettings': {
            try {
              const data = await callAppsScript(cfg, 'updateSettings', payload);
              res.json({ ok: true, data });
            } catch (err) {
              if (err instanceof BackendGatewayError && err.code === 'UNKNOWN_ACTION') {
                res.status(400).json({
                  ok: false,
                  error: {
                    code: 'UPDATE_REQUIRED',
                    message: 'Server backend update required to persist currency preferences.',
                  },
                });
                return;
              }
              throw err;
            }
            return;
          }

          default:
            res.status(400).json({
              ok: false,
              error: { code: 'UNKNOWN_ACTION', message: 'Unsupported action.' },
            });
        }
      } catch (err) {
        const status = err instanceof BackendGatewayError ? err.status : 502;
        const code = err instanceof BackendGatewayError ? err.code : 'SERVER_ERROR';
        const message =
          err instanceof BackendGatewayError ? err.message : 'Unable to connect to server.';
        res.status(status).json({ ok: false, error: { code, message } });
      }
    }
  );

  // Mount Vite dev middleware or serve static production dist
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nexus Vault server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Nexus Vault server:', err);
  process.exit(1);
});
