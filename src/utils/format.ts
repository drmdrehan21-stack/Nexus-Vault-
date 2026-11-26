import { CurrencyCode } from '../types/vault';

const CURRENCY_CONFIG: Record<CurrencyCode, { locale: string; symbol: string; label: string }> = {
  INR: { locale: 'en-IN', symbol: '₹', label: 'Indian Rupee (INR)' },
  USD: { locale: 'en-US', symbol: '$', label: 'US Dollar (USD)' },
  EUR: { locale: 'de-DE', symbol: '€', label: 'Euro (EUR)' },
  GBP: { locale: 'en-GB', symbol: '£', label: 'British Pound (GBP)' },
};

export function getCurrencyMeta(currency: CurrencyCode) {
  return CURRENCY_CONFIG[currency] ?? CURRENCY_CONFIG.INR;
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'INR'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const { locale } = getCurrencyMeta(currency);
  const hasDecimals = Math.abs(safe % 1) > 0.001;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatCompactCurrency(amount: number, currency: CurrencyCode = 'INR'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const { symbol } = getCurrencyMeta(currency);

  if (currency === 'INR') {
    if (safe >= 10000000) return `${symbol}${(safe / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (safe >= 100000) return `${symbol}${(safe / 100000).toFixed(1).replace(/\.0$/, '')}L`;
    if (safe >= 1000) return `${symbol}${(safe / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${symbol}${Math.round(safe)}`;
  }

  if (safe >= 1000000) return `${symbol}${(safe / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (safe >= 1000) return `${symbol}${(safe / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${symbol}${Math.round(safe)}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDaysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of next month gives exact days in month (handles leap years accurately)
  return new Date(year, month, 0).getDate();
}

export function getFirstWeekdayOfMonth(year: number, month: number): number {
  // 0 = Sunday, 6 = Saturday
  return new Date(year, month - 1, 1).getDay();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatDisplayDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatLongDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function isValidISODate(raw: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 2100 || month < 1 || month > 12) return false;
  return day >= 1 && day <= getDaysInMonth(year, month);
}

export function validateAmountValue(raw: string): { valid: boolean; value: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, value: 0, error: 'Please enter an amount.' };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return { valid: false, value: 0, error: 'Enter a valid numeric amount.' };
  }
  if (num <= 0) {
    return { valid: false, value: 0, error: 'Amount must be greater than zero.' };
  }
  if (num > 1000000000) {
    return { valid: false, value: 0, error: 'Amount exceeds maximum supported limit.' };
  }
  const rounded = Math.round(num * 100) / 100;
  return { valid: true, value: rounded };
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
