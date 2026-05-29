// =============================================================================
// Pont financier - Resolution du referentiel cible (codes -> IDs)
// =============================================================================
// Le contrat reference les entites/projets/centres de cout/fournisseurs PAR CODE
// (decouplage des PK entre apps). Ce module les resout dans le referentiel Finance.
// =============================================================================

import type { FinancialIntent } from '@reliancewestafrica/bridge-contract';
import { prisma } from '@reliance-finance/database';

export interface ResolvedTargets {
  entityId: string;
  entityCode: string;
  defaultCurrency: string;
  projectId: string | null;
  projectCode: string | null;
  costCenterId: string | null;
}

export type ResolveTargetsResult =
  | { ok: true; targets: ResolvedTargets }
  | { ok: false; code: string; message: string; field: string };

export async function resolveTargets(
  target: FinancialIntent['target'],
): Promise<ResolveTargetsResult> {
  const entity = await prisma.entity.findUnique({
    where: { code: target.entityCode },
    select: { id: true, code: true, defaultCurrency: true, isActive: true },
  });
  if (!entity) {
    return {
      ok: false,
      code: 'ENTITY_UNKNOWN',
      message: 'Entite cible introuvable : ' + target.entityCode,
      field: 'target.entityCode',
    };
  }
  if (!entity.isActive) {
    return {
      ok: false,
      code: 'ENTITY_INACTIVE',
      message: 'Entite cible inactive : ' + target.entityCode,
      field: 'target.entityCode',
    };
  }

  let projectId: string | null = null;
  let projectCode: string | null = null;
  if (target.projectCode) {
    const project = await prisma.project.findUnique({
      where: { entityId_code: { entityId: entity.id, code: target.projectCode } },
      select: { id: true, code: true },
    });
    if (!project) {
      return {
        ok: false,
        code: 'PROJECT_UNKNOWN',
        message: 'Projet introuvable pour cette entite : ' + target.projectCode,
        field: 'target.projectCode',
      };
    }
    projectId = project.id;
    projectCode = project.code;
  }

  let costCenterId: string | null = null;
  if (target.costCenterCode) {
    const cc = await prisma.costCenter.findUnique({
      where: { entityId_code: { entityId: entity.id, code: target.costCenterCode } },
      select: { id: true },
    });
    if (!cc) {
      return {
        ok: false,
        code: 'COST_CENTER_UNKNOWN',
        message: 'Centre de cout introuvable : ' + target.costCenterCode,
        field: 'target.costCenterCode',
      };
    }
    costCenterId = cc.id;
  }

  return {
    ok: true,
    targets: {
      entityId: entity.id,
      entityCode: entity.code,
      defaultCurrency: entity.defaultCurrency,
      projectId,
      projectCode,
      costCenterId,
    },
  };
}

export interface ResolvedSupplier {
  supplierId: string | null;
  sensitivity: 'STANDARD' | 'SENSITIVE' | 'STRATEGIC' | null;
  isStrategic: boolean;
}

/**
 * P0 : rapproche un fournisseur EXISTANT par (entite, code). L'onboarding
 * fournisseur depuis le pont (creation + RIB en quarantaine) est une phase
 * ulterieure ; ici, fournisseur inconnu -> supplierId null (conserve dans l'audit).
 */
export async function resolveSupplier(
  entityId: string,
  counterparty: FinancialIntent['counterparty'],
): Promise<ResolvedSupplier> {
  if (!counterparty?.ref) {
    return { supplierId: null, sensitivity: null, isStrategic: false };
  }
  const supplier = await prisma.supplier.findUnique({
    where: { entityId_code: { entityId, code: counterparty.ref } },
    select: { id: true, sensitivity: true, isStrategic: true },
  });
  if (!supplier) {
    return { supplierId: null, sensitivity: null, isStrategic: false };
  }
  return {
    supplierId: supplier.id,
    sensitivity: supplier.sensitivity,
    isStrategic: supplier.isStrategic,
  };
}

export interface ResolvedClient {
  clientId: string | null;
  clientName: string | null;
}

/**
 * P4 (COLLECTION) : rapproche un client EXISTANT par (entite, code). Symetrique
 * a resolveSupplier : l'onboarding client depuis le pont est hors-scope v1 ;
 * client inconnu -> clientId null (le nom reste denormalise sur l'ecriture +
 * conserve dans l'audit). On ne cree jamais le client ici (cf. ADR 0003).
 */
export async function resolveClient(
  entityId: string,
  counterparty: FinancialIntent['counterparty'],
): Promise<ResolvedClient> {
  if (!counterparty?.ref) {
    return { clientId: null, clientName: counterparty?.name ?? null };
  }
  const client = await prisma.client.findUnique({
    where: { entityId_code: { entityId, code: counterparty.ref } },
    select: { id: true, name: true, isActive: true },
  });
  // Client inconnu OU desactive -> non bloquant : clientId null + nom denormalise.
  if (!client || !client.isActive) {
    return { clientId: null, clientName: counterparty.name ?? null };
  }
  return { clientId: client.id, clientName: client.name };
}
