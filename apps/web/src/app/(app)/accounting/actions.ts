'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, JournalEntryStatus, PaymentStatus, RoleCode } from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole, hasAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { buildPaymentEntry, buildInvoiceEntry, isBalanced } from '@/lib/accounting/build-entry';
import { isEntryInClosedPeriod } from '@/lib/accounting/period-locking';

// =============================================================================
// GENERATE JOURNAL ENTRY FROM PAYMENT
// =============================================================================

export async function generateJournalEntryFromPayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.CHIEF_ACCOUNTANT,
      RoleCode.COMPTABLE_PAYS,
      RoleCode.TRESORIER_GROUPE,
    ]);
  } catch {
    return { ok: false, error: 'Privilege Comptabilite / Tresorerie requis' };
  }

  const paymentId = String(formData.get('paymentId') ?? '');
  if (!paymentId) return { ok: false, error: 'paymentId manquant' };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        select: { invoiceNumber: true, supplier: { select: { code: true } } },
      },
      project: { select: { id: true } },
    },
  });
  if (!payment) return { ok: false, error: 'Paiement introuvable' };
  if (payment.status !== PaymentStatus.EXECUTED && payment.status !== PaymentStatus.RECONCILED) {
    return {
      ok: false,
      error:
        'Generation possible uniquement pour paiements EXECUTED ou RECONCILED (statut : ' +
        payment.status +
        ')',
    };
  }
  if (!payment.executedAt) {
    return { ok: false, error: "Paiement sans date d'execution" };
  }

  // Check periode non close
  const periods = await prisma.accountingPeriod.findMany({
    where: { entityId: payment.entityId },
    select: { entityId: true, year: true, month: true, isClosed: true },
  });
  const lockCheck = isEntryInClosedPeriod(payment.entityId, payment.executedAt, periods);
  if (lockCheck.locked) {
    return { ok: false, error: lockCheck.reason ?? 'Periode close' };
  }

  // Verifier qu'une JournalEntry n'existe pas deja pour ce paiement
  const existing = await prisma.journalEntry.findFirst({
    where: { paymentId: payment.id },
    select: { id: true, reference: true },
  });
  if (existing) {
    return {
      ok: false,
      error: 'Une ecriture existe deja pour ce paiement : ' + existing.reference,
    };
  }

  // Trouver / creer la periode comptable
  const year = payment.executedAt.getUTCFullYear();
  const month = payment.executedAt.getUTCMonth() + 1;
  const period = await prisma.accountingPeriod.upsert({
    where: { entityId_year_month: { entityId: payment.entityId, year, month } },
    create: { entityId: payment.entityId, year, month, isClosed: false },
    update: {},
  });

  // Construit l'ecriture
  const built = buildPaymentEntry({
    paymentReference: payment.reference,
    paymentAmount: Number(payment.amount.toString()),
    paymentMethod: payment.method,
    executedAt: payment.executedAt,
    invoiceNumber: payment.invoice?.invoiceNumber ?? 'sans-facture',
    supplierCode: payment.invoice?.supplier?.code ?? 'sans-fournisseur',
    currency: payment.currency,
  });

  if (!isBalanced(built)) {
    return {
      ok: false,
      error:
        'BUG : ecriture generee non equilibree (debit=' +
        built.totalDebit +
        ', credit=' +
        built.totalCredit +
        ')',
    };
  }

  // Alloue une reference simple (pas de DocumentSequence pour JournalEntry
  // - chaque entree est referencee par un counter local de periode)
  const counter = await prisma.journalEntry.count({
    where: { entityId: payment.entityId, periodId: period.id },
  });
  const reference =
    'JE-' +
    payment.entityId.slice(-4) +
    '-' +
    year +
    String(month).padStart(2, '0') +
    '-' +
    String(counter + 1).padStart(4, '0');

  const created = await prisma.journalEntry.create({
    data: {
      reference,
      status: JournalEntryStatus.DRAFT,
      entityId: payment.entityId,
      periodId: period.id,
      paymentId: payment.id,
      journalCode: built.journalCode,
      entryDate: built.entryDate,
      description: built.description,
      totalDebit: built.totalDebit,
      totalCredit: built.totalCredit,
      currency: built.currency,
      lines: {
        create: built.lines.map((l) => ({
          position: l.position,
          accountCode: l.accountCode,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          currency: built.currency,
        })),
      },
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'JournalEntry',
    entityId: created.id,
    action: AuditAction.JOURNAL_ENTRY_CREATED,
    actorId: session.user.id,
    payload: {
      reference,
      paymentReference: payment.reference,
      journalCode: built.journalCode,
      totalDebit: built.totalDebit,
      totalCredit: built.totalCredit,
      lineCount: built.lines.length,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/accounting');
  return { ok: true, id: created.id };
}

// =============================================================================
// GENERATE JOURNAL ENTRY FROM INVOICE (achat)
// =============================================================================

export async function generateJournalEntryFromInvoice(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.CHIEF_ACCOUNTANT,
      RoleCode.COMPTABLE_PAYS,
    ]);
  } catch {
    return { ok: false, error: 'Privilege Comptabilite requis' };
  }

  const invoiceId = String(formData.get('invoiceId') ?? '');
  if (!invoiceId) return { ok: false, error: 'invoiceId manquant' };

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: { select: { code: true } } },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };
  if (
    invoice.status !== 'APPROVED' &&
    invoice.status !== 'PAID' &&
    invoice.status !== 'PARTIALLY_PAID'
  ) {
    return {
      ok: false,
      error: 'Facture doit etre approuvee (statut : ' + invoice.status + ')',
    };
  }

  // Periode non close
  const periods = await prisma.accountingPeriod.findMany({
    where: { entityId: invoice.entityId },
    select: { entityId: true, year: true, month: true, isClosed: true },
  });
  const lockCheck = isEntryInClosedPeriod(invoice.entityId, invoice.invoiceDate, periods);
  if (lockCheck.locked) return { ok: false, error: lockCheck.reason ?? 'Periode close' };

  // Find existing for this invoice (linked via paymentId is wrong here ; we
  // use a description match or could add invoiceId to JournalEntry schema).
  // For M12, simpler : on permet plusieurs JE par facture si demande
  // (l'utilisateur doit verifier qu'il ne genere pas en double).

  const year = invoice.invoiceDate.getUTCFullYear();
  const month = invoice.invoiceDate.getUTCMonth() + 1;
  const period = await prisma.accountingPeriod.upsert({
    where: { entityId_year_month: { entityId: invoice.entityId, year, month } },
    create: { entityId: invoice.entityId, year, month, isClosed: false },
    update: {},
  });

  const built = buildInvoiceEntry({
    invoiceReference: invoice.reference,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    supplierCode: invoice.supplier.code,
    subtotalHt: Number(invoice.subtotalHt.toString()),
    taxAmount: Number(invoice.taxAmount.toString()),
    totalTtc: Number(invoice.totalTtc.toString()),
    currency: invoice.currency,
  });

  if (!isBalanced(built)) {
    return { ok: false, error: 'BUG : ecriture facture non equilibree' };
  }

  const counter = await prisma.journalEntry.count({
    where: { entityId: invoice.entityId, periodId: period.id },
  });
  const reference =
    'JE-' +
    invoice.entityId.slice(-4) +
    '-' +
    year +
    String(month).padStart(2, '0') +
    '-' +
    String(counter + 1).padStart(4, '0');

  const created = await prisma.journalEntry.create({
    data: {
      reference,
      status: JournalEntryStatus.DRAFT,
      entityId: invoice.entityId,
      periodId: period.id,
      journalCode: built.journalCode,
      entryDate: built.entryDate,
      description: built.description,
      totalDebit: built.totalDebit,
      totalCredit: built.totalCredit,
      currency: built.currency,
      lines: {
        create: built.lines.map((l) => ({
          position: l.position,
          accountCode: l.accountCode,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          currency: built.currency,
        })),
      },
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'JournalEntry',
    entityId: created.id,
    action: AuditAction.JOURNAL_ENTRY_CREATED,
    actorId: session.user.id,
    payload: { reference, invoiceReference: invoice.reference, journalCode: built.journalCode },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/accounting');
  return { ok: true, id: created.id };
}

// =============================================================================
// POST (DRAFT -> POSTED)
// =============================================================================

export async function postJournalEntry(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (
    !hasAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.CHIEF_ACCOUNTANT,
      RoleCode.COMPTABLE_PAYS,
    ])
  ) {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { period: { select: { isClosed: true } } },
  });
  if (!entry) return { ok: false, error: 'Ecriture introuvable' };
  if (entry.status !== JournalEntryStatus.DRAFT) {
    return { ok: false, error: 'Statut invalide pour posting : ' + entry.status };
  }
  if (entry.period.isClosed) {
    return { ok: false, error: 'Periode cloturee - posting interdit' };
  }

  await prisma.journalEntry.update({
    where: { id },
    data: { status: JournalEntryStatus.POSTED, postedAt: new Date() },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'JournalEntry',
    entityId: id,
    action: AuditAction.JOURNAL_ENTRY_POSTED,
    actorId: session.user.id,
    payload: { reference: entry.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/accounting');
  return { ok: true };
}

// =============================================================================
// OPEN / CLOSE / REOPEN PERIOD
// =============================================================================

const periodSchema = z.object({
  entityId: z.string().cuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function openAccountingPeriod(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CHIEF_ACCOUNTANT])) {
    return { ok: false, error: 'Privilege Comptabilite / DFG requis' };
  }

  const parsed = periodSchema.safeParse({
    entityId: formData.get('entityId'),
    year: formData.get('year'),
    month: formData.get('month'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const existing = await prisma.accountingPeriod.findUnique({
    where: {
      entityId_year_month: {
        entityId: parsed.data.entityId,
        year: parsed.data.year,
        month: parsed.data.month,
      },
    },
  });
  if (existing && !existing.isClosed) {
    return { ok: false, error: 'Periode deja ouverte' };
  }

  const period = existing
    ? await prisma.accountingPeriod.update({
        where: { id: existing.id },
        data: { isClosed: false, closedAt: null, closedById: null },
      })
    : await prisma.accountingPeriod.create({
        data: {
          entityId: parsed.data.entityId,
          year: parsed.data.year,
          month: parsed.data.month,
          isClosed: false,
        },
      });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'AccountingPeriod',
    entityId: period.id,
    action: existing
      ? AuditAction.ACCOUNTING_PERIOD_REOPENED
      : AuditAction.ACCOUNTING_PERIOD_OPENED,
    actorId: session.user.id,
    payload: { entityId: parsed.data.entityId, year: parsed.data.year, month: parsed.data.month },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/accounting');
  return { ok: true };
}

export async function closeAccountingPeriod(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CHIEF_ACCOUNTANT])) {
    return { ok: false, error: 'Privilege Comptabilite / DFG requis' };
  }

  const parsed = periodSchema.safeParse({
    entityId: formData.get('entityId'),
    year: formData.get('year'),
    month: formData.get('month'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const period = await prisma.accountingPeriod.findUnique({
    where: {
      entityId_year_month: {
        entityId: parsed.data.entityId,
        year: parsed.data.year,
        month: parsed.data.month,
      },
    },
  });
  if (!period) return { ok: false, error: "Periode introuvable - l'ouvrir d'abord" };
  if (period.isClosed) return { ok: false, error: 'Periode deja cloturee' };

  // Garde : toutes les ecritures DRAFT doivent etre postees ou supprimees
  const draftCount = await prisma.journalEntry.count({
    where: { periodId: period.id, status: JournalEntryStatus.DRAFT },
  });
  if (draftCount > 0) {
    return {
      ok: false,
      error:
        draftCount + ' ecriture(s) DRAFT non postee(s). Postez-les ou supprimez-les avant cloture.',
    };
  }

  await prisma.accountingPeriod.update({
    where: { id: period.id },
    data: { isClosed: true, closedAt: new Date(), closedById: session.user.id },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'AccountingPeriod',
    entityId: period.id,
    action: AuditAction.ACCOUNTING_PERIOD_CLOSED,
    actorId: session.user.id,
    payload: { year: parsed.data.year, month: parsed.data.month, draftCount },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/accounting');
  return { ok: true };
}
