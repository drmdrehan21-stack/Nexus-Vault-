import {
  AuthStatusResponse,
  CalendarActivity,
  CalendarDayActivity,
  CurrencyCode,
  GoalInput,
  MonthlySummary,
  SavingsGoal,
  Transaction,
  TransactionInput,
  VaultBootstrapData,
} from '../types/vault';
import { getDaysInMonth } from '../utils/format';

const DEFAULT_TIMEOUT_MS = 25000;

export class VaultApiError extends Error {
  public readonly code: string;
  public readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'VaultApiError';
    this.code = code;
    this.status = status;
  }
}

interface ServerEnvelope<T> {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

// Ephemeral in-memory fallback token (only for current page if iframe blocks cookies; never stored in localStorage/sessionStorage)
let memorySessionToken: string | null = null;

async function requestServer<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const method = options.method ?? 'POST';
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        'X-Requested-With': 'XMLHttpRequest',
        ...(memorySessionToken ? { Authorization: `Bearer ${memorySessionToken}` } : {}),
      },
      body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
      signal: controller.signal,
    });

    let parsed: ServerEnvelope<T> | null = null;
    try {
      parsed = (await response.json()) as ServerEnvelope<T>;
    } catch {
      throw new VaultApiError(
        'INVALID_RESPONSE',
        'Unable to connect to server.',
        response.status
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new VaultApiError('INVALID_RESPONSE', 'Unable to connect to server.', response.status);
    }

    const isSuccess = response.ok && (parsed.ok === true || parsed.success === true);
    if (!isSuccess) {
      const code = parsed.error?.code || 'SERVER_ERROR';
      if (response.status === 401 && code === 'SESSION_REQUIRED') {
        memorySessionToken = null;
      }
      throw new VaultApiError(
        code,
        parsed.error?.message || 'Unable to connect to server.',
        response.status
      );
    }

    return parsed.data as T;
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new VaultApiError('TIMEOUT', 'Server request timed out. Please try again.');
    }
    throw new VaultApiError('NETWORK_ERROR', 'Unable to connect to server.');
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/* ============================================================================
 * AUTHENTICATION & SERVER CONNECTION ROUTES
 * ==========================================================================*/

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  return requestServer<AuthStatusResponse>('/api/auth/status', { method: 'GET' });
}

export async function configureBackendOnce(
  endpointUrl: string,
  accessKey: string
): Promise<{ configured: boolean }> {
  return requestServer<{ configured: boolean }>('/api/admin/configure-backend', {
    method: 'POST',
    body: { endpointUrl, accessKey },
  });
}

export async function setupPin(
  pin: string,
  confirmPin: string
): Promise<{ authenticated: boolean; pinConfigured: boolean }> {
  const data = await requestServer<{
    authenticated: boolean;
    pinConfigured: boolean;
    sessionToken?: string;
  }>('/api/auth/setup-pin', {
    method: 'POST',
    body: { pin, confirmPin },
  });
  if (data.sessionToken) {
    memorySessionToken = data.sessionToken;
  }
  return { authenticated: data.authenticated, pinConfigured: data.pinConfigured };
}

export async function verifyPin(pin: string): Promise<{ authenticated: boolean }> {
  const data = await requestServer<{ authenticated: boolean; sessionToken?: string }>(
    '/api/auth/verify-pin',
    {
      method: 'POST',
      body: { pin },
    }
  );
  if (data.sessionToken) {
    memorySessionToken = data.sessionToken;
  }
  return { authenticated: data.authenticated };
}

export async function changePin(
  currentPin: string,
  newPin: string,
  confirmPin: string
): Promise<{ changed: boolean }> {
  const data = await requestServer<{ changed: boolean; sessionToken?: string }>(
    '/api/auth/change-pin',
    {
      method: 'POST',
      body: { currentPin, newPin, confirmPin },
    }
  );
  if (data.sessionToken) {
    memorySessionToken = data.sessionToken;
  }
  return { changed: data.changed };
}

export async function logoutVault(): Promise<{ locked: boolean }> {
  try {
    return await requestServer<{ locked: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: {},
    });
  } finally {
    memorySessionToken = null;
  }
}

/* ============================================================================
 * DATA NORMALIZATION & VAULT API ROUTES
 * ==========================================================================*/

function normalizeCurrency(raw: unknown): CurrencyCode {
  const upper = String(raw || 'INR').trim().toUpperCase();
  if (upper === 'USD' || upper === 'EUR' || upper === 'GBP' || upper === 'INR') {
    return upper;
  }
  return 'INR';
}

