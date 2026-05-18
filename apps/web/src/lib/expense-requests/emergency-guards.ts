// =============================================================================
// Emergency expense - Garde des 4 conditions cumulatives (cadre §7)
// =============================================================================
// "Autorisee uniquement si les 4 conditions sont reunies :
//   1. risque d'arret chantier / HSE / risque legal immediat
//   2. montant limite (plafond a fixer)
//   3. trace ecrite (FD Urgence + motif + validation exceptionnelle)
//   4. regularisation complete du dossier dans un delai max de 72h / 5j ouvres"
//
// Logique PURE : verifie le contexte, renvoie OK ou liste des violations.
// =============================================================================

export interface EmergencyContext {
  /** Le demandeur a confirme un risque chantier/HSE/legal immediat */
  hasImminentRisk: boolean;
  /** Type de risque pour audit */
  riskType: 'CHANTIER' | 'HSE' | 'LEGAL' | null;
  /** Justification ecrite du risque (champ libre, validation longueur) */
  riskJustification: string;
  /** Montant en devise Groupe */
  amountInGroupCurrency: number;
  /** Engagement explicite de regularisation sous 72h (cocher dans le formulaire) */
  commitsToRegularization: boolean;
}

export interface EmergencyThresholds {
  /** Plafond procedure urgence (ex: 10 000 000 FCFA) */
  maxAmount: number;
  /** Delai max en heures (ex: 72h) */
  maxRegularizationHours: number;
}

export type EmergencyCheckResult =
  | { ok: true; deadlineHours: number }
  | { ok: false; violations: string[] };

export function checkEmergencyConditions(
  ctx: EmergencyContext,
  thresholds: EmergencyThresholds,
): EmergencyCheckResult {
  const violations: string[] = [];

  // Condition 1 : risque imminent
  if (!ctx.hasImminentRisk) {
    violations.push(
      'Condition 1 manquante : un risque imminent (chantier/HSE/legal) doit etre confirme',
    );
  } else if (!ctx.riskType) {
    violations.push(
      'Condition 1 incomplete : type de risque a preciser (CHANTIER / HSE / LEGAL)',
    );
  }

  // Condition 1 bis : justification ecrite suffisante
  if (ctx.riskJustification.trim().length < 30) {
    violations.push(
      'Condition 1 incomplete : justification ecrite < 30 caracteres (cadre §7 trace ecrite)',
    );
  }

  // Condition 2 : plafond
  if (ctx.amountInGroupCurrency > thresholds.maxAmount) {
    violations.push(
      'Condition 2 violee : montant ' +
        ctx.amountInGroupCurrency +
        ' depasse le plafond urgence (' +
        thresholds.maxAmount +
        ')',
    );
  }

  // Condition 3 : trace ecrite = implicite (FD Urgence + champs remplis)
  // -> couvert par les autres validations

  // Condition 4 : engagement regularisation
  if (!ctx.commitsToRegularization) {
    violations.push(
      'Condition 4 manquante : engagement explicite de regularisation sous ' +
        thresholds.maxRegularizationHours +
        'h obligatoire',
    );
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true, deadlineHours: thresholds.maxRegularizationHours };
}

/**
 * Calcule la date limite de regularisation a partir de l'instant d'approbation.
 */
export function computeRegularizationDeadline(approvedAt: Date, hours: number): Date {
  return new Date(approvedAt.getTime() + hours * 3600 * 1000);
}

/**
 * Detecte si un dossier urgence non regularise depasse son SLA.
 * Logique pure pour le job cron `detectStaleRegularizations`.
 */
export function isStaleRegularization(
  emergencyDeadlineAt: Date | null,
  regularizedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!emergencyDeadlineAt) return false;
  if (regularizedAt) return false;
  return now > emergencyDeadlineAt;
}
