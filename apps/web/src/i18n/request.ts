// =============================================================================
// Configuration next-intl côté serveur — résolution de la locale active sans
// segment d'URL `/[locale]/`. Ordre de priorité :
//   1. Cookie NEXT_LOCALE (posé par la server action profil après changement)
//   2. User.preferredLocale (Prisma, si la session existe)
//   3. DEFAULT_LOCALE (fr-FR)
// =============================================================================

import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE, type Locale } from './locales';

async function resolveLocaleFromSessionUser(): Promise<Locale | null> {
  try {
    // Imports dynamiques pour éviter de charger Prisma / Auth dans des contextes
    // edge (le getRequestConfig est appelé depuis le middleware/SSR Node).
    const { auth } = await import('@/lib/auth');
    const session = await auth();
    if (!session?.user?.id) return null;
    const { prisma } = await import('@reliance-finance/database');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredLocale: true },
    });
    if (user?.preferredLocale && isSupportedLocale(user.preferredLocale)) {
      return user.preferredLocale;
    }
    return null;
  } catch {
    return null;
  }
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale = DEFAULT_LOCALE;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const userLocale = await resolveLocaleFromSessionUser();
    if (userLocale) locale = userLocale;
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
