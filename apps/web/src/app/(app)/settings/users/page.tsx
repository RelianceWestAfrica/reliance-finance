import { prisma, RoleCode } from '@reliance-finance/database';
import { formatDateTime } from '@/lib/format';
import { inviteUser, deactivateUser } from './actions';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function UsersSettingsPage(props: {
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;
  const infoMessage = searchParams.info ? decodeURIComponent(searchParams.info) : null;

  async function handleInvite(formData: FormData) {
    'use server';
    const result = await inviteUser(formData);
    if (!result.ok) {
      redirect('/settings/users?error=' + encodeURIComponent(result.error));
    }
    redirect('/settings/users?info=' + encodeURIComponent(
      result.sent
        ? 'Invitation envoyee a l\'utilisateur (verifiez Mailhog en dev).'
        : 'Utilisateur cree mais l\'email n\'a pas pu etre envoye.',
    ));
  }

  async function handleDeactivate(formData: FormData) {
    'use server';
    const result = await deactivateUser(formData);
    if (!result.ok) {
      redirect('/settings/users?error=' + encodeURIComponent(result.error ?? 'Echec'));
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
          <h1 className="text-2xl font-semibold">Utilisateurs</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Inviter, lister, desactiver. Chaque action est journalisee dans l&apos;audit log.
          </p>
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}
      {infoMessage && (
        <div role="status" className="rounded-md border border-[var(--color-success)] bg-[var(--color-success)]/10 px-3 py-2 text-sm text-[var(--color-success)]">
          {infoMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Inviter un utilisateur</h2>
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          Un email avec lien magique sera envoye. L&apos;utilisateur definira son mot de passe a
          la premiere connexion.
        </p>
        <form action={handleInvite} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            name="name"
            placeholder="Nom complet"
            required
            minLength={2}
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          />
          <input
            name="email"
            type="email"
            placeholder="email@reliancewestafrica.com"
            required
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          />
          <select
            name="entityId"
            required
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="">-- Entite --</option>
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
              Inviter
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Nom / Email</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Roles actifs</th>
              <th className="px-4 py-3 font-medium">Derniere connexion</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name ?? '(sans nom)'}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  {!u.isActive ? (
                    <span className="rounded-full bg-[var(--color-destructive)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-destructive)]">
                      Desactive
                    </span>
                  ) : !u.hashedPassword ? (
                    <span className="rounded-full bg-[var(--color-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                      Invite (mot de passe non defini)
                    </span>
                  ) : !u.emailVerified ? (
                    <span className="rounded-full bg-[var(--color-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                      Email non verifie
                    </span>
                  ) : (
                    <span className="rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
                      Actif
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.memberships.length === 0 ? (
                    <span className="text-xs text-[var(--color-muted-foreground)]">Aucun</span>
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
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Jamais'}
                </td>
                <td className="px-4 py-3">
                  {u.isActive && u.id !== session.user.id && (
                    <form action={handleDeactivate}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="text-xs text-[var(--color-destructive)] hover:underline"
                      >
                        Desactiver
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
