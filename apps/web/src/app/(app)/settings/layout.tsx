import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { RoleCode } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const memberships = await getUserMemberships(session.user.id);
  // Acces Settings : ADMIN, DFG, ou AG (cf. docs/rbac-matrix.md)
  requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.AG]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
      <aside className="space-y-1">
        <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Parametres
        </h2>
        <nav className="space-y-1 text-sm">
          <Link
            href="/settings/users"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            Utilisateurs
          </Link>
          <Link
            href="/settings/memberships"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            Roles & entites
          </Link>
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
