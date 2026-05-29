// =============================================================================
// Pont financier - Reception d'un encaissement (flowType=COLLECTION)
// =============================================================================
// Symetrique a create-expense-request-from-intent.ts (cote DISBURSEMENT) mais
// pour une ENTREE de tresorerie deja realisee cote source (echeance immobiliere
// PAID). Decision verrouillee (ADR 0003 / §3) : v1 = CashForecastLine{INFLOW}
// + ecriture comptable JournalEntry d'encaissement, le tout en une transaction.
//
//   Ecriture (SYSCOHADA) : D 512100 (Banque, ou 571000 si CASH) / C 411100 (Clients)
//
// L'idempotence (BridgeInbox.idempotencyKey = intentId) est geree en amont par
// process-intent.ts : cette fonction n'est appelee qu'une fois par intention.
// =============================================================================

import type { FinancialIntent } from '@reliancewestafrica/bridge-contract';
import {
  CashFlowCategory,
  CashFlowDirection,
  JournalEntryStatus,
  prisma,
} from '@reliance-finance/database';

import { appendAudit, AuditAction } from '@/lib/audit/log';
import { buildCollectionEntry, isBalanced } from '@/lib/accounting/build-entry';
import {
  isEntryBeforeOldestClosedPeriod,
  isEntryInClosedPeriod,
} from '@/lib/accounting/period-locking';
import { getWeekStart } from '@/lib/cash-forecast/week-math';

import { resolveClient, resolveTargets } from './resolve-targets';
import { ensureBridgeSystemUser } from './system-user';

export interface CreateCollectionParams {
  intent: FinancialIntent;
  source: string;
  bridgeInboxId: string;
}

export type CreateCollectionResult =
  | {
      ok: true;
      journalEntryId: string;
      reference: string;
      status: JournalEntryStatus;
      cashForecastLineId: string;
    }
  | { ok: false; code: string; message: string; field?: string };

