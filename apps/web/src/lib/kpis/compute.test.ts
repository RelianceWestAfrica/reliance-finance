import { describe, expect, it } from 'vitest';

import {
  compliantPaymentsRate,
  avgLeadTimeDays,
  emergencyStats,
  budgetVarianceByProject,
  buildKpiSummary,
} from './compute.js';

const NOW = new Date('2026-05-18T12:00:00Z');

describe('compliantPaymentsRate', () => {
  it('100% si tous OK', () => {
    const r = compliantPaymentsRate([
      { id: 'p1', amount: 100, status: 'EXECUTED', threeWayMatchOk: true, hasPVDefinitif: true },
      { id: 'p2', amount: 200, status: 'RECONCILED', threeWayMatchOk: true, hasPVDefinitif: true },
    ]);
    expect(r.percent).toBe(100);
  });

  it('50% si 1/2 conforme', () => {
    const r = compliantPaymentsRate([
      { id: 'p1', amount: 100, status: 'EXECUTED', threeWayMatchOk: true, hasPVDefinitif: true },
      { id: 'p2', amount: 200, status: 'EXECUTED', threeWayMatchOk: false, hasPVDefinitif: true },
    ]);
    expect(r.percent).toBe(50);
  });

  it('exclut CANCELLED et FAILED du compte total compliant', () => {
    const r = compliantPaymentsRate([
      { id: 'p1', amount: 100, status: 'CANCELLED', threeWayMatchOk: true, hasPVDefinitif: true },
    ]);
    expect(r.compliant).toBe(0);
    expect(r.total).toBe(1);
  });

  it('0% sur set vide (pas NaN)', () => {
    expect(compliantPaymentsRate([]).percent).toBe(0);
  });
});

describe('avgLeadTimeDays', () => {
  it('moyenne en jours arrondie 2 decimales', () => {
    const r = avgLeadTimeDays([
      { id: 'r1', createdAt: new Date('2026-05-01'), paidAt: new Date('2026-05-08') }, // 7j
      { id: 'r2', createdAt: new Date('2026-05-01'), paidAt: new Date('2026-05-04') }, // 3j
    ]);
    expect(r).toBe(5);
  });

  it('null si aucun paye', () => {
    expect(avgLeadTimeDays([{ id: 'r1', createdAt: NOW, paidAt: null }])).toBeNull();
  });

  it('ignore les non payes dans le calcul', () => {
    const r = avgLeadTimeDays([
      { id: 'r1', createdAt: new Date('2026-05-01'), paidAt: new Date('2026-05-11') }, // 10j
      { id: 'r2', createdAt: new Date('2026-05-01'), paidAt: null },
    ]);
    expect(r).toBe(10);
  });
});

describe('emergencyStats', () => {
  it('compte overdue : deadline passee + non regularise', () => {
    const r = emergencyStats(
      [
        { id: 'e1', emergencyDeadlineAt: new Date('2026-05-10'), regularizedAt: null }, // overdue
        { id: 'e2', emergencyDeadlineAt: new Date('2026-05-20'), regularizedAt: null }, // pas encore
        { id: 'e3', emergencyDeadlineAt: new Date('2026-05-10'), regularizedAt: new Date('2026-05-15') }, // regularise OK
      ],
      NOW,
    );
    expect(r.count).toBe(3);
    expect(r.overdue).toBe(1);
    expect(r.overdueRate).toBeCloseTo(33.33, 1);
  });

  it('0% sur set vide', () => {
    expect(emergencyStats([], NOW).overdueRate).toBe(0);
  });
});

describe('budgetVarianceByProject', () => {
  it('calcule variance % et flag isOverBudget', () => {
    const r = budgetVarianceByProject([
      { projectId: 'p1', projectCode: 'CIDPE', budget: 100_000, actualSpent: 120_000 },
      { projectId: 'p2', projectCode: 'RWA1', budget: 100_000, actualSpent: 80_000 },
    ]);
    expect(r[0]).toMatchObject({ variancePercent: 20, isOverBudget: true });
    expect(r[1]).toMatchObject({ variancePercent: -20, isOverBudget: false });
  });

  it('budget = 0 : variance 0% (eviter division par zero)', () => {
    const r = budgetVarianceByProject([
      { projectId: 'p1', projectCode: 'X', budget: 0, actualSpent: 100 },
    ]);
    expect(r[0]?.variancePercent).toBe(0);
    expect(r[0]?.isOverBudget).toBe(true);
  });
});

describe('buildKpiSummary', () => {
  it('aggrege tous les KPIs', () => {
    const s = buildKpiSummary({
      payments: [
        { id: 'p1', amount: 1000, status: 'EXECUTED', threeWayMatchOk: true, hasPVDefinitif: true },
        { id: 'p2', amount: 500, status: 'EXECUTED', threeWayMatchOk: false, hasPVDefinitif: true },
      ],
      expenseRequests: [
        { id: 'r1', createdAt: new Date('2026-05-01'), paidAt: new Date('2026-05-08') },
      ],
      emergencies: [
        { id: 'e1', emergencyDeadlineAt: new Date('2026-05-10'), regularizedAt: null },
      ],
      projects: [
        { projectId: 'p1', projectCode: 'CIDPE', budget: 100, actualSpent: 150 },
      ],
      now: NOW,
    });
    expect(s.totalPayments).toBe(2);
    expect(s.compliantPaymentsPercent).toBe(50);
    expect(s.avgLeadTimeDays).toBe(7);
    expect(s.emergencyOverdueCount).toBe(1);
    expect(s.budgetVsActual[0]?.isOverBudget).toBe(true);
  });
});
