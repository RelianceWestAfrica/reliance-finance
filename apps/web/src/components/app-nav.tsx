'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

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

function AccountMenuItem({ href, title, sub, icon }: { href: string; title: string; sub: string; icon: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-[8px] px-2.5 py-2 transition-colors hover:bg-[var(--color-surface-2)]"
    >
      <span className="mt-[1px] flex-none text-[var(--color-muted-foreground)]">
        <span className="block h-[16px] w-[16px] [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      </span>
      <span className="leading-tight">
        <span className="block text-[12.5px] font-medium text-[var(--color-foreground)]">{title}</span>
        <span className="block text-[11px] text-[var(--color-faint)]">{sub}</span>
      </span>
    </Link>
  );
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-white)] text-[var(--color-foreground)] md:flex">
      {/* Header: logo + brand, with FR + notifications pinned to the right edge */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-[16px]">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[var(--color-primary)] p-[7px]">
          <img src="/rwa-icon.svg" alt="RWA" className="h-full w-full" />
        </div>
        <div className="leading-tight">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-faint)]">RWA</div>
          <div className="text-[15px] font-bold text-[var(--color-foreground)]">Finances</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="flex items-center gap-1 rounded-[7px] border border-[var(--color-border)] px-1.5 py-[5px] text-[11px] font-medium text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            FR
            <svg viewBox="0 0 24 24" className="h-3 w-3" {...s}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="rounded-[7px] border border-[var(--color-border)] p-[6px] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" {...s}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-[7px] pt-[14px] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-faint)]">
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
                      ? 'bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary)] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-[var(--color-primary)] before:content-[""]'
                      : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]')
                  }
                >
                  <span className={'flex-none ' + (active ? 'text-[var(--color-primary)]' : 'opacity-70')}>
                    <span className="block h-[17px] w-[17px] [&>svg]:h-full [&>svg]:w-full">{item.icon}</span>
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="relative border-t border-[var(--color-border)] p-3">
        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Fermer le menu"
              className="fixed inset-0 z-[5] cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-full left-3 right-3 z-10 mb-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-white)] p-1.5 shadow-[var(--shadow-lg)]">
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-faint)]">
                Compte
              </div>
              <AccountMenuItem href="/profile" title="Mon profil" sub="Nom, email, photo…" icon={<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></svg>} />
              <AccountMenuItem href="/set-password" title="Mot de passe" sub="Réinitialiser le mot de passe" icon={<svg viewBox="0 0 24 24" {...s}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M16 6l3 3M14 8l2 2" /></svg>} />
              <AccountMenuItem href="/profile" title="Préférences" sub="Langue, affichage" icon={<svg viewBox="0 0 24 24" {...s}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>} />
              <div className="my-1 h-px bg-[var(--color-border)]" />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] font-medium text-[var(--color-destructive)] transition-colors hover:bg-[var(--color-destructive-soft)]"
                >
                  <span className="flex-none"><svg viewBox="0 0 24 24" className="h-4 w-4" {...s}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></span>
                  Déconnexion
                </button>
              </form>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-[9px] px-1 py-1.5 transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-[var(--color-primary-soft)] text-[13px] font-semibold text-[var(--color-primary)]">
            {initials(userLabel)}
          </div>
          <div className="min-w-0 text-left">
            <div className="truncate text-[12.5px] font-medium text-[var(--color-foreground)]">{userLabel}</div>
            <div className="truncate text-[11px] text-[var(--color-faint)]">{roleLabel}</div>
          </div>
          <svg viewBox="0 0 24 24" className={'ml-auto h-4 w-4 flex-none text-[var(--color-faint)] transition-transform ' + (menuOpen ? 'rotate-180' : '')} {...s}><polyline points="6 9 12 15 18 9" /></svg>
        </button>

        <a
          href="https://portal.rwa-core.com"
          className="mt-2 flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[11.5px] font-medium text-[var(--color-faint)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...s}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Back to RWA HQ
        </a>
      </div>
    </aside>
  );
}

export function MobileNav({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const isActive = useActive();
  const flat = GROUPS.flatMap((g) => g.items);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-white)] text-[var(--color-foreground)] md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--color-primary)] p-1.5">
            <img src="/rwa-icon.svg" alt="RWA" className="h-full w-full" />
          </div>
          <span className="text-[15px] font-bold text-[var(--color-foreground)]">RWA Finances</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
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
                (active
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-2)]')
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
