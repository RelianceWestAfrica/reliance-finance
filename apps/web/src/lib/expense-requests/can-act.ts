// =============================================================================
// Can act - Determine si un utilisateur peut signer la prochaine etape
// =============================================================================
// Croise :
//   - Les slots de la chaine d'approbation (cf. approval-chain.ts)
//   - Les signatures deja apposees
//   - Les roles de l'acteur
//   - La separation des fonctions (cf. ADR 0002 §2.4)
//
// Logique PURE.
// =============================================================================

import { RoleCode } from '@reliance-finance/database';

import type { ApprovalSlot, SignatureStageId } from './approval-chain.js';

export interface ExistingSignature {
  stage: SignatureStageId;
  actorId: string;
}

export interface ActOnContext {
  approvalChain: ApprovalSlot[];
  existingSignatures: ExistingSignature[];
  /** ID du createur du dossier (demandeur) - ne peut pas valider sa propre demande */
  requesterId: string;
}

export interface Actor {
  id: string;
  roles: RoleCode[];
}

export type CanActResult =
  | { canAct: true; slot: ApprovalSlot }
  | { canAct: false; reason: string };

/**
 * Renvoie le PROCHAIN slot a signer (le premier dans la chaine sans signature
 * existante), ou null si tout est signe.
 */
export function nextPendingSlot(
  chain: ApprovalSlot[],
  existing: ExistingSignature[],
): ApprovalSlot | null {
  const signed = new Set(existing.map((s) => s.stage));
  for (const slot of chain) {
    if (!signed.has(slot.stage)) return slot;
  }
  return null;
}

/**
 * Verifie si l'acteur peut signer la prochaine etape. Applique :
 *   - Existence d'un slot pending
 *   - Acteur != demandeur
 *   - Role de l'acteur ∈ slot.allowedRoles
 *   - Acteur n'a deja signe AUCUN slot precedent (separation des fonctions)
 */
export function canActorSignNext(ctx: ActOnContext, actor: Actor): CanActResult {
  const next = nextPendingSlot(ctx.approvalChain, ctx.existingSignatures);
  if (!next) {
    return { canAct: false, reason: 'Toutes les signatures ont deja ete recueillies' };
  }

  // Separation des fonctions : demandeur ne peut pas signer
  if (actor.id === ctx.requesterId) {
    return {
      canAct: false,
      reason:
        'Le demandeur ne peut pas valider sa propre demande (separation des fonctions §12)',
    };
  }

  // Role
  const hasAllowedRole = next.allowedRoles.some((r) => actor.roles.includes(r));
  if (!hasAllowedRole) {
    return {
      canAct: false,
      reason:
        'Role requis pour ' +
        next.stage +
        ' : ' +
        next.allowedRoles.join(' ou '),
    };
  }

  // Separation : pas deja signe une autre etape du meme dossier
  const alreadySignedByActor = ctx.existingSignatures.some((s) => s.actorId === actor.id);
  if (alreadySignedByActor) {
    return {
      canAct: false,
      reason:
        'Acteur a deja signe une autre etape de ce dossier - separation des fonctions interdit',
    };
  }

  return { canAct: true, slot: next };
}
