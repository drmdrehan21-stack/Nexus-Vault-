import {
  CalendarActivity,
  CalendarDayActivity,
  CurrencyCode,
  GoalInput,
  MonthlySummary,
  SavingsGoal,
  Transaction,
  TransactionInput,
  VaultBootstrapData,
  VaultConnectionConfig,
} from '../types/vault';
import { getDaysInMonth } from '../utils/format';

const DEFAULT_TIMEOUT_MS = 25000;

export class VaultApiError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'VaultApiError';
    this.code = code;
  }
}

interface AppsScriptResponse<T> {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Google Apps Script Web Apps do not respond to CORS preflight OPTIONS requests.
 * To guarantee cross-origin compatibility from Cloudflare Pages / browsers:
 * 1. Send HTTP POST with Content-Type: text/plain;charset=utf-8 (a CORS "simple request" header).
 * 2. Omit custom HTTP headers (send accessKey inside the JSON body over HTTPS).
 * 3. Use redirect: 'follow' so the 302 redirect to script.googleusercontent.com completes cleanly.
 */
async function callAppsScript<T>(
  config: VaultConnectionConfig,
  action: string,
  payload: Record<string, unknown> = {},
  requestId?: string
): Promise<T> {
  const url = config.endpointUrl.trim();
  const accessKey = config.accessKey.trim();

  if (!url) {
    throw new VaultApiError('MISSING_ENDPOINT', 'Google Apps Script Web App URL is not configured.');
  }
  if (!accessKey) {
    throw new VaultApiError('MISSING_ACCESS_KEY', 'Vault Access Key is required.');
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        ...payload,
        action,
        accessKey,
        requestId: requestId || '',
        payload,
      }),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new VaultApiError(
        'HTTP_ERROR',
        `Backend returned HTTP ${response.status}. Verify your Apps Script Web App deployment.`
      );
    }

    let parsed: AppsScriptResponse<T>;
    try {
      parsed = (await response.json()) as AppsScriptResponse<T>;
    } catch {
      throw new VaultApiError(
        'INVALID_RESPONSE',
        'Received non-JSON response from Apps Script. Ensure Web App access is set to "Anyone" and the latest version is deployed.'
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new VaultApiError('INVALID_RESPONSE', 'Unexpected response format from backend.');
    }

    const isSuccess = parsed.ok === true || parsed.success === true;
    if (!isSuccess) {
      throw new VaultApiError(
        parsed.error?.code || 'API_ERROR',
        parsed.error?.message || 'Operation failed on Google Sheets backend.'
      );
    }

    return parsed.data as T;
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new VaultApiError(
        'TIMEOUT',
        'Request timed out waiting for Google Apps Script. Please try again.'
      );
    }
    throw new VaultApiError(
      'NETWORK_ERROR',
      'Unable to reach Google Apps Script backend. Check your internet connection and Web App URL.'
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

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
  totalSavings: number,
  fallbackStats?: { completionPercentage?: number; remainingAmount?: number }
): SavingsGoal | null {
  if (!rawGoal) return null;
  const goalName = String(rawGoal.goalName ?? rawGoal.GoalName ?? '').trim();
  const targetAmount = Number(rawGoal.targetAmount ?? rawGoal.TargetAmount ?? 0);
  if (!goalName || !Number.isFinite(targetAmount) || targetAmount <= 0) {
    return null;
  }

  const currentSavings = Math.round(
    Number(rawGoal.currentSavings ?? totalSavings) * 100
  ) / 100;
  const remainingAmount = Math.max(
    0,
    Math.round(
      Number(
        rawGoal.remainingAmount ??
          fallbackStats?.remainingAmount ??
          targetAmount - currentSavings
      ) * 100
    ) / 100
  );
  const rawPct =
    rawGoal.completionPercentage ??
    fallbackStats?.completionPercentage ??
    (targetAmount > 0 ? Math.min(100, (currentSavings / targetAmount) * 100) : 0);
  const completionPercentage = Math.round(Number(rawPct) * 10) / 10;

  return {
    goalId: String(rawGoal.goalId ?? rawGoal.GoalID ?? '').trim(),
    goalName,
    targetAmount: Math.round(targetAmount * 100) / 100,
    currentSavings,
    remainingAmount,
    completionPercentage,
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

export async function getBootstrapData(
  config: VaultConnectionConfig,
  year: number,
  month: number
): Promise<VaultBootstrapData> {
  try {
    const raw = await callAppsScript<Record<string, unknown>>(config, 'getBootstrapData', {
      year,
      month,
    });
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
      days: ((rawCal.days || rawCal.activityByDate || {}) as Record<
        string,
        CalendarDayActivity
      >),
    };

    return {
      transactions: rawTxns,
      totalSavings: Math.round(totalSavings * 100) / 100,
      currentGoal: normalizeGoal(
        raw.currentGoal as Record<string, unknown> | null,
        totalSavings
      ),
      settings: { currency },
      thisMonth,
      calendarActivity,
      dateWiseSavings:
        (raw.dateWiseSavings as Record<string, CalendarDayActivity>) ||
        buildDateWiseFromTransactions(rawTxns),
    };
  } catch (err) {
    // Compatibility fallback if the deployed Apps Script implements individual
    // actions (getTransactions, getTotalSavings, getMonthlySavings, getCurrentGoal,
    // getCalendarActivity) instead of the combined getBootstrapData action.
    if (!(err instanceof VaultApiError) || err.code !== 'UNKNOWN_ACTION') {
      throw err;
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const [txnsRes, totalRes, monthlyRes, goalRes, calRes] = await Promise.all([
      callAppsScript<Record<string, unknown>>(config, 'getTransactions'),
      callAppsScript<Record<string, unknown>>(config, 'getTotalSavings'),
      callAppsScript<Record<string, unknown>>(config, 'getMonthlySavings', {
        year,
        month: monthKey,
      }),
      callAppsScript<Record<string, unknown>>(config, 'getCurrentGoal'),
      callAppsScript<Record<string, unknown>>(config, 'getCalendarActivity', {
        year,
        month: monthKey,
      }),
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
    const thisMonth: MonthlySummary = {
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
    };

    const dateWiseSavings = buildDateWiseFromTransactions(transactions);
    const daysMap: Record<string, CalendarDayActivity> = {};
    for (const [dateKey, entry] of Object.entries(dateWiseSavings)) {
      if (dateKey.startsWith(monthKey)) {
        daysMap[dateKey] = entry;
      }
    }

    const calendarActivity: CalendarActivity = {
      year,
      month,
      daysInMonth: getDaysInMonth(year, month),
      monthlyTotal: Number(calRes.monthlyTotal ?? calRes.monthlySavings ?? thisMonth.totalSavings),
      savingDays: Number(calRes.savingDays ?? calRes.activeDaysCount ?? uniqueSavingDays),
      days: daysMap,
    };

    const currentGoal = normalizeGoal(
      goalRes.goal as Record<string, unknown> | null,
      totalSavings,
      {
        completionPercentage: Number(goalRes.completionPercentage ?? 0),
        remainingAmount: Number(goalRes.remainingAmount ?? 0),
      }
    );

    return {
      transactions,
      totalSavings: Math.round(totalSavings * 100) / 100,
      currentGoal,
      settings: { currency },
      thisMonth,
      calendarActivity,
      dateWiseSavings,
    };
  }
}

export async function getTransactions(
  config: VaultConnectionConfig
): Promise<{ transactions: Transaction[]; count: number }> {
  const res = await callAppsScript<{ transactions: Record<string, unknown>[]; count: number }>(
    config,
    'getTransactions'
  );
  return {
    transactions: Array.isArray(res.transactions) ? res.transactions.map(normalizeTransaction) : [],
    count: Number(res.count ?? 0),
  };
}

export async function addTransaction(
  config: VaultConnectionConfig,
  input: TransactionInput,
  requestId: string
): Promise<{ transaction: Transaction }> {
  const res = await callAppsScript<{ transaction: Record<string, unknown> }>(
    config,
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
  config: VaultConnectionConfig,
  input: TransactionInput
): Promise<{ transaction: Transaction }> {
  const payload = {
    id: input.id,
    date: input.date,
    amount: input.amount,
    note: input.note,
  };
  try {
    const res = await callAppsScript<{ transaction: Record<string, unknown> }>(
      config,
      'updateTransaction',
      payload
    );
    return { transaction: normalizeTransaction(res.transaction || {}) };
  } catch (err) {
    if (err instanceof VaultApiError && err.code === 'UNKNOWN_ACTION') {
      const res = await callAppsScript<{ transaction: Record<string, unknown> }>(
        config,
        'editTransaction',
        payload
      );
      return { transaction: normalizeTransaction(res.transaction || {}) };
    }
    throw err;
  }
}

export async function deleteTransaction(
  config: VaultConnectionConfig,
  id: string
): Promise<{ deletedId: string }> {
  return callAppsScript<{ deletedId: string }>(config, 'deleteTransaction', { id });
}

export async function getTotalSavings(
  config: VaultConnectionConfig
): Promise<{ totalSavings: number; transactionCount: number }> {
  return callAppsScript<{ totalSavings: number; transactionCount: number }>(
    config,
    'getTotalSavings'
  );
}

export async function getMonthlySavings(
  config: VaultConnectionConfig,
  year: number,
  month: number
): Promise<MonthlySummary> {
  return callAppsScript<MonthlySummary>(config, 'getMonthlySavings', { year, month });
}

export async function getDateWiseSavings(
  config: VaultConnectionConfig
): Promise<{ dateWiseSavings: Record<string, CalendarDayActivity> }> {
  return callAppsScript<{ dateWiseSavings: Record<string, CalendarDayActivity> }>(
    config,
    'getDateWiseSavings'
  );
}

export async function getCurrentGoal(
  config: VaultConnectionConfig
): Promise<{ goal: SavingsGoal | null }> {
  return callAppsScript<{ goal: SavingsGoal | null }>(config, 'getCurrentGoal');
}

export async function upsertGoal(
  config: VaultConnectionConfig,
  input: GoalInput,
  requestId: string
): Promise<{ goal: SavingsGoal | null }> {
  const payload = {
    goalId: input.goalId || '',
    goalName: input.goalName,
    targetAmount: input.targetAmount,
  };
  try {
    return await callAppsScript<{ goal: SavingsGoal }>(
      config,
      'upsertGoal',
      payload,
      requestId
    );
  } catch (err) {
    if (err instanceof VaultApiError && err.code === 'UNKNOWN_ACTION') {
      return callAppsScript<{ goal: SavingsGoal }>(
        config,
        'saveGoal',
        payload,
        requestId
      );
    }
    throw err;
  }
}

export async function getCalendarActivity(
  config: VaultConnectionConfig,
  year: number,
  month: number
): Promise<CalendarActivity> {
  return callAppsScript<CalendarActivity>(config, 'getCalendarActivity', { year, month });
}

export async function updateSettings(
  config: VaultConnectionConfig,
  currency: CurrencyCode
): Promise<{ currency: CurrencyCode }> {
  try {
    return await callAppsScript<{ currency: CurrencyCode }>(config, 'updateSettings', {
      currency,
    });
  } catch (err) {
    if (err instanceof VaultApiError && err.code === 'UNKNOWN_ACTION') {
      throw new VaultApiError(
        'UPDATE_REQUIRED',
        'Please redeploy the latest apps-script/Code.gs Web App version to persist currency settings.'
      );
    }
    throw err;
  }
}
