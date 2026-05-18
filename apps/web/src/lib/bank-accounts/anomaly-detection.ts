// =============================================================================
// Bank account - Detection d'anomalies sur changements RIB
// =============================================================================
// Regles (cadre §13 KPI "anomalies fournisseurs") :
//   - Plus de N changements RIB en M jours pour un meme fournisseur
//   - Changement RIB immediat apres creation du fournisseur (< 7 jours)
//   - Changement RIB d'un fournisseur strategique sans documentation
//
// Logique pure : prend les changements existants en entree, decide. Le caller
// (Server Action d'approbation N2) declenche l'analyse et cree une `Anomaly`.
// =============================================================================

export interface ChangeHistoryEntry {
  id: string;
  status: 'ACTIVE' | string;
  createdAt: Date;
}

export interface SupplierContext {
  isStrategic: boolean;
  createdAt: Date;
  sensitivity: 'STANDARD' | 'SENSITIVE' | 'STRATEGIC';
}

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AnomalyVerdict =
  | { suspicious: false }
  | {
      suspicious: true;
      severity: Severity;
      reasons: string[];
    };

export interface DetectionConfig {
  /** Periode de fenetre pour compter les changements recurrents (jours) */
  windowDays: number;
  /** Nombre de changements ACTIVE dans la fenetre au-dessus duquel on alerte */
  maxChangesInWindow: number;
  /** Jours minimum entre creation fournisseur et 1er changement RIB sans alerte */
  minDaysSinceSupplierCreation: number;
}

export const DEFAULT_CONFIG: DetectionConfig = {
  windowDays: 30,
  maxChangesInWindow: 2,
  minDaysSinceSupplierCreation: 7,
};

const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function detectSuspiciousRibChange(
  supplier: SupplierContext,
  changesActiveInHistory: ChangeHistoryEntry[],
  now: Date = new Date(),
  config: DetectionConfig = DEFAULT_CONFIG,
): AnomalyVerdict {
  const reasons: string[] = [];
  let severity: Severity = 'LOW';

  // Regle 1 : trop de changements recents
  const windowStart = new Date(now.getTime() - config.windowDays * 24 * 3600 * 1000);
  const recent = changesActiveInHistory.filter(
    (c) => c.createdAt >= windowStart && c.status === 'ACTIVE',
  );
  if (recent.length >= config.maxChangesInWindow) {
    reasons.push(
      recent.length +
        ' changements RIB en ' +
        config.windowDays +
        ' jours (seuil : ' +
        config.maxChangesInWindow +
        ')',
    );
    severity = maxSeverity(severity, 'HIGH');
  }

  // Regle 2 : changement immediat apres creation
  const daysSinceCreation =
    (now.getTime() - supplier.createdAt.getTime()) / (24 * 3600 * 1000);
  const hasInitialChange = changesActiveInHistory.length > 0;
  if (hasInitialChange && daysSinceCreation < config.minDaysSinceSupplierCreation) {
    reasons.push(
      'Changement RIB ' +
        Math.floor(daysSinceCreation) +
        ' jour(s) apres creation du fournisseur (seuil : ' +
        config.minDaysSinceSupplierCreation +
        ' jours)',
    );
    severity = maxSeverity(severity, 'MEDIUM');
  }

  // Regle 3 : fournisseur strategique / sensible amplifie la severite
  if (supplier.isStrategic || supplier.sensitivity === 'STRATEGIC') {
    if (reasons.length > 0) {
      reasons.push(
        'Fournisseur ' +
          (supplier.isStrategic ? 'strategique' : supplier.sensitivity) +
          ' - controle renforce requis',
      );
      severity = 'CRITICAL';
    }
  }

  if (reasons.length === 0) return { suspicious: false };
  return { suspicious: true, severity, reasons };
}
