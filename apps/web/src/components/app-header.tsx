'use client';

import { usePathname } from 'next/navigation';

// Functional breadcrumb derived from the route. Chrome only — no global search
// or page actions here (those belong to each page when wired to real features).
const TITLES: Record<string, string> = {
  dashboard: 'Tableau de bord',
  reporting: 'Reporting & KPIs',
  suppliers: 'Fournisseurs',
  'expense-requests': 'Demandes',
  'purchase-orders': 'Bons de commande',
  receptions: 'PV de réception',
  invoices: 'Factures',
  payments: 'Paiements',
  'cash-forecast': 'Cash forecast 13s',
  accounting: 'Comptabilité',
  anomalies: 'Anomalies',
  audit: 'Audit',
  settings: 'Paramètres',
  profile: 'Profil',
};

export function AppHeader() {
  const pathname = usePathname() ?? '/';
  const seg = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const title = TITLES[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);

  return (
    <div className="flex items-center px-5 pt-7 pb-1 md:px-9 md:pt-9">
      <nav aria-label="Fil d'Ariane" className="flex items-center gap-2 text-[13px] text-[var(--fg-tertiary)]">
        <span>RWA</span>
        <span className="text-[var(--fg-muted)]">/</span>
        <span>Finances</span>
        <span className="text-[var(--fg-muted)]">/</span>
        <span className="font-medium text-[var(--fg-primary)]">{title}</span>
      </nav>
    </div>
  );
}
