import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CalendarView } from './components/CalendarView';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { DailySavingsView } from './components/DailySavingsView';
import { DashboardView } from './components/DashboardView';
import { GoalModal } from './components/GoalModal';
import { LayoutShell } from './components/LayoutShell';
import { PinLockScreen } from './components/PinLockScreen';
import { SettingsView } from './components/SettingsView';
import { ToastBanner } from './components/ToastBanner';
import { TransactionModal } from './components/TransactionModal';
import {
  addTransaction,
  changePin,
  configureBackendOnce,
  deleteTransaction,
  getAuthStatus,
  getBootstrapData,
  logoutVault,
  setupPin,
  updateSettings,
  updateTransaction,
  upsertGoal,
  VaultApiError,
  verifyPin,
} from './services/vaultApi';
import {
  AuthStatusResponse,
  CurrencyCode,
  GoalInput,
  NavSection,
  ToastMessage,
  Transaction,
  TransactionInput,
  VaultBootstrapData,
} from './types/vault';
import { generateRequestId } from './utils/format';

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [vaultData, setVaultData] = useState<VaultBootstrapData | null>(null);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

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

  const fetchVaultData = useCallback(async () => {
    const now = new Date();
    const data = await getBootstrapData(now.getFullYear(), now.getMonth() + 1);
    setVaultData(data);
    setSyncError(null);
    return data;
  }, []);

  const syncAuthSession = useCallback(async () => {
    setIsCheckingStatus(true);
    setConnectionError(null);
    try {
      const status = await getAuthStatus();
      setAuthStatus(status);

      if (status.authenticated) {
        setIsLoadingVault(true);
        try {
          await fetchVaultData();
        } catch (err) {
          if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
            setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
            setVaultData(null);
          } else {
            setSyncError(
              err instanceof Error ? err.message : 'Unable to load savings data from server.'
            );
          }
        } finally {
          setIsLoadingVault(false);
        }
      } else {
        setVaultData(null);
      }
    } catch (err) {
      setAuthStatus(null);
      setConnectionError(err instanceof Error ? err.message : 'Unable to connect to server.');
    } finally {
      setIsCheckingStatus(false);
    }
  }, [fetchVaultData]);

  useEffect(() => {
    void syncAuthSession();
  }, [syncAuthSession]);

  const handleConfigureBackend = async (endpointUrl: string, accessKey: string) => {
    await configureBackendOnce(endpointUrl, accessKey);
    await syncAuthSession();
    pushToast('success', 'Server connected.');
  };

  const handleSetupPin = async (pin: string, confirmPin: string) => {
    try {
      await setupPin(pin, confirmPin);
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'PIN_ALREADY_SET') {
        try {
          const refreshed = await getAuthStatus();
          setAuthStatus(refreshed);
        } catch {
          // Ignore status refresh failure
        }
      }
      throw err;
    }

    setAuthStatus({
      backendConfigured: true,
      pinConfigured: true,
      authenticated: true,
      locked: false,
      remainingSeconds: 0,
      attemptsRemaining: 5,
    });
    pushToast('success', 'Vault PIN created.');

    setIsLoadingVault(true);
    setSyncError(null);
    try {
      await fetchVaultData();
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
        setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
        setVaultData(null);
        throw err;
      }
      setSyncError(
        err instanceof Error ? err.message : 'Unable to load savings data from server.'
      );
    } finally {
      setIsLoadingVault(false);
    }
  };

  const handleVerifyPin = async (pin: string) => {
    try {
      await verifyPin(pin);
    } catch (err) {
      try {
        const refreshed = await getAuthStatus();
        setAuthStatus(refreshed);
      } catch {
        // Ignore secondary status refresh error
      }
      throw err;
    }

    setAuthStatus({
      backendConfigured: true,
      pinConfigured: true,
      authenticated: true,
      locked: false,
      remainingSeconds: 0,
      attemptsRemaining: 5,
    });

    setIsLoadingVault(true);
    setSyncError(null);
    try {
      await fetchVaultData();
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
        setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
        setVaultData(null);
        throw err;
      }
      setSyncError(
        err instanceof Error ? err.message : 'Unable to load savings data from server.'
      );
    } finally {
      setIsLoadingVault(false);
    }
  };

  const handleChangePin = async (
    currentPin: string,
    newPin: string,
    confirmPin: string
  ) => {
    await changePin(currentPin, newPin, confirmPin);
    pushToast('success', 'PIN updated successfully.');
  };

  const handleLockVault = async () => {
    try {
      await logoutVault();
    } catch {
      // Clear local state regardless
    }
    setVaultData(null);
    setSyncError(null);
    setActiveSection('dashboard');
    await syncAuthSession();
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchVaultData();
      pushToast('success', 'Synced with server.');
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
        await handleLockVault();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unable to connect to server.';
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
    if (isSubmittingTxn) return;
    setIsSubmittingTxn(true);
    try {
      if (input.id) {
        await updateTransaction(input);
        await fetchVaultData();
        setIsTxnModalOpen(false);
        setEditingTxn(null);
        pushToast('success', 'Updated successfully.');
      } else {
        await addTransaction(input, generateRequestId());
        await fetchVaultData();
        setIsTxnModalOpen(false);
        setModalInitialDate(undefined);
        pushToast('success', 'Saved successfully.');
      }
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
        await handleLockVault();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unable to connect to server.';
      pushToast('error', msg);
      throw err;
    } finally {
      setIsSubmittingTxn(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTxn || isDeletingTxn) return;
    setIsDeletingTxn(true);
    try {
      await deleteTransaction(deletingTxn.id);
      await fetchVaultData();
      setDeletingTxn(null);
      pushToast('success', 'Deleted successfully.');
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
        await handleLockVault();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unable to connect to server.';
      pushToast('error', msg);
    } finally {
      setIsDeletingTxn(false);
    }
  };

  const handleSaveGoal = async (input: GoalInput) => {
    if (isSavingGoal) return;
    setIsSavingGoal(true);
    try {
      await upsertGoal(input, generateRequestId());
      await fetchVaultData();
      setIsGoalModalOpen(false);
      pushToast('success', 'Saved successfully.');
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
        await handleLockVault();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unable to connect to server.';
      pushToast('error', msg);
      throw err;
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleUpdateCurrency = async (currency: CurrencyCode) => {
    if (isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    try {
      await updateSettings(currency);
      await fetchVaultData();
      pushToast('success', `Currency updated to ${currency}.`);
    } catch (err) {
      if (err instanceof VaultApiError && err.code === 'SESSION_REQUIRED') {
        await handleLockVault();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unable to connect to server.';
      pushToast('error', msg);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  if (!authStatus?.authenticated) {
    return (
      <>
        <PinLockScreen
          authStatus={authStatus}
          isCheckingStatus={isCheckingStatus}
          connectionError={connectionError}
          onRetryStatus={syncAuthSession}
          onConfigureBackend={handleConfigureBackend}
          onSetupPin={handleSetupPin}
          onVerifyPin={handleVerifyPin}
        />
        <ToastBanner toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (isLoadingVault && !vaultData) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-4">
          <div className="w-full max-w-xs rounded-2xl border border-[#292929] bg-[#141414] p-8 text-center">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#35C98A]" />
            <p className="mt-4 text-sm font-medium text-white">Loading Nexus Vault...</p>
            <p className="mt-1 text-xs text-[#929292]">Fetching your records from server</p>
          </div>
        </div>
        <ToastBanner toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (!vaultData) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[#292929] bg-[#141414] p-6 text-center">
            <h2 className="font-display text-lg font-semibold text-white">
              Unable to load vault data
            </h2>
            <p className="text-xs leading-relaxed text-[#929292]">
              {syncError || 'Unable to connect to server.'}
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void handleManualRefresh()}
                disabled={isRefreshing}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#35C98A] px-5 text-sm font-semibold text-[#080808] transition-colors hover:bg-[#2eb57b] disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Retrying...' : 'Retry Sync'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleLockVault()}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#292929] bg-[#1C1C1C] px-4 text-xs font-medium text-[#929292] transition-colors hover:text-white"
              >
                Lock Vault
              </button>
            </div>
          </div>
        </div>
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
        onLockVault={() => void handleLockVault()}
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
              className="rounded-lg border border-red-400/40 px-3 py-1.5 font-medium text-white hover:bg-red-500/20"
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
            isUpdatingSettings={isUpdatingSettings}
            isSavingGoal={isSavingGoal}
            onUpdateCurrency={handleUpdateCurrency}
            onSaveGoal={handleSaveGoal}
            onChangePin={handleChangePin}
            onLockVault={() => void handleLockVault()}
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
