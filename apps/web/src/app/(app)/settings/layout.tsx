import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { RoleCode } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const memberships = await getUserMemberships(session.user.id);
  // Acces Settings : ADMIN, DFG, ou AG (cf. docs/rbac-matrix.md)
  requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.AG]);

  const t = await getTranslations('pages.settings.sidebar');

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
      <aside className="space-y-1">
        <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {t('heading')}
        </h2>
        <nav className="space-y-1 text-sm">
          <Link
            href="/settings/users"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            {t('users')}
          </Link>
          <Link
            href="/settings/memberships"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            {t('memberships')}
          </Link>
          <Link
            href="/settings/entities"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            {t('entities')}
          </Link>
          <Link
            href="/settings/projects"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            {t('projects')}
          </Link>
          <Link
            href="/settings/thresholds"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            {t('thresholds')}
          </Link>
          <Link
            href="/settings/chart-accounts"
            className="block rounded-md px-3 py-2 hover:bg-[var(--color-muted)]"
          >
            {t('chartAccounts')}
          </Link>
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
