'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

// Fil d'Ariane fonctionnel dérivé de l'URL. Pas de recherche globale ni d'actions
// de page ici — celles-ci sont câblées au sein de chaque page si nécessaire.
// La clé `nav.items.<key>` est utilisée pour traduire le segment courant.
const SEGMENT_TO_KEY: Record<string, string> = {
  dashboard: 'dashboard',
  reporting: 'reporting',
  suppliers: 'suppliers',
  'expense-requests': 'expenseRequests',
  'purchase-orders': 'purchaseOrders',
  receptions: 'receptions',
  invoices: 'invoices',
  payments: 'payments',
  'cash-forecast': 'cashForecast',
  accounting: 'accounting',
  anomalies: 'anomalies',
  audit: 'audit',
  settings: 'settings',
  profile: 'profile',
  'offer-comparisons': 'offerComparisons',
  'sole-source-justifications': 'soleSourceJustifications',
};

export function AppHeader() {
  const pathname = usePathname() ?? '/';
  const seg = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const tNav = useTranslations('nav');
  const tCrumb = useTranslations('breadcrumb');

  const key = SEGMENT_TO_KEY[seg];
  const title = key ? tNav(`items.${key}`) : seg.charAt(0).toUpperCase() + seg.slice(1);

  return (
    <div className="sticky top-0 z-10 flex h-12 items-center border-b border-[var(--color-border)] bg-[var(--color-surface-white)] px-5 md:px-9">
      <nav
        aria-label={tCrumb('label')}
        className="flex items-center gap-2 text-[13px] text-[var(--fg-tertiary)]"
      >
        <span>{tCrumb('root')}</span>
        <span className="text-[var(--fg-muted)]">/</span>
        <span>{tCrumb('app')}</span>
        <span className="text-[var(--fg-muted)]">/</span>
        <span className="font-medium text-[var(--fg-primary)]">{title}</span>
      </nav>
    </div>
  );
}
