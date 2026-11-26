export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export type NavSection = 'dashboard' | 'savings' | 'calendar' | 'settings';

export interface AuthStatusResponse {
  backendConfigured: boolean;
  pinConfigured: boolean;
  authenticated: boolean;
  locked: boolean;
  remainingSeconds: number;
  attemptsRemaining: number;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  note: string;
  createdAt: string;
}

export interface SavingsGoal {
  goalId: string;
  goalName: string;
  targetAmount: number;
  currentSavings: number;
  remainingAmount: number;
  completionPercentage: number;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlySummary {
  year: number;
  month: number; // 1-12
  monthPrefix: string;
  totalSavings: number;
  savingDays: number;
  transactionCount: number;
}

export interface CalendarDayActivity {
  date: string; // YYYY-MM-DD
  total: number;
  count: number;
}

export interface CalendarActivity {
  year: number;
  month: number; // 1-12
  daysInMonth: number;
  monthlyTotal: number;
  savingDays: number;
  days: Record<string, CalendarDayActivity>;
}

export interface VaultSettings {
  currency: CurrencyCode;
}

export interface VaultBootstrapData {
  transactions: Transaction[];
  totalSavings: number;
  currentGoal: SavingsGoal | null;
  settings: VaultSettings;
  thisMonth: MonthlySummary;
  calendarActivity: CalendarActivity;
  dateWiseSavings: Record<string, CalendarDayActivity>;
}

export interface TransactionInput {
  id?: string;
  date: string;
  amount: number;
  note: string;
}

export interface GoalInput {
  goalId?: string;
  goalName: string;
  targetAmount: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
}
