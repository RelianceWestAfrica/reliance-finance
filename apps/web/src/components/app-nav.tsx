'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type NavItem = { href: string; label: string; match?: string; icon: ReactNode };
type NavGroup = { label: string; items: NavItem[] };

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const GROUPS: NavGroup[] = [
  {
    label: 'Pilotage',
    items: [
      { href: '/dashboard', label: 'Tableau de bord', icon: (<svg viewBox="0 0 24 24" {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>) },
      { href: '/reporting', label: 'Reporting & KPIs', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>) },
    ],
  },
  {
    label: 'Cycle achat',
    items: [
      { href: '/suppliers', label: 'Fournisseurs', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M3 7h18M3 12h18M3 17h12" /></svg>) },
      { href: '/expense-requests', label: 'Demandes', icon: (<svg viewBox="0 0 24 24" {...s}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>) },
      { href: '/purchase-orders', label: 'Bons de commande', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg>) },
      { href: '/receptions', label: 'PV de réception', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M5 12l4 4L19 6" /></svg>) },
      { href: '/invoices', label: 'Factures', icon: (<svg viewBox="0 0 24 24" {...s}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 14h6" /></svg>) },
      { href: '/payments', label: 'Paiements', icon: (<svg viewBox="0 0 24 24" {...s}><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>) },
    ],
  },
  {
    label: 'Trésorerie & compta',
    items: [
      { href: '/cash-forecast', label: 'Cash forecast 13s', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M3 17l5-5 4 3 8-9" /><path d="M3 21h18" /></svg>) },
      { href: '/accounting', label: 'Comptabilité', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 9v11" /></svg>) },
    ],
  },
  {
    label: 'Contrôle',
    items: [
      { href: '/anomalies', label: 'Anomalies', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /></svg>) },
      { href: '/audit', label: 'Audit', icon: (<svg viewBox="0 0 24 24" {...s}><path d="M4 4h16v16H4z" /><path d="M8 12l3 3 5-6" /></svg>) },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/settings/users', label: 'Paramètres', match: '/settings', icon: (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></svg>) },
      { href: '/profile', label: 'Profil', icon: (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></svg>) },
    ],
  },
];

function useActive() {
  const p = usePathname() ?? '';
  return (item: NavItem) => {
    const key = item.match ?? item.href;
    if (key === '/dashboard') return p === '/dashboard';
    return p === key || p.startsWith(key + '/') || p === item.href;
  };
}

function initials(label: string) {
  const at = label.indexOf('@');
  const base = at > 0 ? label.slice(0, at) : label;
  const parts = base.replace(/[._-]/g, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || base.slice(0, 2).toUpperCase();
}

export function AppSidebar({
  userLabel,
  roleLabel,
  logoutAction,
}: {
  userLabel: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const isActive = useActive();

  return (
    <aside className="sticky top-0 hidden h-screen flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] md:flex">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-[18px]">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-white/15 bg-gradient-to-br from-[#1c6a48] to-[#0c4530] text-[17px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
          R
        </div>
        <div className="leading-tight">
          <div className="text-[16px] font-bold text-[#f4f1e8]">Reliance</div>
          <div className="mt-[2px] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-faint)]">
            Finance
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-[7px] pt-[14px] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-faint)]">
              {g.label}
            </div>
            {g.items.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    'relative flex items-center gap-3 rounded-[9px] px-3 py-[8.5px] text-[13.5px] font-normal transition-colors ' +
                    (active
                      ? 'bg-white/[0.07] text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-[var(--color-accent)] before:content-[""]'
                      : 'text-[var(--color-sidebar-foreground)] hover:bg-white/[0.05] hover:text-[#f4f1e8]')
                  }
                >
                  <span className={'flex-none ' + (active ? 'text-[#7fd0a6]' : 'opacity-80')}>
                    <span className="block h-[17px] w-[17px] [&>svg]:h-full [&>svg]:w-full">{item.icon}</span>
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 px-1 py-1">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-[var(--color-accent)] text-[13px] font-semibold text-[#1c1407]">
            {initials(userLabel)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium text-[#ede9de]">{userLabel}</div>
            <div className="truncate text-[11px] text-[var(--color-sidebar-faint)]">{roleLabel}</div>
          </div>
        </div>
        <form action={logoutAction} className="mt-2">
          <button
            type="submit"
            className="w-full rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-[var(--color-sidebar-foreground)] transition-colors hover:bg-white/[0.09] hover:text-white"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileNav({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const isActive = useActive();
  const flat = GROUPS.flatMap((g) => g.items);

  return (
    <header className="sticky top-0 z-20 bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/15 bg-gradient-to-br from-[#1c6a48] to-[#0c4530] text-[15px] font-semibold text-white">
            R
          </div>
          <span className="text-[15px] font-bold text-[#f4f1e8]">Reliance Finance</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-[8px] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium hover:bg-white/[0.09] hover:text-white"
          >
            Déconnexion
          </button>
        </form>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {flat.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ' +
                (active ? 'bg-white/[0.12] text-white' : 'text-[var(--color-sidebar-foreground)] hover:bg-white/[0.06]')
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
