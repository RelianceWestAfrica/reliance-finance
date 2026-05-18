import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { getUserMemberships } from '@/lib/rbac';
import { prisma } from '@reliance-finance/database';

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

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="border-b bg-[var(--color-card)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">
              Reliance Finance
            </span>
            <nav className="hidden gap-4 text-sm text-[var(--color-muted-foreground)] sm:flex">
              <a href="/dashboard" className="hover:text-[var(--color-foreground)]">
                Tableau de bord
              </a>
              <span className="cursor-not-allowed opacity-50" title="Disponible en session M4">
                Demandes
              </span>
              <span className="cursor-not-allowed opacity-50" title="Disponible en session M6">
                BC
              </span>
              <span className="cursor-not-allowed opacity-50" title="Disponible en session M8">
                Factures
              </span>
              <span className="cursor-not-allowed opacity-50" title="Disponible en session M10">
                Paiements
              </span>
              <a href="/audit" className="hover:text-[var(--color-foreground)]">
                Audit
              </a>
              <a href="/settings/users" className="hover:text-[var(--color-foreground)]">
                Parametres
              </a>
              <a href="/profile" className="hover:text-[var(--color-foreground)]">
                Profil
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <div className="font-medium">{session.user.name ?? session.user.email}</div>
              <div className="text-xs text-[var(--color-muted-foreground)]">
                {memberships.length > 0
                  ? memberships
                      .slice(0, 2)
                      .map((m) => m.role + ' / ' + m.entityCode)
                      .join(' - ')
                  : 'Aucun role actif'}
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--color-muted)]"
              >
                Deconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
