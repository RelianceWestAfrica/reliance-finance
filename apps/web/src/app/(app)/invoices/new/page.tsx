import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { InvoiceType } from '@reliance-finance/database';
import { createInvoice } from '../actions';

export default async function NewInvoicePage(props: {
  searchParams: Promise<{ error?: string; purchaseOrderId?: string; receptionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const t = await getTranslations('pages.invoices');

  const db = await getTenantedDb();
  const [entities, suppliers, purchaseOrders, receptions, invoicesForCredit] = await Promise.all([
    db.entity.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    db.supplier.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, entityId: true },
    }),
    db.purchaseOrder.findMany({
      where: { status: { in: ['SIGNED', 'SENT_TO_SUPPLIER', 'PARTIAL', 'CLOSED'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, reference: true, supplier: { select: { code: true } } },
    }),
    db.reception.findMany({
      where: { status: { in: ['DEFINITIVE', 'PROVISIONAL'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reference: true,
        status: true,
        purchaseOrder: { select: { reference: true } },
      },
    }),
    db.invoice.findMany({
      where: { type: 'STANDARD', status: { in: ['APPROVED', 'PAID', 'PARTIALLY_PAID'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        reference: true,
        invoiceNumber: true,
        supplier: { select: { code: true } },
      },
    }),
  ]);

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createInvoice(formData);
    if (!r.ok || !r.id) {
      redirect('/invoices/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/invoices/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('new.titleFull')}</h1>
        <Link
          href="/invoices"
          className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          &larr; {t('new.backShort')}
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

      <form action={handleCreate} className="space-y-6">
        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('new.sections.identification')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('new.fields.type')}
              <select
                name="type"
                required
                defaultValue={InvoiceType.STANDARD}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value={InvoiceType.STANDARD}>{t('new.options.standard')}</option>
                <option value={InvoiceType.CREDIT_NOTE}>{t('new.options.creditNote')}</option>
                <option value={InvoiceType.DEPOSIT}>{t('new.options.deposit')}</option>
                <option value={InvoiceType.ADVANCE}>{t('new.options.advance')}</option>
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.originalInvoice')}
              <select
                name="originalInvoiceId"
                defaultValue=""
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.options.none')}</option>
                {invoicesForCredit.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.reference} ({inv.invoiceNumber}) - {inv.supplier.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.entity')}
              <select
                name="entityId"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.options.entityPlaceholder')}</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.supplier')}
              <select
                name="supplierId"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.options.supplierPlaceholder')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.po')}
              <select
                name="purchaseOrderId"
                defaultValue={params.purchaseOrderId ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.options.noneMasc')}</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.reference} ({po.supplier.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.reception')}
              <select
                name="receptionId"
                defaultValue={params.receptionId ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.options.noneMasc')}</option>
                {receptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference} - BC {r.purchaseOrder.reference} ({r.status})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('new.sections.invoice')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm">
              {t('new.fields.numberRequired')}
              <input
                name="invoiceNumber"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.invoiceDate')}
              <input
                name="invoiceDate"
                type="date"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.dueDateShort')}
              <input
                name="dueDate"
                type="date"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.subtotalHt')}
              <input
                name="subtotalHt"
                type="number"
                min="0"
                step="0.01"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.taxAmount')}
              <input
                name="taxAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.retentionAmount')}
              <input
                name="retentionAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.totalTtc')}
              <input
                name="totalTtc"
                type="number"
                min="0"
                step="0.01"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-semibold tabular-nums"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.currency')}
              <input
                name="currency"
                defaultValue="XOF"
                maxLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.taxRate')}
              <input
                name="taxRate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="text-sm sm:col-span-3">
              {t('new.fields.taxLabel')}
              <input
                name="taxLabel"
                placeholder={t('new.taxLabelPlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            {t('new.submit')}
          </button>
          <Link
            href="/invoices"
            className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            {t('new.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
