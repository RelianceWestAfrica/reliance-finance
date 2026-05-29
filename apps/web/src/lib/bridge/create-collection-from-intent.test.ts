import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FinancialIntent } from '@reliancewestafrica/bridge-contract';

// --- Mocks d'I/O (prisma + helpers a effets de bord). La logique pure
//     (build-entry, period-locking, week-math) reste reelle et exercee.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    accountingPeriod: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@reliance-finance/database', () => ({
  prisma: prismaMock,
  JournalEntryStatus: { DRAFT: 'DRAFT', POSTED: 'POSTED', ARCHIVED: 'ARCHIVED', REVERSED: 'REVERSED' },
  CashFlowCategory: { REVENUE: 'REVENUE', OTHER: 'OTHER' },
  CashFlowDirection: { INFLOW: 'INFLOW', OUTFLOW: 'OUTFLOW' },
}));

vi.mock('./system-user', () => ({
  ensureBridgeSystemUser: vi.fn(),
}));

vi.mock('./resolve-targets', () => ({
  resolveTargets: vi.fn(),
  resolveClient: vi.fn(),
}));

vi.mock('@/lib/audit/log', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
  AuditAction: {
    BRIDGE_INTENT_RECEIVED: 'BRIDGE_INTENT_RECEIVED',
    JOURNAL_ENTRY_CREATED: 'JOURNAL_ENTRY_CREATED',
  },
}));

import { createCollectionFromIntent } from './create-collection-from-intent';
import { ensureBridgeSystemUser } from './system-user';
import { resolveClient, resolveTargets } from './resolve-targets';

interface TxMock {
  accountingPeriod: { upsert: ReturnType<typeof vi.fn> };
  journalEntry: { count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  cashForecast: { upsert: ReturnType<typeof vi.fn> };
  cashForecastLine: { create: ReturnType<typeof vi.fn> };
}

function makeTx(): TxMock {
  return {
    accountingPeriod: { upsert: vi.fn().mockResolvedValue({ id: 'period-1' }) },
    journalEntry: {
      count: vi.fn().mockResolvedValue(0),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'je-1', reference: 'JE-TEST-202605-0001', status: 'DRAFT' }),
    },
    cashForecast: { upsert: vi.fn().mockResolvedValue({ id: 'cf-1' }) },
    cashForecastLine: { create: vi.fn().mockResolvedValue({ id: 'cfl-1' }) },
  };
}

function makeIntent(over: Partial<FinancialIntent> = {}): FinancialIntent {
  return {
    schemaVersion: '1.0',
    intentId: 'intent-collection-0001',
    flowType: 'COLLECTION',
    source: {
      app: 'reliance-domains',
      objectType: 'PaymentInstallment',
      objectId: 'pi-1',
      objectRef: 'IMMO-ECH-0001',
    },
    target: { entityCode: 'TOGO' },
    amount: { value: '5000000.0000', currency: 'XOF' },
    content: { title: 'Encaissement echeance immobiliere', desiredDate: '2026-05-15' },
    counterparty: { kind: 'CLIENT', ref: 'CLI-001', name: 'SCI Horizon' },
    metadata: { emittedAt: '2026-05-15T10:00:00.000Z' },
    ...over,
  } as FinancialIntent;
}

let tx: TxMock;

beforeEach(() => {
  vi.clearAllMocks();
  tx = makeTx();
  prismaMock.$transaction.mockImplementation(async (cb: (t: TxMock) => unknown) => cb(tx));
  prismaMock.accountingPeriod.findMany.mockResolvedValue([]);
  vi.mocked(ensureBridgeSystemUser).mockResolvedValue('sys-user');
  vi.mocked(resolveTargets).mockResolvedValue({
    ok: true,
    targets: {
      entityId: 'ent-togo',
      entityCode: 'TOGO',
      defaultCurrency: 'XOF',
      projectId: null,
      projectCode: null,
      costCenterId: null,
    },
  });
  vi.mocked(resolveClient).mockResolvedValue({ clientId: 'cli-1', clientName: 'SCI Horizon' });
});

describe('createCollectionFromIntent', () => {
  it('nominal : ecriture DRAFT equilibree D 512100 / C 411100 + CashForecastLine INFLOW', async () => {
    const res = await createCollectionFromIntent({
      intent: makeIntent(),
      source: 'reliance-domains',
      bridgeInboxId: 'inbox-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.journalEntryId).toBe('je-1');
    expect(res.status).toBe('DRAFT');

    // Ecriture comptable
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
    const jeData = tx.journalEntry.create.mock.calls[0]![0].data;
    expect(jeData.status).toBe('DRAFT');
    expect(jeData.clientId).toBe('cli-1');
    expect(jeData.totalDebit).toBe(5_000_000);
    expect(jeData.totalCredit).toBe(5_000_000);
    const lines = jeData.lines.create;
    expect(lines[0].accountCode).toBe('512100');
    expect(lines[0].debit).toBe(5_000_000);
    expect(lines[1].accountCode).toBe('411100');
    expect(lines[1].credit).toBe(5_000_000);

    // Reflet tresorerie
    expect(tx.cashForecast.upsert).toHaveBeenCalledTimes(1);
    const cflData = tx.cashForecastLine.create.mock.calls[0]![0].data;
    expect(cflData.direction).toBe('INFLOW');
    expect(cflData.category).toBe('REVENUE');
    expect(cflData.amount).toBe(5_000_000);
    expect(cflData.sourceRef).toBe('IMMO-ECH-0001');
  });

  it('rejette une contrepartie non-CLIENT (COUNTERPARTY_NOT_CLIENT)', async () => {
    const res = await createCollectionFromIntent({
      intent: makeIntent({ counterparty: { kind: 'SUPPLIER', name: 'Fournisseur X' } }),
      source: 'reliance-domains',
      bridgeInboxId: 'inbox-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('COUNTERPARTY_NOT_CLIENT');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejette une devise differente de celle de l entite (CURRENCY_MISMATCH)', async () => {
    const res = await createCollectionFromIntent({
      intent: makeIntent({ amount: { value: '5000000.0000', currency: 'EUR' } }),
      source: 'reliance-domains',
      bridgeInboxId: 'inbox-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('CURRENCY_MISMATCH');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejette un montant nul/negatif (INVALID_AMOUNT)', async () => {
    const res = await createCollectionFromIntent({
      intent: makeIntent({ amount: { value: '0', currency: 'XOF' } }),
      source: 'reliance-domains',
      bridgeInboxId: 'inbox-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('INVALID_AMOUNT');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejette si la periode comptable est close (PERIOD_CLOSED)', async () => {
    prismaMock.accountingPeriod.findMany.mockResolvedValue([
      { entityId: 'ent-togo', year: 2026, month: 5, isClosed: true },
    ]);
    const res = await createCollectionFromIntent({
      intent: makeIntent(),
      source: 'reliance-domains',
      bridgeInboxId: 'inbox-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('PERIOD_CLOSED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('sans contrepartie : ecriture creee avec clientId null', async () => {
    vi.mocked(resolveClient).mockResolvedValue({ clientId: null, clientName: null });
    const res = await createCollectionFromIntent({
      intent: makeIntent({ counterparty: undefined }),
      source: 'reliance-domains',
      bridgeInboxId: 'inbox-1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const jeData = tx.journalEntry.create.mock.calls[0]![0].data;
    expect(jeData.clientId).toBeNull();
    expect(jeData.totalDebit).toBe(5_000_000);
  });
});
