// =============================================================================
// Reception - Determination du prochain signataire
// =============================================================================
// Workflow PV (cadre Modele 4) :
//   DRAFT
//     -> SIGNED_OPS (operationnel/demandeur, != createur si possible)
//     -> SIGNED_TECH (role TECHNIQUE) [optionnel si pas requires technical]
//     -> SIGNED_FINANCE (DAF Pays / Finance Filiale)
//     -> DEFINITIVE | PROVISIONAL | REJECTED
//
// Logique PURE : prend l'etat + roles acteur, retourne canSign + raison.
// =============================================================================

import { ReceptionStatus, RoleCode } from '@reliance-finance/database';

export interface ReceptionSignContext {
  status: ReceptionStatus;
  createdById: string;
  requiresTechnical: boolean;
  // Signatures deja apposees (pour separation)
  opsSignerId: string | null;
  techSignerId: string | null;
  financeSignerId: string | null;
}

export interface SignActor {
  id: string;
  roles: RoleCode[];
}

export type SignStage = 'OPS' | 'TECH' | 'FINANCE';

export type CanSignResult =
  | { canSign: true; stage: SignStage; nextStatus: ReceptionStatus }
  | { canSign: false; reason: string };

const OPS_ROLES: RoleCode[] = [
  RoleCode.DEMANDEUR,
  RoleCode.CHEF_PROJET,
  RoleCode.AP_OFFICER,
  RoleCode.DAF_PAYS,
];
const TECH_ROLES: RoleCode[] = [RoleCode.TECHNIQUE, RoleCode.CHEF_PROJET];
const FINANCE_ROLES: RoleCode[] = [
  RoleCode.FINANCE_FIL_N1,
  RoleCode.FINANCE_FIL_N2,
  RoleCode.DAF_PAYS,
  RoleCode.DFG,
];

function hasAny(roles: RoleCode[], allowed: RoleCode[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

export function canActorSignReception(
  ctx: ReceptionSignContext,
  actor: SignActor,
): CanSignResult {
  // Determine l'etape attendue
  switch (ctx.status) {
    case ReceptionStatus.DRAFT: {
      // Etape OPS attendue
      if (!hasAny(actor.roles, OPS_ROLES)) {
        return {
          canSign: false,
          reason:
            'Signature OPS attendue. Roles autorises : ' + OPS_ROLES.join(', '),
        };
      }
      return {
        canSign: true,
        stage: 'OPS',
        nextStatus: ctx.requiresTechnical
          ? ReceptionStatus.SIGNED_OPS
          : ReceptionStatus.SIGNED_TECH, // skip TECH si non requis
      };
    }
    case ReceptionStatus.SIGNED_OPS: {
      // Etape TECH attendue
      if (!ctx.requiresTechnical) {
        // Devrait deja etre passe a SIGNED_TECH, mais safeguard
        return {
          canSign: false,
          reason: 'Signature technique non requise pour cette reception',
        };
      }
      if (!hasAny(actor.roles, TECH_ROLES)) {
        return {
          canSign: false,
          reason:
            'Signature TECHNIQUE attendue. Roles autorises : ' + TECH_ROLES.join(', '),
        };
      }
      // Separation : tech != ops
      if (ctx.opsSignerId && ctx.opsSignerId === actor.id) {
        return {
          canSign: false,
          reason:
            'Le signataire OPS ne peut pas signer TECH sur le meme PV (separation §12)',
        };
      }
      return {
        canSign: true,
        stage: 'TECH',
        nextStatus: ReceptionStatus.SIGNED_TECH,
      };
    }
    case ReceptionStatus.SIGNED_TECH: {
      // Etape FINANCE
      if (!hasAny(actor.roles, FINANCE_ROLES)) {
        return {
          canSign: false,
          reason:
            'Visa FINANCE attendu. Roles autorises : ' + FINANCE_ROLES.join(', '),
        };
      }
      // Separation : finance != ops != tech
      if (ctx.opsSignerId && ctx.opsSignerId === actor.id) {
        return {
          canSign: false,
          reason: 'Le signataire OPS ne peut pas viser FINANCE (separation §12)',
        };
      }
      if (ctx.techSignerId && ctx.techSignerId === actor.id) {
        return {
          canSign: false,
          reason: 'Le signataire TECH ne peut pas viser FINANCE (separation §12)',
        };
      }
      return {
        canSign: true,
        stage: 'FINANCE',
        nextStatus: ReceptionStatus.SIGNED_FINANCE,
      };
    }
    default:
      return {
        canSign: false,
        reason: 'Aucune signature attendue (statut ' + ctx.status + ')',
      };
  }
}