function normalizeTransaction(raw: Record<string, unknown>): Transaction {
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
  totalSavings: number
): SavingsGoal | null {
  if (!rawGoal) return null;
  const goalName = String(rawGoal.goalName ?? rawGoal.GoalName ?? '').trim();
  const targetAmount = Number(rawGoal.targetAmount ?? rawGoal.TargetAmount ?? 0);
  if (!goalName || !Number.isFinite(targetAmount) || targetAmount <= 0) {
    return null;
  }

  const currentSavings =
    Math.round(Number(rawGoal.currentSavings ?? totalSavings) * 100) / 100;
  const remainingAmount = Math.max(
    0,
    Math.round(Number(rawGoal.remainingAmount ?? targetAmount - currentSavings) * 100) / 100
  );
  const rawPct =
    rawGoal.completionPercentage ??
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

function buildDateWiseFromTransactions(
  transactions: Transaction[]
): Record<string, CalendarDayActivity> {
  const map: Record<string, CalendarDayActivity> = {};
  for (const txn of transactions) {
    if (!map[txn.date]) {
      map[txn.date] = { date: txn.date, total: 0, count: 0 };
    }
    map[txn.date].total = Math.round((map[txn.date].total + txn.amount) * 100) / 100;
    map[txn.date].count += 1;
  }
  return map;
}

async function callVault<T>(
  action: string,
  payload: Record<string, unknown> = {},
  requestId = ''
): Promise<T> {
  return requestServer<T>('/api/vault', {
    method: 'POST',
    body: { action, payload, requestId },
  });
}

export async function getBootstrapData(
  year: number,
  month: number
): Promise<VaultBootstrapData> {
  const raw = await callVault<Record<string, unknown>>('getBootstrapData', { year, month });
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
  const thisMonth: MonthlySummary = {
    year: Number(rawMonth.year ?? year),
    month: Number(rawMonth.month ?? month),
    monthPrefix: String(rawMonth.monthPrefix ?? monthPrefix),
    totalSavings: Number(rawMonth.totalSavings ?? rawMonth.monthlySavings ?? 0),
    savingDays: Number(rawMonth.savingDays ?? 0),
    transactionCount: Number(rawMonth.transactionCount ?? 0),
  };

  const rawCal = (raw.calendarActivity || {}) as Record<string, unknown>;
  const calendarActivity: CalendarActivity = {
    year: Number(rawCal.year ?? year),
    month: Number(rawCal.month ?? month),
    daysInMonth: Number(rawCal.daysInMonth ?? getDaysInMonth(year, month)),
    monthlyTotal: Number(rawCal.monthlyTotal ?? rawCal.monthlySavings ?? 0),
    savingDays: Number(rawCal.savingDays ?? rawCal.activeDaysCount ?? 0),
    days: (rawCal.days || rawCal.activityByDate || {}) as Record<string, CalendarDayActivity>,
  };

  return {
    transactions: rawTxns,
    totalSavings: Math.round(totalSavings * 100) / 100,
    currentGoal: normalizeGoal(raw.currentGoal as Record<string, unknown> | null, totalSavings),
    settings: { currency },
    thisMonth,
    calendarActivity,
    dateWiseSavings:
      (raw.dateWiseSavings as Record<string, CalendarDayActivity>) ||
      buildDateWiseFromTransactions(rawTxns),
  };
}

export async function addTransaction(
  input: TransactionInput,
  requestId: string
): Promise<{ transaction: Transaction }> {
  const res = await callVault<{ transaction: Record<string, unknown> }>(
    'addTransaction',
    {
      date: input.date,
      amount: input.amount,
      note: input.note,
    },
    requestId
  );
  return {
    transaction: normalizeTransaction(res.transaction || {}),
  };
}

export async function updateTransaction(
  input: TransactionInput
): Promise<{ transaction: Transaction }> {
  const res = await callVault<{ transaction: Record<string, unknown> }>('updateTransaction', {
    id: input.id,
    date: input.date,
    amount: input.amount,
    note: input.note,
  });
  return {
    transaction: normalizeTransaction(res.transaction || {}),
  };
}

export async function deleteTransaction(id: string): Promise<{ deletedId: string }> {
  return callVault<{ deletedId: string }>('deleteTransaction', { id });
}

export async function upsertGoal(
  input: GoalInput,
  requestId: string
): Promise<{ goal: SavingsGoal | null }> {
  return callVault<{ goal: SavingsGoal | null }>(
    'upsertGoal',
    {
      goalId: input.goalId || '',
      goalName: input.goalName,
      targetAmount: input.targetAmount,
    },
    requestId
  );
}

export async function updateSettings(currency: CurrencyCode): Promise<{ currency: CurrencyCode }> {
  return callVault<{ currency: CurrencyCode }>('updateSettings', { currency });
}
