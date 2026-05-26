import { SupplierSensitivity } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { createSupplier } from '../actions';

export default async function NewSupplierPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const t = await getTranslations('pages.suppliers.new');

  const db = await getTenantedDb();
  const entities = await db.entity.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, kind: true, defaultCurrency: true },
  });

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createSupplier(formData);
    if (!r.ok || !r.id) {
      redirect('/suppliers/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/suppliers/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
        <Link
          href="/suppliers"
          className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          {t('back')}
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
          <h2 className="text-lg font-semibold">{t('section.identity')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('fields.entity')}
              <select
                name="entityId"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('fields.entityPlaceholder')}</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.name} ({e.kind})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('fields.code')}
              <input
                name="code"
                required
                placeholder={t('fields.codePlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t('fields.name')}
              <input
                name="name"
                required
                placeholder={t('fields.namePlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.rccm')}
              <input
                name="rccm"
                placeholder={t('fields.rccmPlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.ifu')}
              <input
                name="ifu"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.email')}
              <input
                name="email"
                type="email"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.phone')}
              <input
                name="phone"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t('fields.address')}
              <input
                name="address"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.country')}
              <input
                name="country"
                maxLength={2}
                placeholder={t('fields.countryPlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('section.sensitivity')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('fields.sensitivity')}
              <select
                name="sensitivity"
                defaultValue={SupplierSensitivity.STANDARD}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                {Object.values(SupplierSensitivity).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" name="isStrategic" /> {t('fields.isStrategic')}
            </label>
            <label className="text-sm sm:col-span-2">
              {t('fields.notes')}
              <textarea
                name="notes"
                rows={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('section.bank')}</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">{t('bankHelp')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('fields.bankName')}
              <input
                name="bankName"
                placeholder={t('fields.bankNamePlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.holderName')}
              <input
                name="holderName"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.iban')}
              <input
                name="iban"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.rib')}
              <input
                name="rib"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              {t('fields.swift')}
              <input
                name="swift"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              {t('fields.currency')}
              <input
                name="currency"
                defaultValue="XOF"
                maxLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
          </div>
        </section>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            {t('submit')}
          </button>
          <Link
            href="/suppliers"
            className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            {t('cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
