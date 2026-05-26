import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { prisma } from '@reliance-finance/database';
import { setPasswordAction } from './actions';

export default async function SetPasswordPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hashedPassword: true, email: true, name: true },
  });
  if (!user) {
    redirect('/login');
  }

  const isFirstTime = !user.hashedPassword;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  async function handleSubmit(formData: FormData) {
    'use server';
    const result = await setPasswordAction(formData);
    if (!result.ok) {
      redirect('/set-password?error=' + encodeURIComponent(result.error));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-[var(--color-card)] p-8 shadow-sm">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isFirstTime ? 'Definir votre mot de passe' : 'Changer le mot de passe'}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Compte : <span className="font-mono">{user.email}</span>
          </p>
          {isFirstTime && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Premiere connexion. Vous devez definir un mot de passe avant d&apos;acceder a la
              plateforme.
            </p>
          )}
        </header>

        {errorMessage && (
          <div
            role="alert"
            className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
          >
            {errorMessage}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium">
              Nouveau mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              className="w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              12 caracteres minimum, avec majuscule, minuscule et chiffre.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm" className="block text-sm font-medium">
              Confirmer
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              className="w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            Enregistrer
          </button>
        </form>
      </div>
    </main>
  );
}
