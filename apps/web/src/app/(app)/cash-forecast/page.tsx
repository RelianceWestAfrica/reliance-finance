import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, PaymentStatus, CashFlowDirection, CashFlowCategory } from '@reliance-finance/database';
import { formatCurrency } from '@/lib/format';
import {
  buildProjection,
  daysUntilFirstRupture,
} from '@/lib/cash-forecast/projection';
import { getWeekStart, weekLabel } from '@/lib/cash-forecast/week-math';
import {
  addManualInflow,
  setOpeningCash,
  runRuptureDetection,
} from './actions';

export default async function CashForecastPage(props: {
  searchParams: Promise<{ entityId?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const db = await getTenantedDb();
  const entities = await db.entity.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, defaultCurrency: true },
  });

  const selectedEntityId = params.entityId ?? entities[0]?.id;
  if (!selectedEntityId) {
    return (
      <div className="rounded-lg border bg-[var(--color-card)] p-6 text-center text-sm">
        Aucune entite accessible.
      </div>
    );
  }

  const selectedEntity = entities.find((e) => e.id === selectedEntityId);
  const currency = selectedEntity?.defaultCurrency ?? 'XOF';
  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 13 * 7);

  const [forecastHeader, scheduledPayments, approvedInvoices, manualLines] = await Promise.all([
    prisma.cashForecast.findFirst({
      where: { entityId: selectedEntityId, weekStart: getWeekStart(now) },
      select: { openingCash: true, currency: true },
    }),
    prisma.payment.findMany({
      where: {
        entityId: selectedEntityId,
        status: PaymentStatus.SCHEDULED,
      },
      select: { id: true, amount: true, scheduledAt: true, currency: true },
    }),
    prisma.invoice.findMany({
      where: {
        entityId: selectedEntityId,
        status: { in: ['APPROVED', 'PARTIALLY_PAID'] },
      },
      select: {
        id: true,
        totalTtc: true,
        amountPaid: true,
        dueDate: true,
        currency: true,
      },
    }),
    prisma.cashForecastLine.findMany({
      where: {
        cashForecast: { entityId: selectedEntityId },
        direction: CashFlowDirection.INFLOW,
      },
      select: {
        id: true,
        amount: true,
        label: true,
        expectedDate: true,
        category: true,
        cashForecast: { select: { currency: true } },
      },
    }),
  ]);

  const openingCash = forecastHeader ? Number(forecastHeader.openingCash.toString()) : 0;

  const projection = buildProjection({
    fromDate: now,
    openingCash,
    weeks: 13,
    payments: scheduledPayments
      .filter((p) => p.scheduledAt)
      .map((p) => ({
        id: p.id,
        amount: Number(p.amount.toString()),
        scheduledAt: p.scheduledAt!,
        currency: p.currency,
      })),
    invoices: approvedInvoices.map((i) => ({
      id: i.id,
      amountDue: Number(i.totalTtc.toString()) - Number(i.amountPaid.toString()),
      dueDate: i.dueDate,
      currency: i.currency,
    })),
    manualInflows: manualLines
      .filter((l) => l.expectedDate)
      .map((l) => ({
        expectedDate: l.expectedDate!,
        amount: Number(l.amount.toString()),
        label: l.label,
        currency: l.cashForecast.currency,
      })),
    currency,
  });

  const horizon = daysUntilFirstRupture(projection, now);
  const ruptureCount = projection.filter((w) => w.isRupture).length;
  const minCash = projection.reduce((min, w) => (w.closingCash < min ? w.closingCash : min), Infinity);
  const maxCash = projection.reduce((max, w) => (w.closingCash > max ? w.closingCash : max), -Infinity);

  async function handleAddInflow(formData: FormData) {
    'use server';
    const r = await addManualInflow(formData);
    if (!r.ok) redirect('/cash-forecast?entityId=' + selectedEntityId + '&error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSetOpening(formData: FormData) {
    'use server';
    const r = await setOpeningCash(formData);
    if (!r.ok) redirect('/cash-forecast?entityId=' + selectedEntityId + '&error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleDetect(formData: FormData) {
    'use server';
    await runRuptureDetection(formData);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cash forecast 13 semaines</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Projection roulante : opening + entrees - sorties = closing par semaine (cadre §3.5).
            Notification DFG sur rupture projetee.
          </p>
        </div>
        <form>
          <select
            name="entityId"
            defaultValue={selectedEntityId}
            onChange={undefined}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.code} - {e.name}</option>
            ))}
          </select>
          <button type="submit" className="ml-2 rounded-md border px-3 py-2 text-xs hover:bg-[var(--color-muted)]">
            Charger
          </button>
        </form>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Opening cash</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(openingCash, currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Closing min S0-S12</div>
          <div className={'mt-1 text-xl font-semibold tabular-nums ' + (minCash < 0 ? 'text-[var(--color-destructive)]' : 'text-[var(--color-foreground)]')}>
            {formatCurrency(minCash === Infinity ? 0 : minCash, currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Semaines en rupture</div>
          <div className={'mt-1 text-xl font-semibold tabular-nums ' + (ruptureCount > 0 ? 'text-[var(--color-destructive)]' : 'text-[var(--color-success)]')}>
            {ruptureCount} / 13
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Horizon rupture</div>
          <div className={'mt-1 text-xl font-semibold tabular-nums ' + (horizon !== null && horizon <= 14 ? 'text-[var(--color-destructive)]' : 'text-[var(--color-success)]')}>
            {horizon === null ? 'OK' : 'J+' + horizon}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Heatmap 13 semaines</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="border-b px-2 py-1 text-left text-[10px] uppercase text-[var(--color-muted-foreground)]">Semaine</th>
                {projection.map((w) => (
                  <th key={w.index} className="border-b px-1 py-1 text-center text-[10px]">
                    {weekLabel(w.weekStart)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b px-2 py-2 text-[var(--color-muted-foreground)]">Opening</td>
                {projection.map((w) => (
                  <td key={w.index} className="border-b px-1 py-2 text-right tabular-nums text-[10px]">
                    {w.openingCash.toFixed(0)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border-b px-2 py-2 text-[var(--color-success)]">+ Entrees</td>
                {projection.map((w) => (
                  <td key={w.index} className="border-b px-1 py-2 text-right tabular-nums text-[10px] text-[var(--color-success)]">
                    {w.inflow > 0 ? '+' + w.inflow.toFixed(0) : '-'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border-b px-2 py-2 text-[var(--color-destructive)]">- Sorties</td>
                {projection.map((w) => (
                  <td key={w.index} className="border-b px-1 py-2 text-right tabular-nums text-[10px] text-[var(--color-destructive)]">
                    {w.outflow > 0 ? '-' + w.outflow.toFixed(0) : '-'}
                  </td>
                ))}
              </tr>
              <tr className="bg-[var(--color-muted)]/30">
                <td className="px-2 py-2 font-semibold">= Closing</td>
                {projection.map((w) => {
                  // Heatmap color : green if positive et large, red if negative
                  const cls = w.isRupture
                    ? 'bg-[var(--color-destructive)] text-white'
                    : w.closingCash >= maxCash * 0.5
                      ? 'bg-[var(--color-success)]/20'
                      : '';
                  return (
                    <td key={w.index} className={'px-1 py-2 text-right tabular-nums font-mono text-xs font-semibold ' + cls}>
                      {w.closingCash.toFixed(0)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <form action={handleSetOpening} className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Definir opening cash</h3>
          <input type="hidden" name="entityId" value={selectedEntityId} />
          <div className="mt-3 flex gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              required
              placeholder="Montant"
              className="flex-1 rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
            />
            <input
              name="currency"
              defaultValue={currency}
              maxLength={3}
              className="w-16 rounded-md border bg-white px-3 py-2 text-sm uppercase"
            />
          </div>
          <button className="mt-2 w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Mettre a jour
          </button>
        </form>

        <form action={handleAddInflow} className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Ajouter une entree projetee</h3>
          <input type="hidden" name="entityId" value={selectedEntityId} />
          <input type="hidden" name="currency" value={currency} />
          <div className="mt-3 space-y-2">
            <input
              name="label"
              required
              placeholder="Libelle (ex: Reglement client X)"
              className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="Montant"
                className="flex-1 rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
              <input
                name="expectedDate"
                type="date"
                required
                className="rounded-md border bg-white px-3 py-2 text-sm"
              />
            </div>
            <input
              name="weekStart"
              type="hidden"
              value={getWeekStart(new Date()).toISOString().slice(0, 10)}
            />
            <select
              name="category"
              defaultValue={CashFlowCategory.REVENUE}
              className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {Object.values(CashFlowCategory).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button className="mt-2 w-full rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90">
            + Ajouter entree
          </button>
        </form>

        <form action={handleDetect} className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Detection rupture</h3>
          <input type="hidden" name="entityId" value={selectedEntityId} />
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            Lance l\'analyse + cree une Anomaly + notifie DFG/Tresorier si rupture
            projetee a J+15 ou moins. Severite CRITICAL si rupture &lt;= 14 jours.
          </p>
          <button className="mt-2 w-full rounded-md border border-[var(--color-warning)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10">
            Lancer la detection
          </button>
        </form>
      </section>
    </div>
  );
}
