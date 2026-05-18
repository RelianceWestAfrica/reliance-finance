import { prisma } from '@reliance-finance/database';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { ALLOWED_TIMEZONES, ALLOWED_LOCALES, updatePreferences } from './actions';

export default async function ProfilePage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      preferredTimezone: true,
      preferredLocale: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
      memberships: {
        where: { isActive: true },
        include: { entity: { select: { code: true, name: true, kind: true } } },
      },
    },
  });
  if (!user) redirect('/login');

  async function handleUpdate(formData: FormData) {
    'use server';
    const r = await updatePreferences(formData);
    if (!r.ok) {
      redirect('/profile?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Mon profil</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Preferences personnelles. Vos roles sont geres par l&apos;administrateur.
        </p>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Compte</h2>
        <dl className="mt-3 grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
          <dt className="text-[var(--color-muted-foreground)]">Email</dt>
          <dd className="font-mono">{user.email}</dd>
          <dt className="text-[var(--color-muted-foreground)]">Email verifie</dt>
          <dd>{user.emailVerified ? 'Oui' : 'Non'}</dd>
          <dt className="text-[var(--color-muted-foreground)]">Cree le</dt>
          <dd>{user.createdAt.toISOString().slice(0, 10)}</dd>
          <dt className="text-[var(--color-muted-foreground)]">Derniere connexion</dt>
          <dd>{user.lastLoginAt ? user.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : 'Jamais'}</dd>
        </dl>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <form action={handleUpdate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Nom affiche
            <input
              name="name"
              defaultValue={user.name ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <div /> {/* spacer */}
          <label className="text-sm">
            Fuseau horaire d&apos;affichage
            <select
              name="preferredTimezone"
              defaultValue={user.preferredTimezone}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {ALLOWED_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Locale (formats nombres / dates)
            <select
              name="preferredLocale"
              defaultValue={user.preferredLocale}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {ALLOWED_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2"
          >
            Enregistrer
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Mes roles</h2>
        {user.memberships.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Aucun role actif. Contactez votre administrateur.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {user.memberships.map((m, i) => (
              <li key={i} className="flex justify-between">
                <span className="font-mono">{m.role}</span>
                <span className="text-[var(--color-muted-foreground)]">
                  {m.entity.code} - {m.entity.name} ({m.entity.kind})
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
          <a href="/set-password" className="text-[var(--color-primary)] hover:underline">
            Changer mon mot de passe
          </a>
        </p>
      </section>
    </div>
  );
}
