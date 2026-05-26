import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { InvoiceStatus, InvoiceType } from '@reliance-finance/database';

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  RECEIVED: 'text-[var(--color-muted-foreground)]',
  CONTROL_3WAY_PENDING: 'text-[var(--color-warning)]',
  CONTROL_3WAY_OK: 'text-[var(--color-success)]',
  CONTROL_3WAY_KO: 'text-[var(--color-destructive)]',
  APPROVED: 'text-[var(--color-success)]',
  SCHEDULED: 'text-[var(--color-primary)]',
  PAID: 'text-[var(--color-success)]',
  PARTIALLY_PAID: 'text-[var(--color-warning)]',
  ARCHIVED: 'text-[var(--color-muted-foreground)]',
  DISPUTED: 'text-[var(--color-destructive)]',
};

export default async function InvoicesListPage(props: {
  searchParams: Promise<{ status?: InvoiceStatus; type?: InvoiceType }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const t = await getTranslations('pages.invoices');

  const db = await getTenantedDb();
  const invoices = await db.invoice.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      entity: { select: { code: true } },
      supplier: { select: { code: true, name: true } },
      purchaseOrder: { select: { reference: true } },
      reception: { select: { reference: true, status: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('listTitle')}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('listSubtitle')}</p>
        </div>
        <Link
          href="/invoices/new"
          className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          {t('newCtaWithPlus')}
        </Link>
      </header>

      <form className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('filters.allStatuses')}</option>
            {Object.values(InvoiceStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            name="type"
            defaultValue={params.type ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('filters.allTypes')}</option>
            {Object.values(InvoiceType).map((it) => (
              <option key={it} value={it}>
                {it}
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
              <th className="px-3 py-3 font-medium">{t('columns.ref')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.type')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.supplier')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.poPv')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.totalTtc')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.status')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.date')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('emptyShort')}
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={'/invoices/' + inv.id}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {inv.reference}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="px-3 py-2 text-xs">{inv.type}</td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-mono">{inv.supplier.code}</div>
                  <div className="text-[var(--color-muted-foreground)]">{inv.supplier.name}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>
                    {t('poLabel')}{' '}
                    <span className="font-mono">{inv.purchaseOrder?.reference ?? '-'}</span>
                  </div>
                  <div>
                    {t('pvLabel')}{' '}
                    <span className="font-mono">{inv.reception?.reference ?? '-'}</span>
                    {inv.reception && (
                      <span
                        className={
                          'ml-1 text-[10px] ' +
                          (inv.reception.status === 'DEFINITIVE'
                            ? 'text-[var(--color-success)]'
                            : 'text-[var(--color-warning)]')
                        }
                      >
                        ({inv.reception.status})
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(Number(inv.totalTtc.toString()), inv.currency)}
                </td>
                <td className={'px-3 py-2 text-xs font-medium ' + STATUS_COLOR[inv.status]}>
                  {inv.status}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(inv.invoiceDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
