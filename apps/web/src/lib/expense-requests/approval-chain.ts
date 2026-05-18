// =============================================================================
// Approval chain - Calcul dynamique de la chaine d'approbateurs
// =============================================================================
// Source : cadre §5 + §6 + ADR 0002 §2.3.
//
// Regles d'inclusion (sequence en cascade) :
//   - N1 (FINANCE_FIL_N1) toujours requis (sauf FDA au-dessous d'un mini)
//   - N2 (FINANCE_FIL_N2) si montant > seuil filiale OU fournisseur sensible
//   - Groupe (FINANCE_GROUPE) si montant > seuil groupe OU fournisseur
//     strategique
//   - AG si montant > seuil AG OU hors budget OU fournisseur strategique
//
// Logique PURE : prend les seuils + le contexte, renvoie la liste ordonnee
// des slots de signature requis. Aucune I/O.
// =============================================================================

import { RoleCode } from '@reliance-finance/database';

export interface ApprovalChainContext {
  amountInGroupCurrency: number;
  isOutOfBudget: boolean;
  supplierSensitivity: 'STANDARD' | 'SENSITIVE' | 'STRATEGIC' | null;
  supplierIsStrategic: boolean;
}

export interface ResolvedThresholds {
  filialeN2RequiredAbove: number | null;
  groupeRequiredAbove: number | null;
  agRequiredAbove: number | null;
}

export type SignatureStageId =
  | 'VISA_FILIALE_N1'
  | 'VISA_FILIALE_N2'
  | 'VISA_GROUPE'
  | 'AUTHORIZATION_AG';

export interface ApprovalSlot {
  stage: SignatureStageId;
  /** Roles autorises a executer cette signature (au moins un suffit) */
  allowedRoles: RoleCode[];
  /** Raison/explication (pour UI + audit log) */
  reason: string;
  position: number;
}

export function computeApprovalChain(
  ctx: ApprovalChainContext,
  thresholds: ResolvedThresholds,
): ApprovalSlot[] {
  const slots: ApprovalSlot[] = [];
  let position = 1;

  // 1) Visa N1 systematique
  slots.push({
    stage: 'VISA_FILIALE_N1',
    allowedRoles: [RoleCode.FINANCE_FIL_N1, RoleCode.DAF_PAYS],
    reason: 'Visa filiale N1 (controle documentaire + budget)',
    position: position++,
  });

  // 2) Visa N2 si seuil depasse OU fournisseur sensible/strategique
  const aboveN2 =
    thresholds.filialeN2RequiredAbove !== null &&
    ctx.amountInGroupCurrency > thresholds.filialeN2RequiredAbove;
  const sensitiveOrStrategic =
    ctx.supplierSensitivity === 'SENSITIVE' ||
    ctx.supplierSensitivity === 'STRATEGIC' ||
    ctx.supplierIsStrategic;
  if (aboveN2 || sensitiveOrStrategic) {
    const reasons: string[] = [];
    if (aboveN2 && thresholds.filialeN2RequiredAbove !== null) {
      reasons.push('montant > ' + thresholds.filialeN2RequiredAbove);
    }
    if (sensitiveOrStrategic) {
      reasons.push('fournisseur sensible/strategique');
    }
    slots.push({
      stage: 'VISA_FILIALE_N2',
      allowedRoles: [RoleCode.FINANCE_FIL_N2, RoleCode.DAF_PAYS],
      reason: 'Visa filiale N2 (' + reasons.join(' + ') + ')',
      position: position++,
    });
  }

  // 3) Visa Groupe si seuil depasse OU strategique
  const aboveGroupe =
    thresholds.groupeRequiredAbove !== null &&
    ctx.amountInGroupCurrency > thresholds.groupeRequiredAbove;
  if (aboveGroupe || ctx.supplierIsStrategic) {
    const reasons: string[] = [];
    if (aboveGroupe && thresholds.groupeRequiredAbove !== null) {
      reasons.push('montant > ' + thresholds.groupeRequiredAbove);
    }
    if (ctx.supplierIsStrategic) {
      reasons.push('fournisseur strategique');
    }
    slots.push({
      stage: 'VISA_GROUPE',
      allowedRoles: [RoleCode.FINANCE_GROUPE, RoleCode.DFG],
      reason: 'Visa Finance Groupe (' + reasons.join(' + ') + ')',
      position: position++,
    });
  }

  // 4) AG si seuil depasse OU hors budget OU strategique
  const aboveAG =
    thresholds.agRequiredAbove !== null &&
    ctx.amountInGroupCurrency > thresholds.agRequiredAbove;
  if (aboveAG || ctx.isOutOfBudget || ctx.supplierIsStrategic) {
    const reasons: string[] = [];
    if (aboveAG && thresholds.agRequiredAbove !== null) {
      reasons.push('montant > ' + thresholds.agRequiredAbove);
    }
    if (ctx.isOutOfBudget) reasons.push('hors budget');
    if (ctx.supplierIsStrategic) reasons.push('fournisseur strategique');
    slots.push({
      stage: 'AUTHORIZATION_AG',
      allowedRoles: [RoleCode.AG, RoleCode.DFG],
      reason: 'Autorisation AG (' + reasons.join(' + ') + ')',
      position: position++,
    });
  }

  return slots;
}
