import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatCurrency } from '@/lib/format';
import {
  ExpenseRequestType,
  PaymentStatus,
} from '@reliance-finance/database';
import { buildKpiSummary } from '@/lib/kpis/compute';

export default async function ReportingPage(props: {
  searchParams: Promise<{ entityId?: string; projectId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;

  const db = await getTenantedDb();

  const [entities, projects, payments, expenseRequests, emergencies, projectsBudget, topAnomalies] =
    await Promise.all([
      db.entity.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
      db.project.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, entity: { select: { code: true } } } }),
      db.payment.findMany({
        where: {
          ...(params.entityId ? { entityId: params.entityId } : {}),
          ...(params.projectId ? { projectId: params.projectId } : {}),
        },
        include: {
          invoice: {
            select: {
              receptionId: true,
              reception: { select: { status: true } },
              threeWayMatch: { select: { quantityMatch: true, priceMatch: true, totalMatch: true } },
            },
          },
        },
      }),
      db.expenseRequest.findMany({
        where: {
          ...(params.entityId ? { entityId: params.entityId } : {}),
          ...(params.projectId ? { projectId: params.projectId } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          status: true,
          purchaseOrders: { select: { invoices: { select: { payments: { where: { status: { in: ['EXECUTED', 'RECONCILED'] } }, select: { executedAt: true }, take: 1 } } } } },
        },
      }),
      db.expenseRequest.findMany({
        where: {
          type: ExpenseRequestType.FD_URGENCE,
          ...(params.entityId ? { entityId: params.entityId } : {}),
        },
        select: { id: true, emergencyDeadlineAt: true, regularizedAt: true },
      }),
      db.project.findMany({
        where: { isActive: true, ...(params.entityId ? { entityId: params.entityId } : {}) },
        select: {
          id: true,
          code: true,
          budget: true,
          payments: {
            where: { status: { in: ['EXECUTED', 'RECONCILED'] } },
            select: { amount: true },
          },
        },
      }),
      db.anomaly.findMany({
        where: {
          status: { in: ['OPEN', 'INVESTIGATING'] },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
          ...(params.entityId ? { entityId: params.entityId } : {}),
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        include: { entity: { select: { code: true } } },
      }),
    ]);

  const kpi = buildKpiSummary({
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount.toString()),
      status: p.status as PaymentStatus,
      threeWayMatchOk: p.invoice?.threeWayMatch
        ? p.invoice.threeWayMatch.quantityMatch &&
          p.invoice.threeWayMatch.priceMatch &&
          p.invoice.threeWayMatch.totalMatch
        : false,
      hasPVDefinitif: p.invoice?.reception?.status === 'DEFINITIVE',
    })),
    expenseRequests: expenseRequests.map((er) => {
      const firstPayment = er.purchaseOrders.flatMap((po) => po.invoices).flatMap((i) => i.payments)[0];
      return {
        id: er.id,
        createdAt: er.createdAt,
        paidAt: firstPayment?.executedAt ?? null,
      };
    }),
    emergencies: emergencies.map((e) => ({
      id: e.id,
      emergencyDeadlineAt: e.emergencyDeadlineAt,
      regularizedAt: e.regularizedAt,
    })),
    projects: projectsBudget.map((p) => ({
      projectId: p.id,
      projectCode: p.code,
      budget: p.budget ? Number(p.budget.toString()) : 0,
      actualSpent: p.payments.reduce((s, pay) => s + Number(pay.amount.toString()), 0),
    })),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Reporting &amp; KPIs</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Vue consolidee : conformite, delais, urgences, budget vs reel, top anomalies (cadre §10).
        </p>
      </header>

      <form className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select name="entityId" defaultValue={params.entityId ?? ''} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Toutes entites --</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.code} - {e.name}</option>
            ))}
          </select>
          <select name="projectId" defaultValue={params.projectId ?? ''} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Tous projets --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.entity.code} / {p.code} - {p.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-[var(--color-foreground)] px-3 py-2 text-xs font-medium text-white hover:opacity-90">
            Filtrer
          </button>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">% paiements conformes</div>
          <div className={'mt-1 text-3xl font-semibold tabular-nums ' + (kpi.compliantPaymentsPercent >= 95 ? 'text-[var(--color-success)]' : kpi.compliantPaymentsPercent >= 75 ? 'text-[var(--color-warning)]' : 'text-[var(--color-destructive)]')}>
            {kpi.compliantPaymentsPercent.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {kpi.compliantPayments} / {kpi.totalPayments} (3-way OK + PV DEF)
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Delai moyen FD -&gt; paiement</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {kpi.avgLeadTimeDays !== null ? kpi.avgLeadTimeDays.toFixed(1) + ' j' : 'N/A'}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Urgences hors delai</div>
          <div className={'mt-1 text-3xl font-semibold tabular-nums ' + (kpi.emergencyOverdueCount > 0 ? 'text-[var(--color-destructive)]' : 'text-[var(--color-success)]')}>
            {kpi.emergencyOverdueCount} / {kpi.emergencyCount}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {kpi.emergencyOverdueRate.toFixed(1)}% non regularisees
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Anomalies semaine</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{topAnomalies.length}</div>
          <Link href="/anomalies" className="mt-1 inline-block text-xs text-[var(--color-primary)] hover:underline">
            Voir toutes
          </Link>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Top 5 anomalies de la semaine</h2>
        </header>
        {topAnomalies.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Aucune anomalie cette semaine. Excellent !
          </p>
        ) : (
          <ul className="divide-y">
            {topAnomalies.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <Link href={'/anomalies/' + a.id} className="block hover:bg-[var(--color-muted)]/50">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + (a.severity === 'CRITICAL' ? 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]' : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]')}>
                        {a.severity}
                      </span>
                      <span className="font-mono text-xs">{a.type}</span>
                    </div>
                    <span className="font-mono text-xs">{a.entity.code}</span>
                  </div>
                  <div className="mt-1 text-sm">{a.title}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Budget vs reel par projet</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">Projet</th>
              <th className="px-3 py-2 font-medium text-right">Budget</th>
              <th className="px-3 py-2 font-medium text-right">Reel</th>
              <th className="px-3 py-2 font-medium text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {kpi.budgetVsActual.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucun projet avec budget.
                </td>
              </tr>
            )}
            {kpi.budgetVsActual.map((p) => (
              <tr key={p.projectCode} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{p.projectCode}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.budget)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.actualSpent)}</td>
                <td className={'px-3 py-2 text-right text-xs font-medium tabular-nums ' + (p.isOverBudget ? 'text-[var(--color-destructive)]' : 'text-[var(--color-success)]')}>
                  {p.variancePercent > 0 ? '+' : ''}{p.variancePercent.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
