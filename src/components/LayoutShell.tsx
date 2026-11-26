import { ReactNode } from 'react';
import {
  CalendarDays,
  LayoutDashboard,
  Lock,
  Plus,
  RefreshCw,
  Settings,
  Vault,
  Wallet,
} from 'lucide-react';
import { NavSection } from '../types/vault';

interface LayoutShellProps {
  activeSection: NavSection;
  isRefreshing: boolean;
  onNavigate: (section: NavSection) => void;
  onOpenAddSaving: () => void;
  onRefresh: () => void;
  onLockVault: () => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'savings', label: 'Daily Savings', icon: Wallet },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SECTION_META: Record<NavSection, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of your personal savings vault' },
  savings: { title: 'Daily Savings', subtitle: 'Record and manage your deposit ledger' },
  calendar: { title: 'Savings Calendar', subtitle: 'Monthly deposit activity and streaks' },
  settings: { title: 'Settings', subtitle: 'Security, currency, and goal preferences' },
};

export function LayoutShell({
  activeSection,
  isRefreshing,
  onNavigate,
  onOpenAddSaving,
  onRefresh,
  onLockVault,
  children,
}: LayoutShellProps) {
  const meta = SECTION_META[activeSection];

  return (
    <div className="min-h-screen bg-[#080808] text-white md:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-[256px] md:flex-col md:border-r md:border-[#292929] md:bg-[#080808]">
        <div className="flex h-[72px] items-center gap-3 border-b border-[#292929] px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#292929] bg-[#141414]">
            <Vault className="h-4.5 w-4.5 text-[#35C98A]" />
          </div>
          <div className="min-w-0">
            <span className="block truncate font-display text-sm font-semibold tracking-tight text-white">
              NEXUS VAULT
            </span>
            <span className="block truncate text-[11px] text-[#929292]">
              Save Today. Secure Tomorrow.
            </span>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 space-y-1.5 px-3.5 py-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? 'border border-[#292929] bg-[#141414] text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)]'
                    : 'border border-transparent text-[#929292] hover:bg-[#141414]/60 hover:text-white'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#35C98A]' : 'text-[#929292]'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#292929] p-3.5">
          <button
            type="button"
            onClick={onLockVault}
            className="flex h-10 w-full items-center gap-3 rounded-xl border border-transparent px-3.5 text-sm font-medium text-[#929292] transition-colors hover:border-[#292929] hover:bg-[#141414] hover:text-white"
          >
            <Lock className="h-4 w-4 shrink-0" />
            <span>Lock Vault</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-[256px]">
        <header className="border-b border-[#292929] bg-[#080808]">
          <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#292929] bg-[#141414] md:hidden">
                <Vault className="h-4 w-4 text-[#35C98A]" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-semibold tracking-tight text-white sm:text-lg">
                  {meta.title}
                </h1>
                <p className="hidden truncate text-xs text-[#929292] sm:block">{meta.subtitle}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label="Sync with server"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#292929] bg-[#141414] px-3.5 text-xs font-medium text-[#929292] transition-colors hover:border-[#3d3d3d] hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#35C98A]' : ''}`}
                />
                <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenAddSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#35C98A] px-4 text-xs font-semibold text-[#080808] transition-colors hover:bg-[#2eb57b] sm:text-sm whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Add Saving</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-6 md:py-8 md:pb-12 lg:px-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-[#292929] bg-[#080808]/95 backdrop-blur-md md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#35C98A]' : 'text-[#929292] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">
                {item.label === 'Daily Savings' ? 'Savings' : item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
