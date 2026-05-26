import { prisma, EntityKind } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { createEntity, archiveEntity, updateEntity } from './actions';
import { formatDateTime } from '@/lib/format';

export default async function EntitiesSettingsPage(props: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const t = await getTranslations('pages.settings.entities');

  const kindLabels: Record<EntityKind, string> = {
    HOLDING: t('kind.HOLDING'),
    SUBSIDIARY: t('kind.SUBSIDIARY'),
    SPV: t('kind.SPV'),
  };

  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  async function handleCreate(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.entities');
    const result = await createEntity(formData);
    if (!result.ok) {
      redirect(
        '/settings/entities?error=' + encodeURIComponent(result.error ?? tServer('errors.failure')),
      );
    }
  }

  async function handleArchive(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.entities');
    const result = await archiveEntity(formData);
    if (!result.ok) {
      redirect(
        '/settings/entities?error=' + encodeURIComponent(result.error ?? tServer('errors.failure')),
      );
    }
  }

  async function handleUpdate(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.entities');
    const result = await updateEntity(formData);
    if (!result.ok) {
      redirect(
        '/settings/entities?error=' + encodeURIComponent(result.error ?? tServer('errors.failure')),
      );
    }
    redirect('/settings/entities');
  }

  const entities = await prisma.entity.findMany({
    orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    include: {
      parentEntity: { select: { code: true } },
      _count: { select: { children: true, projects: true, suppliers: true } },
    },
  });

  const editing = params.edit ? entities.find((e) => e.id === params.edit) : null;
  const possibleParents = entities.filter((e) => e.isActive && e.kind !== EntityKind.SPV);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
        >
          {errorMessage}
        </div>
      )}

      {editing ? (
        <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('edit.heading', { code: editing.code })}</h2>
          <form action={handleUpdate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing.id} />
            <label className="text-sm">
              {t('edit.name')}
              <input
                name="name"
                required
                defaultValue={editing.name}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('edit.country')}
              <input
                name="country"
                defaultValue={editing.country ?? ''}
                maxLength={2}
                placeholder={t('edit.countryPlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              {t('edit.defaultCurrency')}
              <input
                name="defaultCurrency"
                required
                defaultValue={editing.defaultCurrency}
                maxLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              {t('edit.rccm')}
              <input
                name="rccm"
                defaultValue={editing.rccm ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('edit.ifu')}
              <input
                name="ifu"
                defaultValue={editing.ifu ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t('edit.address')}
              <input
                name="address"
                defaultValue={editing.address ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                {t('edit.save')}
              </button>
              <a
                href="/settings/entities"
                className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
              >
                {t('edit.cancel')}
              </a>
            </div>
          </form>
        </section>
      ) : (
        <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('create.heading')}</h2>
          <form
            action={handleCreate}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="text-sm">
              {t('create.code')}
              <input
                name="code"
                required
                placeholder={t('create.codePlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              {t('create.name')}
              <input
                name="name"
                required
                placeholder={t('create.namePlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              {t('create.kind')}
              <select
                name="kind"
                required
                defaultValue={EntityKind.SUBSIDIARY}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                {Object.values(EntityKind).map((k) => (
                  <option key={k} value={k}>
                    {kindLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('create.parent')}
              <select
                name="parentEntityId"
                defaultValue=""
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('create.parentPlaceholder')}</option>
                {possibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} ({kindLabels[p.kind]})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t('create.country')}
              <input
                name="country"
                maxLength={2}
                placeholder={t('create.countryPlaceholder')}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              {t('create.defaultCurrency')}
              <input
                name="defaultCurrency"
                defaultValue="XOF"
                maxLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2 lg:col-span-3"
            >
              {t('create.submit')}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">{t('columns.code')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.kind')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.name')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.parent')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.countryCurrency')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.relations')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.createdAt')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr
                key={e.id}
                className={'border-b last:border-0 ' + (e.isActive ? '' : 'opacity-50')}
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold">{e.code}</td>
                <td className="px-4 py-3 text-xs">{kindLabels[e.kind]}</td>
                <td className="px-4 py-3">{e.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.parentEntity?.code ?? '-'}</td>
                <td className="px-4 py-3 text-xs">
                  {e.country ?? '-'} / {e.defaultCurrency}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {e._count.children} / {e._count.projects} / {e._count.suppliers}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(e.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.isActive ? (
                    <div className="flex justify-end gap-2">
                      <a
                        href={'/settings/entities?edit=' + e.id}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {t('actions.edit')}
                      </a>
                      <form action={handleArchive}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="reason" value={t('actions.archiveReason')} />
                        <button
                          type="submit"
                          className="text-xs text-[var(--color-destructive)] hover:underline"
                        >
                          {t('actions.archive')}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {t('actions.archived')}
                    </span>
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
