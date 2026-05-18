// =============================================================================
// KPIs - Calcul pure (cadre §10)
// =============================================================================
//   - % paiements avec dossier complet (= 3-way OK + PV DEFINITIVE)
//   - Delai moyen de traitement (FD soumission -> paiement execute)
//   - Ecarts budget vs reel par projet
//   - Nombre d'urgences et regularisations hors delai
//   - Anomalies fournisseurs (RIB, doublons, PV manquants)
// =============================================================================

export interface PaymentForKPI {
  id: string;
  amount: number;
  status: 'DRAFT' | 'ANTI_FRAUD_PENDING' | 'SCHEDULED' | 'EXECUTED' | 'RECONCILED' | 'FAILED' | 'CANCELLED';
  threeWayMatchOk: boolean;
  hasPVDefinitif: boolean;
}

export interface ExpenseRequestForLeadTime {
  id: string;
  createdAt: Date;
  paidAt: Date | null;
}

export interface EmergencyForKPI {
  id: string;
  emergencyDeadlineAt: Date | null;
  regularizedAt: Date | null;
}

export interface ProjectBudgetVsActual {
  projectId: string;
  projectCode: string;
  budget: number;
  actualSpent: number;
}

export interface KpiSummary {
  totalPayments: number;
  compliantPayments: number;
  compliantPaymentsPercent: number;
  avgLeadTimeDays: number | null;
  emergencyCount: number;
  emergencyOverdueCount: number;
  emergencyOverdueRate: number;
  budgetVsActual: {
    projectCode: string;
    budget: number;
    actualSpent: number;
    variancePercent: number;
    isOverBudget: boolean;
  }[];
}

export function compliantPaymentsRate(payments: PaymentForKPI[]): {
  total: number;
  compliant: number;
  percent: number;
} {
  const total = payments.length;
  const compliant = payments.filter(
    (p) => p.status !== 'CANCELLED' && p.status !== 'FAILED' && p.threeWayMatchOk && p.hasPVDefinitif,
  ).length;
  return {
    total,
    compliant,
    percent: total === 0 ? 0 : Math.round((compliant / total) * 10000) / 100,
  };
}

export function avgLeadTimeDays(requests: ExpenseRequestForLeadTime[]): number | null {
  const completed = requests.filter((r) => r.paidAt !== null);
  if (completed.length === 0) return null;
  const totalMs = completed.reduce(
    (sum, r) => sum + (r.paidAt!.getTime() - r.createdAt.getTime()),
    0,
  );
  const avgMs = totalMs / completed.length;
  return Math.round((avgMs / (24 * 3600 * 1000)) * 100) / 100;
}

export function emergencyStats(
  emergencies: EmergencyForKPI[],
  now: Date = new Date(),
): { count: number; overdue: number; overdueRate: number } {
  const count = emergencies.length;
  const overdue = emergencies.filter(
    (e) => e.emergencyDeadlineAt !== null && e.regularizedAt === null && now > e.emergencyDeadlineAt,
  ).length;
  return {
    count,
    overdue,
    overdueRate: count === 0 ? 0 : Math.round((overdue / count) * 10000) / 100,
  };
}

export function budgetVarianceByProject(
  projects: ProjectBudgetVsActual[],
): KpiSummary['budgetVsActual'] {
  return projects.map((p) => {
    const variance = p.budget === 0 ? 0 : ((p.actualSpent - p.budget) / p.budget) * 100;
    return {
      projectCode: p.projectCode,
      budget: p.budget,
      actualSpent: p.actualSpent,
      variancePercent: Math.round(variance * 100) / 100,
      isOverBudget: p.actualSpent > p.budget,
    };
  });
}

export function buildKpiSummary(input: {
  payments: PaymentForKPI[];
  expenseRequests: ExpenseRequestForLeadTime[];
  emergencies: EmergencyForKPI[];
  projects: ProjectBudgetVsActual[];
  now?: Date;
}): KpiSummary {
  const now = input.now ?? new Date();
  const compliance = compliantPaymentsRate(input.payments);
  const emergency = emergencyStats(input.emergencies, now);
  return {
    totalPayments: compliance.total,
    compliantPayments: compliance.compliant,
    compliantPaymentsPercent: compliance.percent,
    avgLeadTimeDays: avgLeadTimeDays(input.expenseRequests),
    emergencyCount: emergency.count,
    emergencyOverdueCount: emergency.overdue,
    emergencyOverdueRate: emergency.overdueRate,
    budgetVsActual: budgetVarianceByProject(input.projects),
  };
}
