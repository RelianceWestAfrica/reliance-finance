'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  DocumentType,
  PaymentStatus,
  PaymentMethod,
  RoleCode,
  SignatureStage,
  WorkflowStepStatus,
  InvoiceType,
} from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole, hasAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { allocateReference } from '@/lib/document-sequence/allocate';
import { createSignature } from '@/lib/signatures/service';
import { checkAntiFraud } from '@/lib/payments/anti-fraud';
import { checkAndRecord } from '@/lib/payments/rate-limit';
import { computeInvoiceBalance } from '@/lib/invoices/balance';

// =============================================================================
// CREATE PAYMENT
// =============================================================================

const createSchema = z.object({
  invoiceId: z.string().cuid(),
  amount: z.coerce.number().positive(),
  bankAccountId: z.string().cuid(),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.BANK_TRANSFER),
  scheduledAt: z.string().optional().or(z.literal('').transform(() => undefined)),
});

export async function createPayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.TRESORIER_GROUPE,
      RoleCode.AP_OFFICER,
      RoleCode.DAF_PAYS,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = createSchema.safeParse({
    invoiceId: formData.get('invoiceId'),
    amount: formData.get('amount'),
    bankAccountId: formData.get('bankAccountId'),
    method: formData.get('method') ?? undefined,
    scheduledAt: formData.get('scheduledAt') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const invoice = await prisma.invoice.findUnique({
    where: { id: parsed.data.invoiceId },
    include: {
      entity: { select: { id: true, code: true } },
      project: { select: { id: true, code: true } },
      supplier: { select: { id: true, code: true, name: true } },
      purchaseOrder: { select: { id: true, bankAccountSnapshotId: true } },
      reception: { select: { status: true } },
      payments: { select: { amount: true, status: true } },
      creditNotes: { select: { totalTtc: true } },
    },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };

  if (invoice.type === InvoiceType.CREDIT_NOTE) {
    return {
      ok: false,
      error: 'Un avoir ne se "paye" pas : il reduit le solde de la facture originale',
    };
  }

  // Calcule reste du
  const sumPaid = invoice.payments
    .filter((p) => p.status === PaymentStatus.EXECUTED || p.status === PaymentStatus.RECONCILED)
    .reduce((s, p) => s + Number(p.amount.toString()), 0);
  const balance = computeInvoiceBalance(
    { totalTtc: Number(invoice.totalTtc.toString()), amountPaid: sumPaid },
    invoice.creditNotes.map((cn) => ({ totalTtc: Number(cn.totalTtc.toString()) })),
  );

  if (parsed.data.amount > balance.amountDue) {
    return {
      ok: false,
      error:
        'Montant (' +
        parsed.data.amount +
        ') depasse le reste du (' +
        balance.amountDue +
        ')',
    };
  }

  const bankAccount = await prisma.bankAccount.findUnique({
    where: { id: parsed.data.bankAccountId },
    select: {
      id: true,
      supplierId: true,
      holderName: true,
      iban: true,
      rib: true,
      isActive: true,
      verifiedAt: true,
      quarantineUntil: true,
    },
  });
  if (!bankAccount) return { ok: false, error: 'RIB beneficiaire introuvable' };
  if (bankAccount.supplierId !== invoice.supplierId) {
    return { ok: false, error: 'RIB ne correspond pas au fournisseur de la facture' };
  }

  const reference = await allocateReference({
    type: DocumentType.PAYMENT,
    entityId: invoice.entity.id,
    entityCode: invoice.entity.code,
    projectId: invoice.project?.id ?? null,
    projectCode: invoice.project?.code ?? null,
  });

  const created = await prisma.payment.create({
    data: {
      reference,
      status: PaymentStatus.DRAFT,
      method: parsed.data.method,
      entityId: invoice.entityId,
      projectId: invoice.projectId,
      invoiceId: invoice.id,
      bankAccountId: bankAccount.id,
      createdById: session.user.id,
      amount: parsed.data.amount,
      currency: invoice.currency,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      beneficiaryName: bankAccount.holderName,
      beneficiaryIban: bankAccount.iban,
      beneficiaryRib: bankAccount.rib,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Payment',
    entityId: created.id,
    action: AuditAction.PAYMENT_CREATED,
    actorId: session.user.id,
    payload: {
      reference,
      invoiceRef: invoice.reference,
      supplierCode: invoice.supplier.code,
      amount: parsed.data.amount,
      bankAccountId: bankAccount.id,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/payments');
  return { ok: true, id: created.id };
}

// =============================================================================
// SUBMIT FOR ANTI-FRAUD + SIGNATURE WORKFLOW
// =============================================================================

export async function submitPayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      invoice: {
        include: {
          supplier: { select: { id: true, name: true } },
          reception: { select: { status: true } },
          purchaseOrder: { select: { bankAccountSnapshotId: true } },
          creditNotes: { select: { totalTtc: true } },
          payments: { select: { amount: true, status: true } },
        },
      },
      bankAccount: true,
    },
  });
  if (!payment || !payment.invoice) return { ok: false, error: 'Paiement / facture introuvable' };
  if (payment.status !== PaymentStatus.DRAFT) {
    return { ok: false, error: 'Statut invalide pour soumission : ' + payment.status };
  }

  // §4.1 : sans PV definitif, pas de paiement
  if (!payment.invoice.reception || payment.invoice.reception.status !== 'DEFINITIVE') {
    return {
      ok: false,
      error: 'PV de reception DEFINITIVE requis avant paiement (cadre §4.1).',
    };
  }

  // Calcule solde
  const sumPaid = payment.invoice.payments
    .filter((p) => p.status === PaymentStatus.EXECUTED || p.status === PaymentStatus.RECONCILED)
    .reduce((s, p) => s + Number(p.amount.toString()), 0);
  const balance = computeInvoiceBalance(
    { totalTtc: Number(payment.invoice.totalTtc.toString()), amountPaid: sumPaid },
    payment.invoice.creditNotes.map((cn) => ({ totalTtc: Number(cn.totalTtc.toString()) })),
  );

  // Recupere le RIB snapshot du BC
  const poSnapshot = payment.invoice.purchaseOrder?.bankAccountSnapshotId
    ? await prisma.bankAccount.findUnique({
        where: { id: payment.invoice.purchaseOrder.bankAccountSnapshotId },
        select: { id: true, iban: true, rib: true },
      })
    : null;

  // ANTI-FRAUDE
  const antiFraud = checkAntiFraud({
    supplierName: payment.invoice.supplier.name,
    supplierId: payment.invoice.supplier.id,
    bankAccount: {
      id: payment.bankAccount.id,
      holderName: payment.bankAccount.holderName,
      iban: payment.bankAccount.iban,
      rib: payment.bankAccount.rib,
      isActive: payment.bankAccount.isActive,
      verifiedAt: payment.bankAccount.verifiedAt,
      quarantineUntil: payment.bankAccount.quarantineUntil,
    },
    bcBankAccountSnapshotId: poSnapshot?.id ?? null,
    bcBankAccountIban: poSnapshot?.iban ?? null,
    bcBankAccountRib: poSnapshot?.rib ?? null,
    amountToPay: Number(payment.amount.toString()),
    invoiceAmountDue: balance.amountDue,
  });

  const { ip, userAgent } = await getRequestActorContext();

  if (!antiFraud.ok) {
    await appendAudit({
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.PAYMENT_ANTI_FRAUD_BLOCKED,
      actorId: session.user.id,
      payload: { violations: antiFraud.violations, reference: payment.reference },
      ip,
      userAgent,
    }).catch(() => undefined);
    return {
      ok: false,
      error: 'Anti-fraude : ' + antiFraud.violations.map((v) => v.message).join(' | '),
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id },
      data: { status: PaymentStatus.ANTI_FRAUD_PENDING },
    });

    // Workflow : 2 signatures requises (DAF Pays / Tresorier puis DFG)
    const instance = await tx.workflowInstance.create({
      data: {
        entityType: DocumentType.PAYMENT,
        definitionKey: 'payment_standard',
        definitionVersion: 1,
        currentStatus: PaymentStatus.ANTI_FRAUD_PENDING,
        contextSnapshot: { amountToPay: Number(payment.amount.toString()) },
        paymentId: payment.id,
      },
    });
    await tx.workflowStep.createMany({
      data: [
        {
          workflowInstanceId: instance.id,
          position: 1,
          stage: SignatureStage.EXECUTION_TRESORERIE,
          fromStatus: PaymentStatus.ANTI_FRAUD_PENDING,
          toStatus: PaymentStatus.SCHEDULED,
          action: 'sign',
          status: WorkflowStepStatus.PENDING,
        },
        {
          workflowInstanceId: instance.id,
          position: 2,
          stage: SignatureStage.VISA_GROUPE,
          fromStatus: PaymentStatus.ANTI_FRAUD_PENDING,
          toStatus: PaymentStatus.SCHEDULED,
          action: 'sign',
          status: WorkflowStepStatus.PENDING,
        },
      ],
    });
  });

  await appendAudit({
    entityType: 'Payment',
    entityId: payment.id,
    action: AuditAction.PAYMENT_ANTI_FRAUD_PASSED,
    actorId: session.user.id,
    payload: { reference: payment.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/payments/' + id);
  return { ok: true };
}

// =============================================================================
// SIGN (2 validations cascadees)
// =============================================================================

const signSchema = z.object({
  id: z.string().cuid(),
  comment: z.string().max(500).optional(),
});

export async function signPayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = signSchema.safeParse({
    id: formData.get('id'),
    comment: formData.get('comment') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  const payment = await prisma.payment.findUnique({
    where: { id: parsed.data.id },
    include: {
      workflowInstance: {
        include: {
          steps: { orderBy: { position: 'asc' } },
          signatures: { select: { stage: true, actorId: true } },
        },
      },
    },
  });
  if (!payment || !payment.workflowInstance) {
    return { ok: false, error: 'Workflow paiement introuvable' };
  }

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);

  // Trouver la prochaine etape PENDING
  const pendingStep = payment.workflowInstance.steps.find(
    (s) => s.status === WorkflowStepStatus.PENDING,
  );
  if (!pendingStep) return { ok: false, error: 'Aucune signature en attente' };

  // Verifier role
  const allowedRoles: RoleCode[] =
    pendingStep.stage === SignatureStage.EXECUTION_TRESORERIE
      ? [RoleCode.TRESORIER_GROUPE, RoleCode.DAF_PAYS, RoleCode.AP_OFFICER]
      : [RoleCode.DFG, RoleCode.FINANCE_GROUPE];
  if (!hasAnyRole(memberships, allowedRoles)) {
    return {
      ok: false,
      error: 'Privilege requis pour cette etape : ' + allowedRoles.join(', '),
    };
  }

  // Separation : pas createur, pas signataire precedent
  if (payment.createdById === session.user.id) {
    return {
      ok: false,
      error: 'Le createur du paiement ne peut pas le signer (separation des fonctions §12)',
    };
  }
  const alreadySigned = payment.workflowInstance.signatures.some((s) => s.actorId === session.user.id);
  if (alreadySigned) {
    return {
      ok: false,
      error: 'Acteur a deja signe une etape - separation des fonctions interdit',
    };
  }

  const { ip, userAgent } = await getRequestActorContext();
  const role = actorRoles.find((r) => allowedRoles.includes(r)) ?? actorRoles[0];
  if (!role) return { ok: false, error: 'Aucun role exploitable' };

  const isLastStep = pendingStep.position === payment.workflowInstance.steps.length;

  await prisma.$transaction(async (tx) => {
    await createSignature(
      {
        workflowInstanceId: payment.workflowInstance!.id,
        stepId: pendingStep.id,
        actorId: session.user.id,
        role,
        stage: pendingStep.stage,
        documentSnapshot: {
          id: payment.id,
          reference: payment.reference,
          amount: payment.amount.toString(),
          currency: payment.currency,
          bankAccountId: payment.bankAccountId,
          beneficiaryName: payment.beneficiaryName,
          beneficiaryIban: payment.beneficiaryIban,
        },
        ip,
        userAgent,
        comment: parsed.data.comment,
      },
      tx as never,
    );

    await tx.workflowStep.update({
      where: { id: pendingStep.id },
      data: { status: WorkflowStepStatus.COMPLETED, completedAt: new Date() },
    });

    if (isLastStep) {
      await tx.payment.update({
        where: { id: parsed.data.id },
        data: { status: PaymentStatus.SCHEDULED },
      });
      await tx.workflowInstance.update({
        where: { id: payment.workflowInstance!.id },
        data: { currentStatus: PaymentStatus.SCHEDULED },
      });
    }
  });

  await appendAudit({
    entityType: 'Payment',
    entityId: payment.id,
    action: AuditAction.PAYMENT_SIGNED,
    actorId: session.user.id,
    payload: { reference: payment.reference, stage: pendingStep.stage, position: pendingStep.position },
    ip,
    userAgent,
  }).catch(() => undefined);

  if (isLastStep) {
    await appendAudit({
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.PAYMENT_SCHEDULED,
      actorId: session.user.id,
      payload: { reference: payment.reference },
      ip,
      userAgent,
    }).catch(() => undefined);
  }

  revalidatePath('/payments/' + payment.id);
  return { ok: true };
}

// =============================================================================
// EXECUTE (rate limited + preuve bancaire obligatoire)
// =============================================================================

const executeSchema = z.object({
  id: z.string().cuid(),
  swiftReference: z.string().min(3).max(100),
  transactionNumber: z.string().min(1).max(100),
  bankProofUrl: z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

export async function executePayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.TRESORIER_GROUPE])) {
    return {
      ok: false,
      error: 'Execution reservee a TRESORIER_GROUPE / DFG / ADMIN (cadre §3.5)',
    };
  }

  const parsed = executeSchema.safeParse({
    id: formData.get('id'),
    swiftReference: formData.get('swiftReference'),
    transactionNumber: formData.get('transactionNumber'),
    bankProofUrl: formData.get('bankProofUrl') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  // RATE LIMITING (cadre brief : 5 req/min/IP sur paiements)
  const { ip, userAgent } = await getRequestActorContext();
  const rateLimitKey = 'payment-execute:' + (ip ?? 'unknown') + ':' + session.user.id;
  const rateCheck = checkAndRecord(rateLimitKey);
  if (!rateCheck.allowed) {
    await appendAudit({
      entityType: 'Payment',
      entityId: parsed.data.id,
      action: AuditAction.PAYMENT_RATE_LIMITED,
      actorId: session.user.id,
      payload: { resetAt: new Date(rateCheck.resetAt).toISOString() },
      ip,
      userAgent,
    }).catch(() => undefined);
    return {
      ok: false,
      error:
        'Rate limit depasse (5 req/min). Reessayez apres ' +
        new Date(rateCheck.resetAt).toISOString() +
        '.',
    };
  }

  const payment = await prisma.payment.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      status: true,
      reference: true,
      invoiceId: true,
      amount: true,
      bankAccountId: true,
      createdById: true,
    },
  });
  if (!payment) return { ok: false, error: 'Paiement introuvable' };

  // ENREGISTRE LA TENTATIVE (succes ou echec)
  await appendAudit({
    entityType: 'Payment',
    entityId: payment.id,
    action: AuditAction.PAYMENT_EXECUTION_ATTEMPTED,
    actorId: session.user.id,
    payload: { reference: payment.reference, status: payment.status },
    ip,
    userAgent,
  }).catch(() => undefined);

  if (payment.status !== PaymentStatus.SCHEDULED) {
    await appendAudit({
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.PAYMENT_EXECUTION_BLOCKED,
      actorId: session.user.id,
      payload: { reason: 'INVALID_STATUS', status: payment.status },
      ip,
      userAgent,
    }).catch(() => undefined);
    return {
      ok: false,
      error: 'Statut invalide pour execution : ' + payment.status + ' (requis : SCHEDULED)',
    };
  }

  // Separation : executeur != createur
  if (payment.createdById === session.user.id) {
    await appendAudit({
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.PAYMENT_EXECUTION_BLOCKED,
      actorId: session.user.id,
      payload: { reason: 'SEPARATION_OF_DUTIES' },
      ip,
      userAgent,
    }).catch(() => undefined);
    return {
      ok: false,
      error: 'Le createur du paiement ne peut pas l\'executer (separation des fonctions §12)',
    };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: parsed.data.id },
      data: {
        status: PaymentStatus.EXECUTED,
        executedAt: now,
        swiftReference: parsed.data.swiftReference,
        transactionNumber: parsed.data.transactionNumber,
        bankProofUrl: parsed.data.bankProofUrl,
        ribVerifiedAt: now,
        ribVerifiedById: session.user.id,
      },
    });

    // Met a jour amountPaid sur la facture
    if (payment.invoiceId) {
      const allExecuted = await tx.payment.findMany({
        where: {
          invoiceId: payment.invoiceId,
          status: { in: [PaymentStatus.EXECUTED, PaymentStatus.RECONCILED] },
        },
        select: { amount: true },
      });
      const total = allExecuted.reduce((s, p) => s + Number(p.amount.toString()), 0);
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { amountPaid: total },
      });
    }
  });

  await appendAudit({
    entityType: 'Payment',
    entityId: payment.id,
    action: AuditAction.PAYMENT_EXECUTED,
    actorId: session.user.id,
    payload: {
      reference: payment.reference,
      swiftReference: parsed.data.swiftReference,
      transactionNumber: parsed.data.transactionNumber,
      executedAt: now.toISOString(),
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/payments/' + payment.id);
  if (payment.invoiceId) revalidatePath('/invoices/' + payment.invoiceId);
  return { ok: true };
}

// =============================================================================
// RECONCILE
// =============================================================================

export async function reconcilePayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (
    !hasAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.TRESORIER_GROUPE,
      RoleCode.COMPTABLE_PAYS,
      RoleCode.CHIEF_ACCOUNTANT,
    ])
  ) {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const payment = await prisma.payment.update({
    where: { id },
    data: { status: PaymentStatus.RECONCILED },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Payment',
    entityId: id,
    action: AuditAction.PAYMENT_RECONCILED,
    actorId: session.user.id,
    payload: { reference: payment.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/payments/' + id);
  return { ok: true };
}

// =============================================================================
// CANCEL
// =============================================================================

const cancelSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(5).max(500),
});

export async function cancelPayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.TRESORIER_GROUPE]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = cancelSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const payment = await prisma.payment.findUnique({
    where: { id: parsed.data.id },
    select: { status: true, reference: true },
  });
  if (!payment) return { ok: false, error: 'Paiement introuvable' };
  if (
    payment.status === PaymentStatus.EXECUTED ||
    payment.status === PaymentStatus.RECONCILED
  ) {
    return {
      ok: false,
      error: 'Annulation impossible apres execution (utilisez une procedure d\'avoir)',
    };
  }

  await prisma.payment.update({
    where: { id: parsed.data.id },
    data: { status: PaymentStatus.CANCELLED, failureReason: parsed.data.reason },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Payment',
    entityId: parsed.data.id,
    action: AuditAction.PAYMENT_CANCELLED,
    actorId: session.user.id,
    payload: { reference: payment.reference, reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/payments/' + parsed.data.id);
  return { ok: true };
}
