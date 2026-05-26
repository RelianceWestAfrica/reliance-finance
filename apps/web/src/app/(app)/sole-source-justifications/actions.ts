'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, DocumentType, RoleCode, SoleSourceReason } from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { allocateReference } from '@/lib/document-sequence/allocate';

const createSchema = z.object({
  expenseRequestId: z.string().cuid(),
  reason: z.nativeEnum(SoleSourceReason),
  otherReason: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  estimatedAmount: z.coerce.number().positive(),
  currency: z.string().length(3).toUpperCase().default('XOF'),
  justification: z
    .string()
    .min(50, 'Justification detaillee obligatoire (>= 50 caracteres)')
    .max(5000),
  hasNegotiatedPrice: z.coerce.boolean().default(false),
  hasReinforcedPaymentTerms: z.coerce.boolean().default(false),
  hasWarrantyOrPenalty: z.coerce.boolean().default(false),
  hasReinforcedReception: z.coerce.boolean().default(false),
});

export async function createSoleSourceJustification(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.AP_OFFICER,
      RoleCode.DEMANDEUR,
      RoleCode.CHEF_PROJET,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = createSchema.safeParse({
    expenseRequestId: formData.get('expenseRequestId'),
    reason: formData.get('reason'),
    otherReason: formData.get('otherReason') ?? undefined,
    estimatedAmount: formData.get('estimatedAmount'),
    currency: formData.get('currency') ?? 'XOF',
    justification: formData.get('justification'),
    hasNegotiatedPrice: formData.get('hasNegotiatedPrice') === 'on',
    hasReinforcedPaymentTerms: formData.get('hasReinforcedPaymentTerms') === 'on',
    hasWarrantyOrPenalty: formData.get('hasWarrantyOrPenalty') === 'on',
    hasReinforcedReception: formData.get('hasReinforcedReception') === 'on',
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  // Si reason = OTHER, otherReason est requis
  if (parsed.data.reason === SoleSourceReason.OTHER && !parsed.data.otherReason) {
    return { ok: false, error: 'Le motif "Autre" exige une explication libre' };
  }

  // Verifier qu'il n'existe pas deja une justification sur cette ER
  const existing = await prisma.soleSourceJustification.findUnique({
    where: { expenseRequestId: parsed.data.expenseRequestId },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error:
        'Une justification offre unique existe deja sur cette demande (id ' + existing.id + ')',
    };
  }

  const er = await prisma.expenseRequest.findUnique({
    where: { id: parsed.data.expenseRequestId },
    select: {
      id: true,
      entityId: true,
      projectId: true,
      entity: { select: { code: true } },
      project: { select: { code: true } },
    },
  });
  if (!er) return { ok: false, error: 'Demande introuvable' };

  const reference = await allocateReference({
    type: DocumentType.SOLE_SOURCE_JUSTIFICATION,
    entityId: er.entityId,
    entityCode: er.entity.code,
    projectId: er.projectId ?? null,
    projectCode: er.project?.code ?? null,
  });

  const created = await prisma.soleSourceJustification.create({
    data: {
      reference,
      expenseRequestId: parsed.data.expenseRequestId,
      reason: parsed.data.reason,
      otherReason: parsed.data.otherReason,
      estimatedAmount: parsed.data.estimatedAmount,
      currency: parsed.data.currency,
      justification: parsed.data.justification,
      hasNegotiatedPrice: parsed.data.hasNegotiatedPrice,
      hasReinforcedPaymentTerms: parsed.data.hasReinforcedPaymentTerms,
      hasWarrantyOrPenalty: parsed.data.hasWarrantyOrPenalty,
      hasReinforcedReception: parsed.data.hasReinforcedReception,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'SoleSourceJustification',
    entityId: created.id,
    action: AuditAction.SOLE_SOURCE_CREATED,
    actorId: session.user.id,
    payload: {
      reference,
      expenseRequestId: parsed.data.expenseRequestId,
      reason: parsed.data.reason,
      estimatedAmount: parsed.data.estimatedAmount,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/sole-source-justifications');
  revalidatePath('/expense-requests/' + parsed.data.expenseRequestId);
  return { ok: true, id: created.id };
}

// La table SoleSourceJustification n'a pas de champ "status" propre - on
// considere qu'elle est "approved" si tous les drapeaux de securisation sont
// coches (au minimum 2 mesures sur 4) ET qu'un acteur Finance Groupe l'a
// validee via audit log.

const approveSchema = z.object({ id: z.string().cuid() });

export async function approveSoleSourceJustification(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.AG,
      RoleCode.FINANCE_GROUPE,
    ]);
  } catch {
    return { ok: false, error: 'Privilege DFG / Finance Groupe / AG requis' };
  }

  const parsed = approveSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { ok: false, error: 'ID invalide' };

  const ssj = await prisma.soleSourceJustification.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      reference: true,
      expenseRequestId: true,
      hasNegotiatedPrice: true,
      hasReinforcedPaymentTerms: true,
      hasWarrantyOrPenalty: true,
      hasReinforcedReception: true,
    },
  });
  if (!ssj) return { ok: false, error: 'Justification introuvable' };

  const safeguards =
    Number(ssj.hasNegotiatedPrice) +
    Number(ssj.hasReinforcedPaymentTerms) +
    Number(ssj.hasWarrantyOrPenalty) +
    Number(ssj.hasReinforcedReception);
  if (safeguards < 2) {
    return {
      ok: false,
      error:
        'Au moins 2 mesures de securisation sur 4 doivent etre cochees avant approbation (cadre Modele 2).',
    };
  }

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'SoleSourceJustification',
    entityId: ssj.id,
    action: AuditAction.SOLE_SOURCE_APPROVED,
    actorId: session.user.id,
    payload: { reference: ssj.reference, safeguards },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/sole-source-justifications/' + ssj.id);
  revalidatePath('/expense-requests/' + ssj.expenseRequestId);
  return { ok: true };
}
