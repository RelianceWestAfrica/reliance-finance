import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { createOfferComparison } from '../actions';

export default async function NewOfferComparisonPage(props: {
  searchParams: Promise<{ error?: string; expenseRequestId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const t = await getTranslations('pages.offerComparisons');

  const db = await getTenantedDb();
  const [entities, projects, expenseRequests] = await Promise.all([
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
    db.expenseRequest.findMany({
      where: {
        status: { in: ['DRAFT', 'SUBMITTED', 'FINANCE_FIL_VISA_PENDING', 'FINANCE_FIL_VISA_OK'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, reference: true, title: true },
    }),
  ]);

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createOfferComparison(formData);
    if (!r.ok || !r.id) {
      redirect('/offer-comparisons/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/offer-comparisons/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('new.title')}</h1>
        <Link
          href="/offer-comparisons"
          className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          &larr; {t('new.back')}
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

      <form
        action={handleCreate}
        className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <option value="">{t('new.fields.projectPlaceholder')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.entity.code} / {p.code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            {t('new.fields.request')}
            <select
              name="expenseRequestId"
              defaultValue={params.expenseRequestId ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('new.fields.requestPlaceholder')}</option>
              {expenseRequests.map((er) => (
                <option key={er.id} value={er.id}>
                  {er.reference} - {er.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            {t('new.fields.technicalSpecs')}
            <textarea
              name="technicalSpecs"
              rows={3}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            {t('new.fields.desiredDelay')}
            <input
              name="desiredDelay"
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            {t('new.fields.paymentTerms')}
            <input
              name="paymentTerms"
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="warrantyRequired" /> {t('new.fields.warrantyRequired')}
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
          <label className="text-sm sm:col-span-2">
            {t('new.fields.penaltyClause')}
            <input
              name="penaltyClause"
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          {t('new.submit')}
        </button>
      </form>
    </div>
  );
}
