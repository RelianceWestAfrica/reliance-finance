import { prisma } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';

import { auth, signOut } from '@/lib/auth';
import { updatePreferences } from './actions';
import { ALLOWED_TIMEZONES } from './constants';
import { ProfileView } from './profile-view';

export default async function ProfilePage(props: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      image: true,
      isActive: true,
      preferredTimezone: true,
      preferredLocale: true,
      lastLoginAt: true,
      memberships: {
        where: { isActive: true },
        include: { entity: { select: { code: true, name: true, kind: true } } },
      },
    },
  });
  if (!user) redirect('/login');

  const t = await getTranslations('profile');
  const locale = await getLocale();

  const parts = (user.name ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');
  const top = user.memberships[0];
  const roleLabel = top ? `${top.role} · ${top.entity.code}` : t('card.noRole');
  const lastLogin = user.lastLoginAt
    ? user.lastLoginAt.toLocaleString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : t('card.lastLoginNever');

  async function handleUpdate(formData: FormData) {
    'use server';
    const r = await updatePreferences(formData);
    if (!r.ok) {
      redirect('/profile?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[10px] border border-[var(--color-destructive)] bg-[var(--color-destructive-soft)] px-3 py-2 text-sm text-[var(--color-destructive)]"
        >
          {errorMessage}
        </div>
      )}

      <ProfileView
        firstName={firstName}
        lastName={lastName}
        name={user.name?.trim() || user.email}
        email={user.email}
        image={user.image}
        roleLabel={roleLabel}
        lastLogin={lastLogin}
        isActive={user.isActive}
        preferredTimezone={user.preferredTimezone}
        preferredLocale={user.preferredLocale}
        timezones={ALLOWED_TIMEZONES}
        changePasswordHref="/set-password"
        updateAction={handleUpdate}
        logoutAction={logoutAction}
      />
    </div>
  );
}
