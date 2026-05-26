import { prisma, RoleCode } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { addMembership, revokeMembership } from './actions';

export default async function MembershipsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations('pages.settings.memberships');

  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  async function handleAdd(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.memberships');
    const result = await addMembership(formData);
    if (!result.ok) {
      redirect(
        '/settings/memberships?error=' +
          encodeURIComponent(result.error ?? tServer('errors.failure')),
      );
    }
  }

  async function handleRevoke(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.memberships');
    const result = await revokeMembership(formData);
    if (!result.ok) {
      redirect(
        '/settings/memberships?error=' +
          encodeURIComponent(result.error ?? tServer('errors.failure')),
      );
    }
  }
  const [memberships, users, entities] = await Promise.all([
    prisma.membership.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        entity: { select: { id: true, code: true, name: true, kind: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, name: true },
    }),
    prisma.entity.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, kind: true },
    }),
  ]);

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

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('addSection')}</h2>
        <form
          action={handleAdd}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          <select
            name="userId"
            required
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="">{t('form.userPlaceholder')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          <select
            name="entityId"
            required
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="">{t('form.entityPlaceholder')}</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} ({e.kind})
              </option>
            ))}
          </select>
          <select
            name="role"
            required
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="">{t('form.rolePlaceholder')}</option>
            {Object.values(RoleCode).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            {t('form.submit')}
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">{t('columns.user')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.entity')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.role')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {memberships.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('empty')}
                </td>
              </tr>
            ) : (
              memberships.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{m.user.name ?? '-'}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {m.user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {m.entity.code}
                    <span className="ml-2 text-[var(--color-muted-foreground)]">
                      ({m.entity.kind})
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{m.role}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={handleRevoke}>
                      <input type="hidden" name="membershipId" value={m.id} />
                      <button
                        type="submit"
                        className="text-xs text-[var(--color-destructive)] hover:underline"
                      >
                        {t('actions.revoke')}
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
