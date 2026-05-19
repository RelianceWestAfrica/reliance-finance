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
  'UTC',
] as const;

export const ALLOWED_LOCALES = ['fr-FR', 'en-US', 'fr-CI'] as const;
