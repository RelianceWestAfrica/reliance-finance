// =============================================================================
// Accounting - Verification de cloture de periode (pure)
// =============================================================================
// "La cloture d'une periode empeche toute modification retroactive" (acceptance)
// =============================================================================

export interface PeriodSnapshot {
  entityId: string;
  year: number;
  month: number;
  isClosed: boolean;
}

export interface PeriodLockResult {
  locked: boolean;
  reason?: string;
}

/**
 * Renvoie locked=true si la date d'ecriture tombe dans une periode close.
 * Pure : prend l'array des periodes (deja queriees) + la date a verifier.
 */
export function isEntryInClosedPeriod(
  entityId: string,
  entryDate: Date,
  periods: PeriodSnapshot[],
): PeriodLockResult {
  const year = entryDate.getUTCFullYear();
  const month = entryDate.getUTCMonth() + 1;

  const matching = periods.find(
    (p) => p.entityId === entityId && p.year === year && p.month === month,
  );

  if (!matching) {
    return { locked: false };
  }
  if (matching.isClosed) {
    return {
      locked: true,
      reason:
        'Periode ' +
        year +
        '-' +
        String(month).padStart(2, '0') +
        ' est cloturee pour l\'entite ' +
        entityId +
        '. Aucune ecriture posterieure autorisee.',
    };
  }
  return { locked: false };
}

/**
 * Cas particulier : verifier qu'une date < derniere periode close.
 * Utile pour empecher la creation d'ecritures dans une periode "future
 * passee" non encore ouverte (ex: si on a cloture janvier mais pas
 * ouvert decembre precedent).
 */
export function isEntryBeforeOldestClosedPeriod(
  entityId: string,
  entryDate: Date,
  periods: PeriodSnapshot[],
): PeriodLockResult {
  const closed = periods
    .filter((p) => p.entityId === entityId && p.isClosed)
    .sort((a, b) => a.year - b.year || a.month - b.month);

  if (closed.length === 0) return { locked: false };

  const oldest = closed[0];
  if (!oldest) return { locked: false };

  const year = entryDate.getUTCFullYear();
  const month = entryDate.getUTCMonth() + 1;

  if (year < oldest.year || (year === oldest.year && month < oldest.month)) {
    return {
      locked: true,
      reason:
        'Ecriture avant la plus ancienne periode close (' +
        oldest.year +
        '-' +
        String(oldest.month).padStart(2, '0') +
        '). Reouvrir la periode requise avant insertion.',
    };
  }
  return { locked: false };
}
