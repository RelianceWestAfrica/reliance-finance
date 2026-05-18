// =============================================================================
// Cash forecast - Projection 13 semaines (pure)
// =============================================================================
// Agrege paiements scheduled + factures approuvees + entrees manuelles par
// semaine, calcule closing cash glissant, detecte les ruptures.
// =============================================================================

import { getWeekStart } from './week-math.js';

export interface ScheduledPayment {
  id: string;
  amount: number;
  scheduledAt: Date;
  currency: string;
}

export interface ApprovedInvoice {
  id: string;
  amountDue: number;
  dueDate: Date | null;
  currency: string;
}

export interface ProjectedInflow {
  expectedDate: Date;
  amount: number;
  label: string;
  currency: string;
}

export interface WeeklyProjection {
  weekStart: Date;
  index: number; // 0 = courante, 12 = +12 semaines
  openingCash: number;
  inflow: number;
  outflow: number;
  closingCash: number;
  isRupture: boolean;
  inflowLines: { date: Date; amount: number; label: string }[];
  outflowLines: { date: Date; amount: number; label: string }[];
}

export interface ProjectionInput {
  fromDate: Date; // semaine courante
  openingCash: number;
  weeks: number; // typiquement 13
  payments: ScheduledPayment[];
  invoices: ApprovedInvoice[];
  manualInflows: ProjectedInflow[];
  currency?: string;
}

/**
 * Calcule la projection 13 semaines a partir d'une date + opening cash.
 * Logique 100% PURE - aucune I/O.
 */
export function buildProjection(input: ProjectionInput): WeeklyProjection[] {
  const currency = input.currency ?? 'XOF';
  const weeks: WeeklyProjection[] = [];
  const firstWeekStart = getWeekStart(input.fromDate);

  // Filtre par devise
  const payments = input.payments.filter((p) => p.currency === currency);
  const invoices = input.invoices.filter((i) => i.currency === currency);
  const inflows = input.manualInflows.filter((i) => i.currency === currency);

  let openingCash = input.openingCash;

  for (let i = 0; i < input.weeks; i++) {
    const weekStart = new Date(firstWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    // Sorties : paiements scheduled DANS la semaine + factures dueDate DANS la semaine
    const weekPayments = payments.filter(
      (p) => p.scheduledAt >= weekStart && p.scheduledAt < weekEnd,
    );
    const weekInvoices = invoices.filter(
      (inv) => inv.dueDate !== null && inv.dueDate >= weekStart && inv.dueDate < weekEnd,
    );

    const outflowFromPayments = weekPayments.reduce((s, p) => s + p.amount, 0);
    const outflowFromInvoices = weekInvoices.reduce((s, i) => s + i.amountDue, 0);
    const outflow = outflowFromPayments + outflowFromInvoices;

    // Entrees : projections manuelles + futures factures clients (non implem ici)
    const weekInflows = inflows.filter(
      (inf) => inf.expectedDate >= weekStart && inf.expectedDate < weekEnd,
    );
    const inflow = weekInflows.reduce((s, inf) => s + inf.amount, 0);

    const closingCash = openingCash + inflow - outflow;
    const isRupture = closingCash < 0;

    weeks.push({
      weekStart,
      index: i,
      openingCash,
      inflow,
      outflow,
      closingCash,
      isRupture,
      inflowLines: weekInflows.map((inf) => ({
        date: inf.expectedDate,
        amount: inf.amount,
        label: inf.label,
      })),
      outflowLines: [
        ...weekPayments.map((p) => ({
          date: p.scheduledAt,
          amount: -p.amount,
          label: 'Paiement ' + p.id.slice(-6),
        })),
        ...weekInvoices.map((inv) => ({
          date: inv.dueDate!,
          amount: -inv.amountDue,
          label: 'Facture ' + inv.id.slice(-6),
        })),
      ],
    });

    // Le closing devient l'opening de la semaine suivante
    openingCash = closingCash;
  }

  return weeks;
}

// =============================================================================
// Detection rupture
// =============================================================================

export interface RuptureAlert {
  weekIndex: number;
  weekStart: Date;
  closingCash: number;
  deficit: number;
  /** Premiere semaine de rupture sur la fenetre */
  isFirstRupture: boolean;
}

export function detectRuptures(projection: WeeklyProjection[]): RuptureAlert[] {
  const alerts: RuptureAlert[] = [];
  let firstSeen = false;
  for (const week of projection) {
    if (week.isRupture) {
      alerts.push({
        weekIndex: week.index,
        weekStart: week.weekStart,
        closingCash: week.closingCash,
        deficit: -week.closingCash,
        isFirstRupture: !firstSeen,
      });
      firstSeen = true;
    }
  }
  return alerts;
}

/**
 * Renvoie l'horizon en jours avant la premiere rupture, ou null si aucune.
 */
export function daysUntilFirstRupture(
  projection: WeeklyProjection[],
  now: Date = new Date(),
): number | null {
  const first = projection.find((w) => w.isRupture);
  if (!first) return null;
  const ms = first.weekStart.getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / (24 * 3600 * 1000)));
}
