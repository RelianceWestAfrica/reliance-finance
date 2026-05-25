import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserMemberships } from '@/lib/rbac';
import { prisma } from '@reliance-finance/database';
import { AppSidebar, MobileNav } from '@/components/app-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Force le setup du mot de passe si premiere connexion (post-invitation)
  const userState = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hashedPassword: true, isActive: true },
  });
  if (!userState?.isActive) {
    redirect('/login?error=AccountDisabled');
  }
  if (!userState.hashedPassword) {
    redirect('/set-password');
  }

  const memberships = await getUserMemberships(session.user.id);

  const userLabel = session.user.name ?? session.user.email ?? 'Utilisateur';
  const roleLabel =
    memberships.length > 0
      ? memberships
          .slice(0, 2)
          .map((m) => m.role + ' · ' + m.entityCode)
          .join('  /  ')
      : 'Aucun rôle actif';

  const logoutHref = '/api/auth/sso-logout';

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <MobileNav logoutAction={logoutHref} />
      <div className="md:grid md:grid-cols-[260px_1fr]">
        <AppSidebar userLabel={userLabel} roleLabel={roleLabel} logoutAction={logoutHref} />
        <div className="min-w-0">
          <main className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-9 md:py-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
