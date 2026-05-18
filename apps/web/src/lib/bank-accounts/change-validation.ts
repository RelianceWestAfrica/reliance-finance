// =============================================================================
// Bank account change request - Regles de validation
// =============================================================================
// Workflow strict (cadre §8) :
//   1. REQUESTED : un AP Officer / DAF Pays demande
//   2. DUAL_VALIDATION_PENDING : N1 a vise (DAF Pays ou Finance Filiale N1)
//   3. QUARANTINE : N2 a vise (Finance Groupe ou DFG)
//   4. ACTIVE : apres 24h de quarantaine, RIB utilisable
//
// Separation des fonctions :
//   - Le demandeur ne peut pas valider
//   - L'approbateur N1 ne peut pas etre l'approbateur N2
//   - Les 3 acteurs (demandeur, N1, N2) doivent etre DISTINCTS
//
// Logique pure (sans I/O) : utilisable dans Server Actions + testable en
// isolation.
// =============================================================================

import { RoleCode, BankAccountChangeStatus } from '@reliance-finance/database';

import type { MembershipSummary } from '@/lib/rbac';
import { hasAnyRole } from '@/lib/rbac';

export interface ChangeContext {
  status: BankAccountChangeStatus;
  requestedById: string;
  approvedBy1Id: string | null;
  approvedBy2Id: string | null;
}

export interface ActorContext {
  id: string;
  memberships: MembershipSummary[];
}

export type CanApproveResult = { ok: true } | { ok: false; reason: string };

/** Roles autorises a valider en N1 (cadre §8 + §3) */
export const N1_ROLES: RoleCode[] = [
  RoleCode.DAF_PAYS,
  RoleCode.FINANCE_FIL_N1,
  RoleCode.FINANCE_FIL_N2,
];

/** Roles autorises a valider en N2 (cadre §8 - validation Finance Groupe) */
export const N2_ROLES: RoleCode[] = [
  RoleCode.FINANCE_GROUPE,
  RoleCode.DFG,
  RoleCode.CONTROLEUR_GROUPE,
  RoleCode.TRESORIER_GROUPE,
];

export function canApproveLevel1(
  change: ChangeContext,
  actor: ActorContext,
): CanApproveResult {
  if (change.status !== BankAccountChangeStatus.REQUESTED) {
    return {
      ok: false,
      reason: 'Le changement n\'est pas en attente de N1 (statut : ' + change.status + ')',
    };
  }
  if (change.requestedById === actor.id) {
    return {
      ok: false,
      reason: 'Le demandeur ne peut pas valider sa propre demande (separation des fonctions §8)',
    };
  }
  if (!hasAnyRole(actor.memberships, N1_ROLES)) {
    return {
      ok: false,
      reason:
        'Role insuffisant pour validation N1. Requis : ' + N1_ROLES.join(', '),
    };
  }
  return { ok: true };
}

export function canApproveLevel2(
  change: ChangeContext,
  actor: ActorContext,
): CanApproveResult {
  if (change.status !== BankAccountChangeStatus.DUAL_VALIDATION_PENDING) {
    return {
      ok: false,
      reason: 'Le changement n\'est pas en attente de N2 (statut : ' + change.status + ')',
    };
  }
  if (change.requestedById === actor.id) {
    return {
      ok: false,
      reason: 'Le demandeur ne peut pas valider en N2',
    };
  }
  if (change.approvedBy1Id === actor.id) {
    return {
      ok: false,
      reason: 'L\'approbateur N1 ne peut pas valider en N2 (separation des fonctions §8)',
    };
  }
  if (!hasAnyRole(actor.memberships, N2_ROLES)) {
    return {
      ok: false,
      reason:
        'Role insuffisant pour validation N2. Requis : ' + N2_ROLES.join(', '),
    };
  }
  return { ok: true };
}

/**
 * Apres N2, le RIB entre en QUARANTAINE 24h. Calcul de la date de fin.
 */
export function computeQuarantineUntil(
  approvedAt: Date,
  quarantineHours: number,
): Date {
  return new Date(approvedAt.getTime() + quarantineHours * 3600 * 1000);
}
