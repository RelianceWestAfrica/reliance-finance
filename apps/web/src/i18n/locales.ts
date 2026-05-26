// =============================================================================
// Locales supportées par l'app — source unique pour next-intl + Prisma.
// Pas de routing /[locale]/ ; la locale est lue dans le cookie NEXT_LOCALE
// (alimenté par la server action de profil) puis fallback sur User.preferredLocale.
// =============================================================================

export const LOCALES = ['fr-FR', 'en-US', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr-FR';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

// Mapping pour l'attribut <html lang="..."> (les valeurs BCP-47 conviennent).
export function htmlLang(locale: Locale): string {
  return locale;
}
