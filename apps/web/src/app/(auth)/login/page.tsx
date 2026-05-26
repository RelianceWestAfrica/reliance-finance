import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth, signIn, localLoginEnabled } from '@/lib/auth';
import { KeycloakSso } from './keycloak-sso';

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  const searchParams = await props.searchParams;
  const callbackUrl = searchParams.callbackUrl ?? '/dashboard';
  const t = await getTranslations('login');

  const errorMessage =
    searchParams.error === 'CredentialsSignin'
      ? t('errors.credentials')
      : searchParams.error === 'AccountDisabled'
        ? t('errors.accountDisabled')
        : searchParams.error
          ? t('errors.generic', { code: searchParams.error })
          : null;

  // Fonctionnement normal : aucune saisie locale, redirection automatique vers
  // le portail RWA Core (sauf si une erreur SSO est présente — anti-boucle).
  if (!localLoginEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
        <div className="w-full max-w-md space-y-6 rounded-lg border bg-[var(--color-card)] p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
              {t('appName')}
            </h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">{t('ssoIntro')}</p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
            >
              {errorMessage}
            </div>
          )}

          <KeycloakSso callbackUrl={callbackUrl} auto={!errorMessage} />

          <p className="text-center text-xs text-[var(--color-muted-foreground)]">{t('footer')}</p>
        </div>
      </main>
    );
  }

  // Mode secours (LOCAL_LOGIN_ENABLED=true) : connexion locale email/mot de passe.
  async function loginWithPassword(formData: FormData) {
    'use server';
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: callbackUrl,
    });
  }

  async function loginWithMagicLink(formData: FormData) {
    'use server';
    await signIn('nodemailer', {
      email: String(formData.get('email') ?? ''),
      redirectTo: callbackUrl,
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-[var(--color-card)] p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
            {t('appName')}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('localIntro')}</p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
          >
            {errorMessage}
          </div>
        )}

        <form action={loginWithPassword} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium">
              {t('emailLabel')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-md border border-[var(--color-input)] bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium">
              {t('passwordLabel')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="w-full rounded-md border border-[var(--color-input)] bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-2"
          >
            {t('signIn')}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[var(--color-card)] px-2 text-[var(--color-muted-foreground)]">
              {t('orSeparator')}
            </span>
          </div>
        </div>

        <form action={loginWithMagicLink} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="magic-email" className="block text-sm font-medium">
              {t('magicLinkLabel')}
            </label>
            <input
              id="magic-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-[var(--color-input)] bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-foreground)] shadow-sm transition hover:bg-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-2"
          >
            {t('magicLinkSubmit')}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--color-muted-foreground)]">{t('footer')}</p>
      </div>
    </main>
  );
}
