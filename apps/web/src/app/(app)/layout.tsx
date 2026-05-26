import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth, signOut } from '@/lib/auth';
import { getUserMemberships } from '@/lib/rbac';
import { prisma } from '@reliance-finance/database';
import { AppSidebar, MobileNav } from '@/components/app-nav';
import { AppHeader } from '@/components/app-header';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Force le setup du mot de passe si premiere connexion (post-invitation)
  const userState = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hashedPassword: true, isActive: true, name: true },
  });
  if (!userState?.isActive) {
    redirect('/login?error=AccountDisabled');
  }
  if (!userState.hashedPassword) {
    redirect('/set-password');
  }

  const memberships = await getUserMemberships(session.user.id);
  const tProfile = await getTranslations('profile.card');

  // Carte utilisateur : prénom + nom (depuis la base), pas l'email.
  const userLabel = userState.name?.trim() || session.user.name || 'Utilisateur';
  const roleLabel =
    memberships.length > 0
      ? memberships
          .slice(0, 2)
          .map((m) => m.role + ' · ' + m.entityCode)
          .join('  /  ')
      : tProfile('noRole');

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <MobileNav logoutAction={logoutAction} />
      <div className="md:grid md:grid-cols-[260px_1fr]">
        <AppSidebar userLabel={userLabel} roleLabel={roleLabel} logoutAction={logoutAction} />
        <div className="min-w-0">
          <AppHeader />
          <main className="w-full px-5 pb-8 pt-2 md:px-9 md:pb-10 md:pt-3">{children}</main>
        </div>
      </div>
    </div>
  );
}
