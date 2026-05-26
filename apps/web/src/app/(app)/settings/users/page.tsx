import { prisma, RoleCode } from '@reliance-finance/database';
import { formatDateTime } from '@/lib/format';
import { inviteUser, deactivateUser } from './actions';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export default async function UsersSettingsPage(props: {
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const t = await getTranslations('pages.settings.users');

  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;
  const infoMessage = searchParams.info ? decodeURIComponent(searchParams.info) : null;

  async function handleInvite(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.users');
    const result = await inviteUser(formData);
    if (!result.ok) {
      redirect('/settings/users?error=' + encodeURIComponent(result.error));
    }
    redirect(
      '/settings/users?info=' +
        encodeURIComponent(result.sent ? tServer('info.invited') : tServer('info.createdNoEmail')),
    );
  }

  async function handleDeactivate(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.users');
    const result = await deactivateUser(formData);
    if (!result.ok) {
      redirect(
        '/settings/users?error=' + encodeURIComponent(result.error ?? tServer('errors.failure')),
      );
    }
  }

  const [users, entities] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        emailVerified: true,
        hashedPassword: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          where: { isActive: true },
          select: { role: true, entity: { select: { code: true, name: true } } },
        },
      },
      take: 50,
    }),
    prisma.entity.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, kind: true },
    }),
  ]);

  const rolesOptions = Object.values(RoleCode);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
        >
          {errorMessage}
        </div>
      )}
      {infoMessage && (
        <div
          role="status"
          className="bg-[var(--color-success)]/10 rounded-md border border-[var(--color-success)] px-3 py-2 text-sm text-[var(--color-success)]"
        >
          {infoMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('invite.title')}</h2>
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          {t('invite.description')}
        </p>
        <form
          action={handleInvite}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            name="name"
            placeholder={t('invite.fullNamePlaceholder')}
            required
            minLength={2}
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          />
          <input
            name="email"
            type="email"
            placeholder={t('invite.emailPlaceholder')}
            required
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          />
          <select
            name="entityId"
            required
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="">{t('invite.entityPlaceholder')}</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} - {e.name} ({e.kind})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              name="role"
              required
              defaultValue={RoleCode.DEMANDEUR}
              className="flex-1 rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
            >
              {rolesOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              {t('invite.submit')}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">{t('columns.nameEmail')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.status')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.activeRoles')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.lastLogin')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name ?? t('unnamed')}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  {!u.isActive ? (
                    <span className="bg-[var(--color-destructive)]/10 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-destructive)]">
                      {t('status.deactivated')}
                    </span>
                  ) : !u.hashedPassword ? (
                    <span className="bg-[var(--color-warning)]/10 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                      {t('status.invitedNoPassword')}
                    </span>
                  ) : !u.emailVerified ? (
                    <span className="bg-[var(--color-warning)]/10 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                      {t('status.emailNotVerified')}
                    </span>
                  ) : (
                    <span className="bg-[var(--color-success)]/10 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
                      {t('status.active')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.memberships.length === 0 ? (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {t('rolesNone')}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.memberships.map((m, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs"
                        >
                          {m.role} / {m.entity.code}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t('lastLoginNever')}
                </td>
                <td className="px-4 py-3">
                  {u.isActive && u.id !== session.user.id && (
                    <form action={handleDeactivate}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="text-xs text-[var(--color-destructive)] hover:underline"
                      >
                        {t('actions.deactivate')}
                      </button>
                    </form>
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
