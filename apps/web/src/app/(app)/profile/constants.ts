// =============================================================================
// Constantes profile - extraites d'actions.ts pour respecter la regle
// Next.js 15 strict : un fichier "use server" ne peut exporter que des async
// functions (pas des objets/arrays/types).
// =============================================================================

export const ALLOWED_TIMEZONES = [
  'Africa/Lome',
  'Africa/Abidjan',
  'Africa/Dakar',
  'Africa/Bamako',
  'Africa/Cotonou',
  'Africa/Ouagadougou',
  'Africa/Niamey',
  'Africa/Conakry',
  'Africa/Nouakchott',
  'Africa/Douala',
  'Africa/Libreville',
  'Africa/Brazzaville',
  'Africa/Kinshasa',
  'Europe/Paris',
  'Asia/Hong_Kong',
  'UTC',
] as const;

// fr-CI conservé pour compat des comptes existants en base; les locales
// activables côté UI sont définies dans src/i18n/locales.ts.
export const ALLOWED_LOCALES = ['fr-FR', 'en-US', 'fr-CI', 'zh-CN'] as const;
