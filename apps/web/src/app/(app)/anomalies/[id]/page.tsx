import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, AnomalyStatus } from '@reliance-finance/database';
import { formatDateTime } from '@/lib/format';
import { assignAnomaly, resolveAnomaly } from '../actions';

export default async function AnomalyDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;
  const t = await getTranslations('pages.anomalies.detail');

  const db = await getTenantedDb();
  const anomaly = await db.anomaly.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      assignee: { select: { email: true, name: true } },
      reporter: { select: { email: true } },
    },
  });
  if (!anomaly) notFound();

  // Liste des assignataires possibles
  const potentialAssignees = await prisma.membership.findMany({
    where: {
      isActive: true,
      role: { in: ['CONTROLEUR_INTERNE', 'DFG', 'ADMIN'] },
    },
    distinct: ['userId'],
    include: { user: { select: { id: true, email: true } } },
  });

  async function handleAssign(formData: FormData) {
    'use server';
    const r = await assignAnomaly(formData);
    if (!r.ok) redirect('/anomalies/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleResolve(formData: FormData) {
    'use server';
    const r = await resolveAnomaly(formData);
    if (!r.ok) redirect('/anomalies/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const isOpen =
    anomaly.status === AnomalyStatus.OPEN || anomaly.status === AnomalyStatus.INVESTIGATING;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{anomaly.title}</h1>
          <p className="font-mono text-sm text-[var(--color-muted-foreground)]">
            {anomaly.reference}
          </p>
        </div>
        <Link href="/anomalies" className="text-xs text-[var(--color-primary)] hover:underline">
          &larr; {t('backShort')}
        </Link>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
        >
          {errorMessage}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.severity')}
          </div>
          <div className="mt-1 font-mono text-sm">{anomaly.severity}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.type')}
          </div>
          <div className="mt-1 font-mono text-xs">{anomaly.type}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.status')}
          </div>
          <div className="mt-1 font-mono text-sm">{anomaly.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.detected')}
          </div>
          <div className="mt-1 text-xs">{formatDateTime(anomaly.createdAt)}</div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold">{t('description.title')}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm">{anomaly.description}</p>
        {anomaly.detectionRule && (
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            {t('description.rule')} : <span className="font-mono">{anomaly.detectionRule}</span>
          </p>
        )}
        {anomaly.evidence && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
              {t('description.evidence')}
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--color-muted)] p-3 font-mono text-[10px]">
              {JSON.stringify(anomaly.evidence, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t('linkedResources.title')}</h3>
        <ul className="mt-2 space-y-1 text-xs">
          {anomaly.expenseRequestId && (
            <li>
              {t('linkedResources.expenseRequest')} :{' '}
              <Link
                href={'/expense-requests/' + anomaly.expenseRequestId}
                className="font-mono text-[var(--color-primary)] hover:underline"
              >
                {anomaly.expenseRequestId.slice(0, 12)}...
              </Link>
            </li>
          )}
          {anomaly.invoiceId && (
            <li>
              {t('linkedResources.invoice')} :{' '}
              <Link
                href={'/invoices/' + anomaly.invoiceId}
                className="font-mono text-[var(--color-primary)] hover:underline"
              >
                {anomaly.invoiceId.slice(0, 12)}...
              </Link>
            </li>
          )}
          {anomaly.paymentId && (
            <li>
              {t('linkedResources.payment')} :{' '}
              <Link
                href={'/payments/' + anomaly.paymentId}
                className="font-mono text-[var(--color-primary)] hover:underline"
              >
                {anomaly.paymentId.slice(0, 12)}...
              </Link>
            </li>
          )}
          {anomaly.supplierId && (
            <li>
              {t('linkedResources.supplier')} :{' '}
              <Link
                href={'/suppliers/' + anomaly.supplierId}
                className="font-mono text-[var(--color-primary)] hover:underline"
              >
                {anomaly.supplierId.slice(0, 12)}...
              </Link>
            </li>
          )}
        </ul>
      </section>

      {anomaly.assignee && (
        <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('assignedTo')}</h3>
          <p className="mt-2 text-sm">{anomaly.assignee.email}</p>
        </section>
      )}

      {anomaly.resolvedAt && anomaly.resolution && (
        <section className="bg-[var(--color-success)]/5 rounded-lg border border-[var(--color-success)] p-4">
          <h3 className="text-sm font-semibold text-[var(--color-success)]">
            {t('resolution.title')}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">{anomaly.resolution}</p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            {t('resolution.resolvedAt', { date: formatDateTime(anomaly.resolvedAt) })}
          </p>
        </section>
      )}

      {isOpen && (
        <>
          <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
            <h3 className="text-sm font-semibold">{t('assign.title')}</h3>
            <form action={handleAssign} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={anomaly.id} />
              <select
                name="assigneeId"
                required
                className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('assign.placeholder')}</option>
                {potentialAssignees.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.email}
                  </option>
                ))}
              </select>
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                {t('assign.submit')}
              </button>
            </form>
          </section>

          <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
            <h3 className="text-sm font-semibold">{t('resolve.title')}</h3>
            <form action={handleResolve} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={anomaly.id} />
              <textarea
                name="resolution"
                required
                minLength={10}
                rows={3}
                placeholder={t('resolve.placeholder')}
                className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  name="outcome"
                  value="RESOLVED"
                  className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90"
                >
                  {t('resolve.submit')}
                </button>
                <button
                  type="submit"
                  name="outcome"
                  value="FALSE_POSITIVE"
                  className="rounded-md border px-3 py-2 text-xs hover:bg-[var(--color-muted)]"
                >
                  {t('resolve.falsePositive')}
                </button>
                <button
                  type="submit"
                  name="outcome"
                  value="SANCTION_REQUESTED"
                  className="hover:bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)]"
                >
                  {t('resolve.sanction')}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
