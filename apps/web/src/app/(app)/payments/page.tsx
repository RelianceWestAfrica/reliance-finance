import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { PaymentStatus } from '@reliance-finance/database';
import { computeCashPosition } from '@/lib/payments/cash-position';

const STATUS_COLOR: Record<PaymentStatus, string> = {
  DRAFT: 'text-[var(--color-muted-foreground)]',
  ANTI_FRAUD_PENDING: 'text-[var(--color-warning)]',
  SCHEDULED: 'text-[var(--color-primary)]',
  EXECUTED: 'text-[var(--color-success)]',
  RECONCILED: 'text-[var(--color-success)]',
  FAILED: 'text-[var(--color-destructive)]',
  CANCELLED: 'text-[var(--color-muted-foreground)]',
};

export default async function PaymentsListPage(props: {
  searchParams: Promise<{ status?: PaymentStatus }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const t = await getTranslations('pages.payments');

  const db = await getTenantedDb();
  const [payments, futureInvoices] = await Promise.all([
    db.payment.findMany({
      where: { ...(params.status ? { status: params.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        entity: { select: { code: true } },
        invoice: { select: { reference: true, invoiceNumber: true } },
        bankAccount: { select: { holderName: true, iban: true, rib: true } },
        createdBy: { select: { email: true } },
      },
    }),
    db.invoice.findMany({
      where: { status: 'APPROVED' },
      select: { totalTtc: true, amountPaid: true, currency: true },
    }),
  ]);

  // Position de cash (toutes entites visibles + XOF par defaut)
  const position = computeCashPosition(
    payments.map((p) => ({
      amount: Number(p.amount.toString()),
      currency: p.currency,
      status: p.status,
    })),
    futureInvoices.map((i) => ({
      amountDue: Number(i.totalTtc.toString()) - Number(i.amountPaid.toString()),
      currency: i.currency,
    })),
    'XOF',
  );

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('listTitle')}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('listSubtitle')}</p>
        </div>
        <Link
          href="/payments/new"
          className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          {t('newCtaWithPlus')}
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.executed')}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(position.executed, position.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.scheduled')}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-warning)]">
            {formatCurrency(position.scheduled, position.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.futureCommitments')}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(position.futureCommitments, position.currency)}
          </div>
        </div>
        <div className="rounded-lg border-2 border-[var(--color-primary)] bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-primary)]">
            {t('kpi.totalCommitted')}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(position.totalCommitted, position.currency)}
          </div>
        </div>
      </section>

      <form className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="flex gap-3">
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('filters.allStatuses')}</option>
            {Object.values(PaymentStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-foreground)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            {t('filters.apply')}
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-3 font-medium">{t('columns.reference')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.invoice')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.beneficiary')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.amount')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.status')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.scheduledOrExecuted')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('emptyShort')}
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={'/payments/' + p.id}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {p.reference}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {p.invoice?.reference ?? '-'}
                  <br />
                  <span className="text-[var(--color-muted-foreground)]">
                    {p.invoice?.invoiceNumber}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>{p.beneficiaryName}</div>
                  <div className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    {p.beneficiaryIban ?? p.beneficiaryRib}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(Number(p.amount.toString()), p.currency)}
                </td>
                <td className={'px-3 py-2 text-xs font-medium ' + STATUS_COLOR[p.status]}>
                  {p.status}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  {p.scheduledAt && t('scheduledPrefix') + ' ' + formatDateTime(p.scheduledAt)}
                  {p.executedAt && (
                    <>
                      {p.scheduledAt && <br />}
                      {t('executedPrefix')} {formatDateTime(p.executedAt)}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