export async function createCollectionFromIntent(
  params: CreateCollectionParams,
): Promise<CreateCollectionResult> {
  const { intent, source, bridgeInboxId } = params;

  const systemUserId = await ensureBridgeSystemUser();

  const resolved = await resolveTargets(intent.target);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message, field: resolved.field };
  }
  const targets = resolved.targets;

  // Garde metier (doublon defensif du superRefine zod) : une collecte cible un client.
  if (intent.counterparty && intent.counterparty.kind !== 'CLIENT') {
    return {
      ok: false,
      code: 'COUNTERPARTY_NOT_CLIENT',
      message: 'COLLECTION attend une contrepartie de type CLIENT',
      field: 'counterparty.kind',
    };
  }

  // Multi-devise non supporte en v1 : l'ecriture touche des comptes SYSCOHADA tenus
  // en monnaie locale, sans table de change. Toute devise != entite -> rejet explicite.
  if (intent.amount.currency !== targets.defaultCurrency) {
    return {
      ok: false,
      code: 'CURRENCY_MISMATCH',
      message:
        'Devise ' +
        intent.amount.currency +
        ' incompatible avec la devise de l\'entite (' +
        targets.defaultCurrency +
        '). Multi-devise non supporte en v1.',
      field: 'amount.currency',
    };
  }

  // Rapprochement client (existant -> clientId ; sinon null + nom denormalise).
  const client = await resolveClient(targets.entityId, intent.counterparty);

  const amount = Number(intent.amount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      code: 'INVALID_AMOUNT',
      message: 'Montant d\'encaissement invalide : ' + intent.amount.value,
      field: 'amount.value',
    };
  }
  const currency = intent.amount.currency;

  // Date d'encaissement : jour souhaite (desiredDate) sinon date d'emission.
  const entryDate = intent.content.desiredDate
    ? new Date(intent.content.desiredDate)
    : new Date(intent.metadata.emittedAt);
  if (Number.isNaN(entryDate.getTime())) {
    return {
      ok: false,
      code: 'INVALID_DATE',
      message: 'Date d\'encaissement invalide',
      field: 'content.desiredDate',
    };
  }

  // Periode comptable : refuser tout encaissement dans une periode close.
  const periods = await prisma.accountingPeriod.findMany({
    where: { entityId: targets.entityId },
    select: { entityId: true, year: true, month: true, isClosed: true },
  });
  const lock = isEntryInClosedPeriod(targets.entityId, entryDate, periods);
  if (lock.locked) {
    return { ok: false, code: 'PERIOD_CLOSED', message: lock.reason ?? 'Periode comptable close' };
  }
  // Garde anti-antidatage : refuse une date anterieure a la plus ancienne periode
  // close (sinon l'upsert ci-dessous creerait retroactivement une periode ouverte
  // a partir d'une desiredDate externe non controlee).
  const tooOld = isEntryBeforeOldestClosedPeriod(targets.entityId, entryDate, periods);
  if (tooOld.locked) {
    return {
      ok: false,
      code: 'PERIOD_CLOSED',
      message: tooOld.reason ?? 'Date d\'encaissement anterieure a la plus ancienne periode close',
    };
  }

  // Construit l'ecriture equilibree D 512100 / C 411100.
  const built = buildCollectionEntry({
    collectionReference: intent.source.objectRef,
    collectionAmount: amount,
    collectionDate: entryDate,
    clientCode: intent.counterparty?.ref ?? '',
    clientName: client.clientName,
    currency,
  });
  if (!isBalanced(built)) {
    return {
      ok: false,
      code: 'UNBALANCED_ENTRY',
      message:
        'BUG : ecriture d\'encaissement non equilibree (debit=' +
        built.totalDebit +
        ', credit=' +
        built.totalCredit +
        ')',
    };
  }

  // Semaine de tresorerie (forecast au niveau entite, cf. addManualInflow).
  const weekStart = getWeekStart(entryDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const year = entryDate.getUTCFullYear();
  const month = entryDate.getUTCMonth() + 1;

  const result = await prisma.$transaction(async (tx) => {
    // Periode comptable (creation paresseuse, comme generateJournalEntryFromPayment).
    const period = await tx.accountingPeriod.upsert({
      where: { entityId_year_month: { entityId: targets.entityId, year, month } },
      create: { entityId: targets.entityId, year, month, isClosed: false },
      update: {},
    });

    // Reference locale de periode : JE-<entite>-<AAAAMM>-<compteur>.
    const counter = await tx.journalEntry.count({
      where: { entityId: targets.entityId, periodId: period.id },
    });
    const reference =
      'JE-' +
      targets.entityId.slice(-4) +
      '-' +
      year +
      String(month).padStart(2, '0') +
      '-' +
      String(counter + 1).padStart(4, '0');

    const journalEntry = await tx.journalEntry.create({
      data: {
        reference,
        status: JournalEntryStatus.DRAFT,
        entityId: targets.entityId,
        periodId: period.id,
        clientId: client.clientId,
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
      select: { id: true, reference: true, status: true },
    });

    // Reflet tresorerie : CashForecastLine INFLOW + bump du header de semaine.
    const forecast = await tx.cashForecast.upsert({
      where: {
        entityId_projectId_weekStart: {
          entityId: targets.entityId,
          projectId: null as never, // cle composite nullable (cf. addManualInflow)
          weekStart,
        },
      },
      create: {
        entityId: targets.entityId,
        weekStart,
        weekEnd,
        currency,
        openingCash: 0,
        projectedInflow: amount,
        projectedOutflow: 0,
        closingCash: amount,
      },
      update: {
        projectedInflow: { increment: amount },
        closingCash: { increment: amount },
      },
      select: { id: true },
    });

    const cashLine = await tx.cashForecastLine.create({
      data: {
        cashForecastId: forecast.id,
        category: CashFlowCategory.REVENUE,
        direction: CashFlowDirection.INFLOW,
        label: 'Encaissement ' + (client.clientName ?? 'client') + ' (' + source + ')',
        amount,
        expectedDate: entryDate,
        sourceRef: intent.source.objectRef,
      },
      select: { id: true },
    });

    return { journalEntry, cashForecastLineId: cashLine.id };
  });

  await appendAudit({
    entityType: 'JournalEntry',
    entityId: result.journalEntry.id,
    action: AuditAction.BRIDGE_INTENT_RECEIVED,
    actorId: systemUserId,
    payload: {
      reference: result.journalEntry.reference,
      flowType: 'COLLECTION',
      amount: intent.amount.value,
      currency,
      bridgeSource: source,
      intentId: intent.intentId,
      originRef: intent.source.objectRef,
      bridgeInboxId,
      clientId: client.clientId,
      clientName: client.clientName,
      cashForecastLineId: result.cashForecastLineId,
    },
  }).catch(() => undefined);

  await appendAudit({
    entityType: 'JournalEntry',
    entityId: result.journalEntry.id,
    action: AuditAction.JOURNAL_ENTRY_CREATED,
    actorId: systemUserId,
    payload: {
      reference: result.journalEntry.reference,
      journalCode: built.journalCode,
      totalDebit: built.totalDebit,
      totalCredit: built.totalCredit,
      lineCount: built.lines.length,
      via: 'bridge',
    },
  }).catch(() => undefined);

  return {
    ok: true,
    journalEntryId: result.journalEntry.id,
    reference: result.journalEntry.reference,
    status: result.journalEntry.status,
    cashForecastLineId: result.cashForecastLineId,
  };
}
