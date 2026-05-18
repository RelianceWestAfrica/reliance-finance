// =============================================================================
// Cash forecast - Mathematiques de semaines (pure)
// =============================================================================
// Convention : semaine commence le lundi 00:00:00 UTC, finit le dimanche
// 23:59:59 UTC. Index 0 = semaine courante, +1 = suivante, ...
// =============================================================================

/**
 * Renvoie le lundi 00:00:00 UTC de la semaine contenant `date`.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // 0=Sunday, 1=Monday, ... 6=Saturday. On veut Monday=0 pour l'arithmetique
  const dayOfWeek = d.getUTCDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

/**
 * Renvoie le dimanche 23:59:59.999 UTC de la semaine contenant `date`.
 */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Renvoie les N debuts de semaine consecutifs a partir de `from` (inclus).
 */
export function nextNWeekStarts(from: Date, n: number): Date[] {
  const starts: Date[] = [];
  const first = getWeekStart(from);
  for (let i = 0; i < n; i++) {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i * 7);
    starts.push(d);
  }
  return starts;
}

/**
 * Label court pour affichage : "S20 (12 mai)".
 */
export function weekLabel(weekStart: Date): string {
  const isoWeek = getIsoWeekNumber(weekStart);
  const day = weekStart.getUTCDate();
  const monthNames = [
    'jan',
    'fev',
    'mar',
    'avr',
    'mai',
    'jun',
    'jul',
    'aou',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const month = monthNames[weekStart.getUTCMonth()];
  return 'S' + isoWeek + ' (' + day + ' ' + month + ')';
}

/**
 * Numero de semaine ISO 8601.
 */
export function getIsoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
