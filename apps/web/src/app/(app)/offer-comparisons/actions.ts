'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  DocumentType,
  OfferComparisonStatus,
  RoleCode,
} from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { allocateReference } from '@/lib/document-sequence/allocate';
import { validateForSubmission } from '@/lib/offer-comparisons/validation';

// =============================================================================
// CREATE OFFER COMPARISON
// =============================================================================

const createSchema = z.object({
  entityId: z.string().cuid(),
  projectId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
  expenseRequestId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
  technicalSpecs: z.string().max(2000).optional().or(z.literal('').transform(() => undefined)),
  desiredDelay: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  paymentTerms: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  warrantyRequired: z.coerce.boolean().default(false),
  warrantyMonths: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  penaltyClause: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
});

export async function createOfferComparison(
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
    entityId: formData.get('entityId'),
    projectId: formData.get('projectId') ?? undefined,
    expenseRequestId: formData.get('expenseRequestId') ?? undefined,
    technicalSpecs: formData.get('technicalSpecs') ?? undefined,
    desiredDelay: formData.get('desiredDelay') ?? undefined,
    paymentTerms: formData.get('paymentTerms') ?? undefined,
    warrantyRequired: formData.get('warrantyRequired') === 'on',
    warrantyMonths: formData.get('warrantyMonths') ?? undefined,
    penaltyClause: formData.get('penaltyClause') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const [entity, project] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: parsed.data.entityId },
      select: { id: true, code: true },
    }),
    parsed.data.projectId
      ? prisma.project.findUnique({
          where: { id: parsed.data.projectId },
          select: { id: true, code: true },
        })
      : Promise.resolve(null),
  ]);
  if (!entity) return { ok: false, error: 'Entite introuvable' };

  const reference = await allocateReference({
    type: DocumentType.OFFER_COMPARISON,
    entityId: entity.id,
    entityCode: entity.code,
    projectId: project?.id ?? null,
    projectCode: project?.code ?? null,
  });

  const created = await prisma.offerComparison.create({
    data: {
      reference,
      status: OfferComparisonStatus.DRAFT,
      entityId: parsed.data.entityId,
      projectId: parsed.data.projectId,
      expenseRequestId: parsed.data.expenseRequestId,
      technicalSpecs: parsed.data.technicalSpecs,
      desiredDelay: parsed.data.desiredDelay,
      paymentTerms: parsed.data.paymentTerms,
      warrantyRequired: parsed.data.warrantyRequired,
      warrantyMonths: typeof parsed.data.warrantyMonths === 'number' ? parsed.data.warrantyMonths : undefined,
      penaltyClause: parsed.data.penaltyClause,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'OfferComparison',
    entityId: created.id,
    action: AuditAction.OFFER_COMPARISON_CREATED,
    actorId: session.user.id,
    payload: { reference, expenseRequestId: parsed.data.expenseRequestId ?? null },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/offer-comparisons');
  return { ok: true, id: created.id };
}

// =============================================================================
// ADD OFFER
// =============================================================================

const addOfferSchema = z.object({
  comparisonId: z.string().cuid(),
  supplierId: z.string().cuid(),
  reference: z.string().max(100).optional().or(z.literal('').transform(() => undefined)),
  priceHt: z.coerce.number().min(0),
  taxAmount: z.coerce.number().min(0).default(0),
  retentionAmount: z.coerce.number().min(0).default(0),
  priceTtc: z.coerce.number().positive(),
  currency: z.string().length(3).toUpperCase().default('XOF'),
  deliveryDelay: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  paymentTerms: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  warranty: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  technicallyCompliant: z.coerce.boolean().default(false),
  immediatelyAvailable: z.coerce.boolean().default(false),
  observations: z.string().max(1000).optional().or(z.literal('').transform(() => undefined)),
});

export async function addOffer(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = addOfferSchema.safeParse({
    comparisonId: formData.get('comparisonId'),
    supplierId: formData.get('supplierId'),
    reference: formData.get('reference') ?? undefined,
    priceHt: formData.get('priceHt'),
    taxAmount: formData.get('taxAmount') ?? 0,
    retentionAmount: formData.get('retentionAmount') ?? 0,
    priceTtc: formData.get('priceTtc'),
    currency: formData.get('currency') ?? 'XOF',
    deliveryDelay: formData.get('deliveryDelay') ?? undefined,
    paymentTerms: formData.get('paymentTerms') ?? undefined,
    warranty: formData.get('warranty') ?? undefined,
    technicallyCompliant: formData.get('technicallyCompliant') === 'on',
    immediatelyAvailable: formData.get('immediatelyAvailable') === 'on',
    observations: formData.get('observations') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const comparison = await prisma.offerComparison.findUnique({
    where: { id: parsed.data.comparisonId },
    select: { status: true },
  });
  if (!comparison) return { ok: false, error: 'Comparatif introuvable' };
  if (comparison.status !== OfferComparisonStatus.DRAFT) {
    return { ok: false, error: 'Modification verrouillee (statut : ' + comparison.status + ')' };
  }

  const created = await prisma.offer.create({
    data: {
      offerComparisonId: parsed.data.comparisonId,
      supplierId: parsed.data.supplierId,
      reference: parsed.data.reference,
      priceHt: parsed.data.priceHt,
      taxAmount: parsed.data.taxAmount,
      retentionAmount: parsed.data.retentionAmount,
      priceTtc: parsed.data.priceTtc,
      currency: parsed.data.currency,
      deliveryDelay: parsed.data.deliveryDelay,
      paymentTerms: parsed.data.paymentTerms,
      warranty: parsed.data.warranty,
      technicallyCompliant: parsed.data.technicallyCompliant,
      immediatelyAvailable: parsed.data.immediatelyAvailable,
      observations: parsed.data.observations,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'OfferComparison',
    entityId: parsed.data.comparisonId,
    action: AuditAction.OFFER_ADDED,
    actorId: session.user.id,
    payload: { offerId: created.id, supplierId: parsed.data.supplierId, priceTtc: parsed.data.priceTtc },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/offer-comparisons/' + parsed.data.comparisonId);
  return { ok: true };
}

// =============================================================================
// RECOMMEND OFFER
// =============================================================================

const recommendSchema = z.object({
  comparisonId: z.string().cuid(),
  offerId: z.string().cuid(),
  justification: z.string().min(30).max(2000),
});

export async function recommendOffer(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = recommendSchema.safeParse({
    comparisonId: formData.get('comparisonId'),
    offerId: formData.get('offerId'),
    justification: formData.get('justification'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const comparison = await prisma.offerComparison.findUnique({
    where: { id: parsed.data.comparisonId },
    select: { status: true },
  });
  if (!comparison) return { ok: false, error: 'Comparatif introuvable' };
  if (comparison.status !== OfferComparisonStatus.DRAFT) {
    return { ok: false, error: 'Recommandation verrouillee' };
  }

  const offer = await prisma.offer.findUnique({
    where: { id: parsed.data.offerId },
    select: { offerComparisonId: true },
  });
  if (!offer || offer.offerComparisonId !== parsed.data.comparisonId) {
    return { ok: false, error: 'Offre non rattachee a ce comparatif' };
  }

  await prisma.offerComparison.update({
    where: { id: parsed.data.comparisonId },
    data: {
      recommendedOfferId: parsed.data.offerId,
      recommendationJustification: parsed.data.justification,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'OfferComparison',
    entityId: parsed.data.comparisonId,
    action: AuditAction.OFFER_RECOMMENDED,
    actorId: session.user.id,
    payload: { offerId: parsed.data.offerId, justification: parsed.data.justification },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/offer-comparisons/' + parsed.data.comparisonId);
  return { ok: true };
}

// =============================================================================
// SUBMIT + APPROVE / REJECT
// =============================================================================

export async function submitOfferComparison(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const comparison = await prisma.offerComparison.findUnique({
    where: { id },
    include: { offers: true },
  });
  if (!comparison) return { ok: false, error: 'Comparatif introuvable' };
  if (comparison.status !== OfferComparisonStatus.DRAFT) {
    return { ok: false, error: 'Soumission impossible : statut ' + comparison.status };
  }

  const verdict = validateForSubmission({
    offers: comparison.offers.map((o) => ({
      id: o.id,
      supplierId: o.supplierId,
      priceTtc: Number(o.priceTtc.toString()),
      technicallyCompliant: o.technicallyCompliant,
    })),
    recommendedOfferId: comparison.recommendedOfferId,
    recommendationJustification: comparison.recommendationJustification,
  });
  if (!verdict.ok) {
    return { ok: false, error: verdict.violations.join(' | ') };
  }

  await prisma.offerComparison.update({
    where: { id },
    data: { status: OfferComparisonStatus.SUBMITTED },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'OfferComparison',
    entityId: id,
    action: AuditAction.OFFER_COMPARISON_SUBMITTED,
    actorId: session.user.id,
    payload: { reference: comparison.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/offer-comparisons/' + id);
  return { ok: true };
}

export async function approveOfferComparison(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    // Validation par DAF Pays / Finance Filiale N2 ou Finance Groupe (cadre Modele 1 - Signatures)
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.FINANCE_FIL_N2,
      RoleCode.FINANCE_GROUPE,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const comparison = await prisma.offerComparison.findUnique({
    where: { id },
    select: { status: true, reference: true, expenseRequestId: true, recommendedOfferId: true },
  });
  if (!comparison) return { ok: false, error: 'Comparatif introuvable' };
  if (comparison.status !== OfferComparisonStatus.SUBMITTED) {
    return { ok: false, error: 'Statut invalide pour approbation : ' + comparison.status };
  }

  await prisma.offerComparison.update({
    where: { id },
    data: { status: OfferComparisonStatus.APPROVED },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'OfferComparison',
    entityId: id,
    action: AuditAction.OFFER_COMPARISON_APPROVED,
    actorId: session.user.id,
    payload: {
      reference: comparison.reference,
      recommendedOfferId: comparison.recommendedOfferId,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/offer-comparisons/' + id);
  if (comparison.expenseRequestId) {
    revalidatePath('/expense-requests/' + comparison.expenseRequestId);
  }
  return { ok: true };
}

export async function rejectOfferComparison(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.FINANCE_FIL_N2,
      RoleCode.FINANCE_GROUPE,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const updated = await prisma.offerComparison.update({
    where: { id },
    data: { status: OfferComparisonStatus.REJECTED },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'OfferComparison',
    entityId: id,
    action: AuditAction.OFFER_COMPARISON_REJECTED,
    actorId: session.user.id,
    payload: { reference: updated.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/offer-comparisons/' + id);
  return { ok: true };
}
