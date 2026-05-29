import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FinancialIntent } from '@reliancewestafrica/bridge-contract';

// --- Mocks I/O : on isole le DISPATCH (routage par flowType) du reste.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    bridgeInbox: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@reliance-finance/database', () => ({
  prisma: prismaMock,
  BridgeInboxStatus: {
    RECEIVED: 'RECEIVED',
    PROCESSING: 'PROCESSING',
    COMMITTED: 'COMMITTED',
    REJECTED: 'REJECTED',
    FAILED: 'FAILED',
  },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));

vi.mock('@/lib/audit/log', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
  AuditAction: {
    BRIDGE_INTENT_COMMITTED: 'BRIDGE_INTENT_COMMITTED',
    BRIDGE_INTENT_REJECTED: 'BRIDGE_INTENT_REJECTED',
    BRIDGE_INTENT_FAILED: 'BRIDGE_INTENT_FAILED',
    BRIDGE_INTENT_DUPLICATE: 'BRIDGE_INTENT_DUPLICATE',
  },
}));

vi.mock('./create-expense-request-from-intent', () => ({
  createExpenseRequestFromIntent: vi.fn(),
}));

vi.mock('./create-collection-from-intent', () => ({
  createCollectionFromIntent: vi.fn(),
}));

import { processFinancialIntent } from './process-intent';
import { createExpenseRequestFromIntent } from './create-expense-request-from-intent';
import { createCollectionFromIntent } from './create-collection-from-intent';

function makeIntent(flowType: string): FinancialIntent {
  return {
    schemaVersion: '1.0',
    intentId: 'intent-dispatch-0001',
    flowType,
    amount: { value: '5000000.0000', currency: 'XOF' },
  } as unknown as FinancialIntent;
}

function run(flowType: string) {
  const intent = makeIntent(flowType);
  return processFinancialIntent({
    source: 'reliance-domains',
    rawBody: JSON.stringify(intent),
    idempotencyKey: intent.intentId,
    intent,
  });
}

function committedUpdate() {
  return prismaMock.bridgeInbox.update.mock.calls.find(
    (c) => c[0]?.data?.status === 'COMMITTED',
  )?.[0];
}
function rejectedUpdate() {
  return prismaMock.bridgeInbox.update.mock.calls.find((c) => c[0]?.data?.status === 'REJECTED')?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.bridgeInbox.create.mockResolvedValue({ id: 'inbox-1' });
  prismaMock.bridgeInbox.update.mockResolvedValue({});
});

describe('processFinancialIntent — dispatch par flowType', () => {
  it('DISBURSEMENT -> createExpenseRequestFromIntent, financeObjectType=ExpenseRequest, 202', async () => {
    vi.mocked(createExpenseRequestFromIntent).mockResolvedValue({
      ok: true,
      expenseRequestId: 'er-1',
      reference: 'FD-2026-0001',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: 'FINANCE_FIL_VISA_PENDING' as any,
    });

    const res = await run('DISBURSEMENT');

    expect(res.httpStatus).toBe(202);
    expect(res.body.financeObjectType).toBe('ExpenseRequest');
    expect(res.body.financeObjectId).toBe('er-1');
    expect(createExpenseRequestFromIntent).toHaveBeenCalledTimes(1);
    expect(createCollectionFromIntent).not.toHaveBeenCalled();
    expect(committedUpdate()?.data.financeObjectType).toBe('ExpenseRequest');
  });

  it('COLLECTION -> createCollectionFromIntent, financeObjectType=JournalEntry, 202', async () => {
    vi.mocked(createCollectionFromIntent).mockResolvedValue({
      ok: true,
      journalEntryId: 'je-1',
      reference: 'JE-TOGO-202605-0001',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: 'DRAFT' as any,
      cashForecastLineId: 'cfl-1',
    });

    const res = await run('COLLECTION');

    expect(res.httpStatus).toBe(202);
    expect(res.body.financeObjectType).toBe('JournalEntry');
    expect(res.body.financeObjectId).toBe('je-1');
    expect(createCollectionFromIntent).toHaveBeenCalledTimes(1);
    expect(createExpenseRequestFromIntent).not.toHaveBeenCalled();
    expect(committedUpdate()?.data.financeObjectType).toBe('JournalEntry');
  });

  it('COLLECTION rejetee -> markRejected (REJECTED) + 422 avec le code metier', async () => {
    vi.mocked(createCollectionFromIntent).mockResolvedValue({
      ok: false,
      code: 'PERIOD_CLOSED',
      message: 'Periode close',
    });

    const res = await run('COLLECTION');

    expect(res.httpStatus).toBe(422);
    expect((res.body.error as { code: string }).code).toBe('PERIOD_CLOSED');
    expect(rejectedUpdate()?.data.errorCode).toBe('PERIOD_CLOSED');
    expect(committedUpdate()).toBeUndefined();
  });

  it('flowType non implemente (PAYROLL_BATCH) -> FLOW_NOT_IMPLEMENTED 422, aucun creator appele', async () => {
    const res = await run('PAYROLL_BATCH');

    expect(res.httpStatus).toBe(422);
    expect((res.body.error as { code: string }).code).toBe('FLOW_NOT_IMPLEMENTED');
    expect(createExpenseRequestFromIntent).not.toHaveBeenCalled();
    expect(createCollectionFromIntent).not.toHaveBeenCalled();
  });
});
