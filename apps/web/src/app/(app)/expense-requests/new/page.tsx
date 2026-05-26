import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { ExpenseRequestType, OpexCapex, UrgencyLevel } from '@reliance-finance/database';
import { createExpenseRequest } from '../actions';

export default async function NewExpenseRequestPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const t = await getTranslations('pages.expenseRequests');

  const db = await getTenantedDb();
  const [entities, projects, costCenters, suppliers] = await Promise.all([
    db.entity.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, kind: true },
    }),
    db.project.findMany({
      where: { isActive: true },
      orderBy: [{ entityId: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        entityId: true,
        entity: { select: { code: true } },
      },
    }),
    db.costCenter.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, entityId: true },
    }),
    db.supplier.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, entityId: true, sensitivity: true },
    }),
  ]);

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createExpenseRequest(formData);
    if (!r.ok || !r.id) {
      redirect('/expense-requests/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/expense-requests/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('new.title')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('new.subtitle')}</p>
        <Link
          href="/expense-requests"
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
                defaultValue={ExpenseRequestType.FD}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value={ExpenseRequestType.FDA}>{t('new.typeOptions.FDA')}</option>
                <option value={ExpenseRequestType.FD}>{t('new.typeOptions.FD')}</option>
                <option value={ExpenseRequestType.FD_URGENCE}>
                  {t('new.typeOptions.FD_URGENCE')}
                </option>
              </select>
            </label>
            <label className="text-sm sm:col-span-1">
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
                    {p.entity.code} / {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.costCenter')}
              <select
                name="costCenterId"
                defaultValue=""
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.fields.costCenterNone')}</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              {t('new.fields.supplier')}
              <select
                name="supplierId"
                defaultValue=""
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('new.fields.supplierNone')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}{' '}
                    {s.sensitivity !== 'STANDARD' ? '(' + s.sensitivity + ')' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              {t('new.fields.title')}
              <input
                name="title"
                required
                minLength={3}
                placeholder={t('new.fields.titlePlaceholder')}
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
            <label className="text-sm sm:col-span-2">
              {t('new.fields.justification')}
              <textarea
                name="justification"
                rows={2}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('new.sections.amountBudget')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm">
              {t('new.fields.amount')}
              <input
                name="amount"
                type="number"
                min="1"
                step="0.01"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
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
              {t('new.fields.nature')}
              <select
                name="opexCapex"
                defaultValue={OpexCapex.OPEX}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value={OpexCapex.OPEX}>OPEX</option>
                <option value={OpexCapex.CAPEX}>CAPEX</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              {t('new.fields.budgetLine')}
              <input
                name="budgetLineRef"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="isOutOfBudget" />
              {t('new.fields.outOfBudget')}
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('new.sections.urgencyDelivery')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('new.fields.urgency')}
              <select
                name="urgency"
                defaultValue={UrgencyLevel.LOW}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                {Object.values(UrgencyLevel).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('new.fields.urgencyReason')}
              <input
                name="urgencyReason"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.desiredDate')}
              <input
                name="desiredDate"
                type="date"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('new.fields.location')}
              <input
                name="location"
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
            href="/expense-requests"
            className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            {t('new.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
