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

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  savings: 'Daily Savings',
  calendar: 'Savings Calendar',
  settings: 'Settings',
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
  return (
    <div className="min-h-screen bg-[#090909] text-white md:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-[248px] md:flex-col md:border-r md:border-[#262626] md:bg-[#090909]">
        <div className="flex h-16 items-center gap-3 border-b border-[#262626] px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#262626] bg-[#141414]">
            <Vault className="h-4 w-4 text-[#35C98A]" />
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

        <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3 py-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#141414] text-white border border-[#262626]'
                    : 'text-[#929292] border border-transparent hover:bg-[#141414]/60 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#35C98A]' : ''}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#262626] p-3">
          <button
            type="button"
            onClick={onLockVault}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3.5 text-sm font-medium text-[#929292] transition-colors hover:bg-[#141414] hover:text-white"
          >
            <Lock className="h-4 w-4 shrink-0" />
            <span>Lock Vault</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-[248px]">
        {/* Top Bar (scrolls naturally on mobile so sticky mobile height stays minimal) */}
        <header className="border-b border-[#262626] bg-[#090909]">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#262626] bg-[#141414] md:hidden">
                <Vault className="h-4 w-4 text-[#35C98A]" />
              </div>
              <h1 className="truncate font-display text-base font-semibold tracking-tight text-white sm:text-lg">
                {SECTION_TITLES[activeSection]}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label="Sync with Google Sheets"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#262626] bg-[#141414] px-3 text-xs font-medium text-[#929292] transition-colors hover:border-[#3a3a3a] hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#35C98A]' : ''}`} />
                <span className="hidden sm:inline">{isRefreshing ? 'Syncing' : 'Sync'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenAddSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#35C98A] px-3.5 text-xs font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b] sm:px-4 sm:text-sm whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Add Saving</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-6 md:py-8 md:pb-10 lg:px-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-[#262626] bg-[#090909]/95 backdrop-blur-md md:hidden"
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
              <span className="truncate">{item.label === 'Daily Savings' ? 'Savings' : item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
