import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { SoleSourceReason } from '@reliance-finance/database';
import { createSoleSourceJustification } from '../actions';

export default async function NewSoleSourceJustificationPage(props: {
  searchParams: Promise<{ error?: string; expenseRequestId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const t = await getTranslations('pages.soleSourceJustifications');

  const db = await getTenantedDb();
  const expenseRequests = await db.expenseRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, reference: true, title: true, amount: true, currency: true },
  });

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createSoleSourceJustification(formData);
    if (!r.ok || !r.id) {
      redirect('/sole-source-justifications/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/sole-source-justifications/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('new.title')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('new.subtitle')}</p>
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
        <label className="block text-sm">
          {t('new.fields.request')}
          <select
            name="expenseRequestId"
            required
            defaultValue={params.expenseRequestId ?? ''}
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('new.fields.requestPlaceholder')}</option>
            {expenseRequests.map((er) => (
              <option key={er.id} value={er.id}>
                {er.reference} - {er.title} ({er.amount.toString()} {er.currency})
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t('new.fields.reason')}
            <select
              name="reason"
              required
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('new.fields.reasonPlaceholder')}</option>
              <option value={SoleSourceReason.MONOPOLY}>{t('new.reasons.monopoly')}</option>
              <option value={SoleSourceReason.URGENCY_CRITICAL}>
                {t('new.reasons.urgencyCritical')}
              </option>
              <option value={SoleSourceReason.TECHNICAL_COMPATIBILITY}>
                {t('new.reasons.technicalCompatibility')}
              </option>
              <option value={SoleSourceReason.CONTRACTUAL_REQUIREMENT}>
                {t('new.reasons.contractualRequirement')}
              </option>
              <option value={SoleSourceReason.OTHER}>{t('new.reasons.other')}</option>
            </select>
          </label>
          <label className="text-sm">
            {t('new.fields.otherReason')}
            <input
              name="otherReason"
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            {t('new.fields.estimatedAmount')}
            <input
              name="estimatedAmount"
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
        </div>

        <label className="block text-sm">
          {t('new.fields.justification')}
          <textarea
            name="justification"
            rows={4}
            required
            minLength={50}
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <fieldset className="rounded-md border p-4">
          <legend className="px-2 text-sm font-semibold">{t('new.safeguards.legend')}</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasNegotiatedPrice" />{' '}
              {t('new.safeguards.negotiatedPrice')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasReinforcedPaymentTerms" />{' '}
              {t('new.safeguards.reinforcedPaymentTerms')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasWarrantyOrPenalty" />{' '}
              {t('new.safeguards.warrantyOrPenalty')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasReinforcedReception" />{' '}
              {t('new.safeguards.reinforcedReception')}
            </label>
          </div>
        </fieldset>

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
