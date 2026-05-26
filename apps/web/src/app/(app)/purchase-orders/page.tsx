import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { PurchaseOrderStatus, PurchaseOrderType } from '@reliance-finance/database';

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'text-[var(--color-muted-foreground)]',
  PENDING_SIGNATURES: 'text-[var(--color-warning)]',
  SIGNED: 'text-[var(--color-success)]',
  SENT_TO_SUPPLIER: 'text-[var(--color-primary)]',
  PARTIAL: 'text-[var(--color-warning)]',
  CLOSED: 'text-[var(--color-muted-foreground)]',
  CANCELLED: 'text-[var(--color-destructive)]',
};

export default async function PurchaseOrdersListPage(props: {
  searchParams: Promise<{ status?: PurchaseOrderStatus; type?: PurchaseOrderType }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const t = await getTranslations('pages.purchaseOrders');

  const db = await getTenantedDb();
  const orders = await db.purchaseOrder.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      entity: { select: { code: true } },
      supplier: { select: { code: true, name: true } },
      expenseRequest: { select: { reference: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
        </div>
        <Link
          href="/purchase-orders/new"
          className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          {t('newCta')}
        </Link>
      </header>

      <form className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('filtersAllStatus')}</option>
            {Object.values(PurchaseOrderStatus).map((s) => (
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
            <option value="">{t('filtersAllTypes')}</option>
            {Object.values(PurchaseOrderType).map((tp) => (
              <option key={tp} value={tp}>
                {tp}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-foreground)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            {t('filterCta')}
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-3 font-medium">{t('columns.ref')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.type')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.objet')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.supplier')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.totalTtc')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.linkedExpense')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.status')}</th>
              <th className="px-3 py-3 font-medium">{t('columns.created')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
            {orders.map((po) => (
              <tr key={po.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={'/purchase-orders/' + po.id}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {po.reference}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">{po.type}</td>
                <td className="px-3 py-2">{po.objet}</td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-mono">{po.supplier.code}</div>
                  <div className="text-[var(--color-muted-foreground)]">{po.supplier.name}</div>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatCurrency(Number(po.totalTtc.toString()), po.currency)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {po.expenseRequest?.reference ?? '-'}
                </td>
                <td className={'px-3 py-2 text-xs font-medium ' + STATUS_COLOR[po.status]}>
                  {po.status}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(po.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
