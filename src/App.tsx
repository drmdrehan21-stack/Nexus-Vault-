import { useCallback, useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { DailySavingsView } from './components/DailySavingsView';
import { DashboardView } from './components/DashboardView';
import { GoalModal } from './components/GoalModal';
import { LayoutShell } from './components/LayoutShell';
import { SettingsView } from './components/SettingsView';
import { ToastBanner } from './components/ToastBanner';
import { TransactionModal } from './components/TransactionModal';
import { VaultAuthGate } from './components/VaultAuthGate';
import {
  addTransaction,
  deleteTransaction,
  getBootstrapData,
  updateSettings,
  updateTransaction,
  upsertGoal,
  VaultApiError,
} from './services/vaultApi';
import {
  CurrencyCode,
  GoalInput,
  NavSection,
  ToastMessage,
  Transaction,
  TransactionInput,
  VaultBootstrapData,
  VaultConnectionConfig,
} from './types/vault';
import { generateRequestId } from './utils/format';

const ENV_APPS_SCRIPT_URL = (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined)?.trim() || '';

export default function App() {
  const [config, setConfig] = useState<VaultConnectionConfig | null>(null);
  const [vaultData, setVaultData] = useState<VaultBootstrapData | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Modals & mutation states
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<string | undefined>(undefined);
  const [isSubmittingTxn, setIsSubmittingTxn] = useState(false);

  const [deletingTxn, setDeletingTxn] = useState<Transaction | null>(null);
  const [isDeletingTxn, setIsDeletingTxn] = useState(false);

  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = generateRequestId();
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchVaultData = useCallback(async (activeConfig: VaultConnectionConfig) => {
    const now = new Date();
    const data = await getBootstrapData(
      activeConfig,
      now.getFullYear(),
      now.getMonth() + 1
    );
    setVaultData(data);
    setSyncError(null);
    return data;
  }, []);

  const handleUnlock = async (endpointUrl: string, accessKey: string) => {
    setAuthLoading(true);
    setAuthError(null);
    const nextConfig: VaultConnectionConfig = { endpointUrl, accessKey };
    try {
      await fetchVaultData(nextConfig);
      setConfig(nextConfig);
    } catch (err) {
      const msg =
        err instanceof VaultApiError
          ? err.message
          : 'Unable to connect to Google Apps Script backend.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLockVault = () => {
    setConfig(null);
    setVaultData(null);
    setSyncError(null);
    setAuthError(null);
    setActiveSection('dashboard');
  };

  const handleManualRefresh = async () => {
    if (!config || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchVaultData(config);
      pushToast('success', 'Synced with Google Sheets.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed.';
      setSyncError(msg);
      pushToast('error', msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  const openAddSaving = (prefillDate?: string) => {
    setEditingTxn(null);
    setModalInitialDate(prefillDate);
    setIsTxnModalOpen(true);
  };

  const openEditSaving = (txn: Transaction) => {
    setEditingTxn(txn);
    setModalInitialDate(undefined);
    setIsTxnModalOpen(true);
  };

  const handleSaveTransaction = async (input: TransactionInput) => {
    if (!config || isSubmittingTxn) return;
    setIsSubmittingTxn(true);
    try {
      if (input.id) {
        await updateTransaction(config, input);
        await fetchVaultData(config);
        setIsTxnModalOpen(false);
        setEditingTxn(null);
        pushToast('success', 'Saving entry updated in Google Sheets.');
      } else {
        await addTransaction(config, input, generateRequestId());
        await fetchVaultData(config);
        setIsTxnModalOpen(false);
        setModalInitialDate(undefined);
        pushToast('success', 'Saving recorded in Google Sheets.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save transaction.';
      pushToast('error', msg);
      throw err;
    } finally {
      setIsSubmittingTxn(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!config || !deletingTxn || isDeletingTxn) return;
    setIsDeletingTxn(true);
    try {
      await deleteTransaction(config, deletingTxn.id);
      await fetchVaultData(config);
      setDeletingTxn(null);
      pushToast('success', 'Saving entry deleted from Google Sheets.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete transaction.';
      pushToast('error', msg);
    } finally {
      setIsDeletingTxn(false);
    }
  };

  const handleSaveGoal = async (input: GoalInput) => {
    if (!config || isSavingGoal) return;
    setIsSavingGoal(true);
    try {
      await upsertGoal(config, input, generateRequestId());
      await fetchVaultData(config);
      setIsGoalModalOpen(false);
      pushToast('success', 'Savings goal saved to Google Sheets.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save goal.';
      pushToast('error', msg);
      throw err;
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleUpdateCurrency = async (currency: CurrencyCode) => {
    if (!config || isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    try {
      await updateSettings(config, currency);
      await fetchVaultData(config);
      pushToast('success', `Currency updated to ${currency}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update currency.';
      pushToast('error', msg);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  if (!config || !vaultData) {
    return (
      <>
        <VaultAuthGate
          defaultEndpointUrl={ENV_APPS_SCRIPT_URL}
          isLoading={authLoading}
          errorMessage={authError}
          onUnlock={handleUnlock}
        />
        <ToastBanner toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const currency = vaultData.settings.currency;

  return (
    <>
      <LayoutShell
        activeSection={activeSection}
        isRefreshing={isRefreshing}
        onNavigate={setActiveSection}
        onOpenAddSaving={() => openAddSaving()}
        onRefresh={handleManualRefresh}
        onLockVault={handleLockVault}
      >
        {syncError && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
          >
            <span>{syncError}</span>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="rounded-md border border-red-400/40 px-3 py-1.5 font-medium text-white hover:bg-red-500/20"
            >
              Retry Sync
            </button>
          </div>
        )}

        {activeSection === 'dashboard' && (
          <DashboardView
            currency={currency}
            totalSavings={vaultData.totalSavings}
            currentGoal={vaultData.currentGoal}
            thisMonth={vaultData.thisMonth}
            transactions={vaultData.transactions}
            isLoading={isRefreshing}
            onOpenAddSaving={() => openAddSaving()}
            onEditTransaction={openEditSaving}
            onDeleteTransaction={setDeletingTxn}
            onOpenGoalModal={() => setIsGoalModalOpen(true)}
            onNavigate={setActiveSection}
          />
        )}

        {activeSection === 'savings' && (
          <DailySavingsView
            currency={currency}
            transactions={vaultData.transactions}
            isSubmitting={isSubmittingTxn}
            onAddTransaction={handleSaveTransaction}
            onEditTransaction={openEditSaving}
            onDeleteTransaction={setDeletingTxn}
          />
        )}

        {activeSection === 'calendar' && (
          <CalendarView
            currency={currency}
            transactions={vaultData.transactions}
            onAddSavingForDate={(dateIso) => openAddSaving(dateIso)}
            onEditTransaction={openEditSaving}
            onDeleteTransaction={setDeletingTxn}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView
            currency={currency}
            currentGoal={vaultData.currentGoal}
            transactions={vaultData.transactions}
            endpointUrl={config.endpointUrl}
            isUpdatingSettings={isUpdatingSettings}
            isSavingGoal={isSavingGoal}
            onUpdateCurrency={handleUpdateCurrency}
            onSaveGoal={handleSaveGoal}
            onLockVault={handleLockVault}
          />
        )}
      </LayoutShell>

      <TransactionModal
        isOpen={isTxnModalOpen}
        currency={currency}
        editingTransaction={editingTxn}
        initialDate={modalInitialDate}
        isSubmitting={isSubmittingTxn}
        onClose={() => {
          if (!isSubmittingTxn) {
            setIsTxnModalOpen(false);
            setEditingTxn(null);
            setModalInitialDate(undefined);
          }
        }}
        onSubmit={handleSaveTransaction}
      />

      <ConfirmDeleteModal
        transaction={deletingTxn}
        currency={currency}
        isDeleting={isDeletingTxn}
        onCancel={() => {
          if (!isDeletingTxn) setDeletingTxn(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      <GoalModal
        isOpen={isGoalModalOpen}
        currency={currency}
        currentGoal={vaultData.currentGoal}
        isSubmitting={isSavingGoal}
        onClose={() => {
          if (!isSavingGoal) setIsGoalModalOpen(false);
        }}
        onSubmit={handleSaveGoal}
      />

      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
