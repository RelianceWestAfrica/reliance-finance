import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { PurchaseOrderType } from '@reliance-finance/database';
import { createPurchaseOrder } from '../actions';

export default async function NewPurchaseOrderPage(props: {
  searchParams: Promise<{ error?: string; expenseRequestId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const t = await getTranslations('pages.purchaseOrders');

  const db = await getTenantedDb();
  const [entities, projects, suppliers, expenseRequests] = await Promise.all([
    db.entity.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    db.project.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, entity: { select: { code: true } } },
    }),
    db.supplier.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    db.expenseRequest.findMany({
      where: { status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, reference: true, title: true },
    }),
  ]);

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createPurchaseOrder(formData);
    if (!r.ok || !r.id) {
      redirect('/purchase-orders/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/purchase-orders/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('new.title')}</h1>
        <Link
          href="/purchase-orders"
          className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          {t('new.back')}
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
                defaultValue={PurchaseOrderType.BC}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value={PurchaseOrderType.BC}>{t('new.typeOptions.BC')}</option>
                <option value={PurchaseOrderType.CONTRACT}>{t('new.typeOptions.CONTRACT')}</option>
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.entity')}
              <select
                name="entityId"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.fields.entityPlaceholder')}</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.project')}
              <select
                name="projectId"
                defaultValue=""
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.fields.projectNone')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.entity.code} / {p.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.linkedRequest')}
              <select
                name="expenseRequestId"
                defaultValue={params.expenseRequestId ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.fields.linkedRequestNone')}</option>
                {expenseRequests.map((er) => (
                  <option key={er.id} value={er.id}>
                    {er.reference} - {er.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              {t('new.fields.supplier')}
              <select
                name="supplierId"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.fields.supplierPlaceholder')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              {t('new.fields.objet')}
              <input
                name="objet"
                required
                minLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t('new.fields.description')}
              <textarea
                name="description"
                rows={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('new.sections.deliveryConditions')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('new.fields.deliveryLocation')}
              <input
                name="deliveryLocation"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.deliveryDeadline')}
              <input
                name="deliveryDeadline"
                type="date"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
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
              {t('new.fields.incoterm')}
              <input
                name="incoterm"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t('new.fields.paymentTerms')}
              <input
                name="paymentTerms"
                placeholder={t('new.fields.paymentTermsPlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.depositPercent')}
              <input
                name="depositPercent"
                type="number"
                min="0"
                max="100"
                step="1"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.warrantyMonths')}
              <input
                name="warrantyMonths"
                type="number"
                min="0"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.penaltyPerDay')}
              <input
                name="penaltyPerDay"
                type="number"
                min="0"
                step="0.01"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('new.sections.receptionRequired')}</h2>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresReceptionPv" defaultChecked />{' '}
              {t('new.fields.requiresReceptionPv')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresServiceDone" />{' '}
              {t('new.fields.requiresServiceDone')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresWorkAttachment" />{' '}
              {t('new.fields.requiresWorkAttachment')}
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
            href="/purchase-orders"
            className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            {t('new.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
