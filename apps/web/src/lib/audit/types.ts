// =============================================================================
// Audit log - Types et catalogue d'actions
// =============================================================================
// Les actions sont des chaines stables : ajouter une action existante = casser
// les rapports. Les retirer = casser l'historique. Toujours en append-only.
// =============================================================================

export const AuditAction = {
  // Auth
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  PASSWORD_SET: 'auth.password.set',
  PASSWORD_CHANGE: 'auth.password.change',
  EMAIL_VERIFIED: 'auth.email.verified',

  // RBAC
  USER_INVITED: 'rbac.user.invited',
  USER_DEACTIVATED: 'rbac.user.deactivated',
  USER_REACTIVATED: 'rbac.user.reactivated',
  MEMBERSHIP_ADDED: 'rbac.membership.added',
  MEMBERSHIP_REVOKED: 'rbac.membership.revoked',

  // M2 Referentiel
  ENTITY_CREATED: 'entity.created',
  ENTITY_UPDATED: 'entity.updated',
  ENTITY_ARCHIVED: 'entity.archived',
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_ARCHIVED: 'project.archived',
  COST_CENTER_CREATED: 'cost_center.created',
  COST_CENTER_UPDATED: 'cost_center.updated',
  COST_CENTER_ARCHIVED: 'cost_center.archived',
  THRESHOLD_CREATED: 'threshold.created',
  THRESHOLD_REPLACED: 'threshold.replaced',
  THRESHOLD_DEACTIVATED: 'threshold.deactivated',
  CHART_ACCOUNT_CREATED: 'chart_account.created',
  CHART_ACCOUNT_UPDATED: 'chart_account.updated',
  CHART_ACCOUNT_TOGGLED: 'chart_account.toggled',
  USER_PREFERENCES_UPDATED: 'user.preferences.updated',

  // M3 Suppliers + anti-fraude RIB
  SUPPLIER_CREATED: 'supplier.created',
  SUPPLIER_UPDATED: 'supplier.updated',
  SUPPLIER_ARCHIVED: 'supplier.archived',
  SUPPLIER_SENSITIVITY_CHANGED: 'supplier.sensitivity_changed',
  BANK_ACCOUNT_CREATED: 'bank_account.created',
  BANK_ACCOUNT_VERIFIED: 'bank_account.verified',
  BANK_ACCOUNT_DEACTIVATED: 'bank_account.deactivated',
  BANK_ACCOUNT_CHANGE_APPROVED_1: 'bank_account_change.approved_1',
  BANK_ACCOUNT_CHANGE_APPROVED_2: 'bank_account_change.approved_2',
  BANK_ACCOUNT_CHANGE_REJECTED: 'bank_account_change.rejected',
  BANK_ACCOUNT_CHANGE_ACTIVATED: 'bank_account_change.activated',
  ANOMALY_DETECTED: 'anomaly.detected',
  ANOMALY_RESOLVED: 'anomaly.resolved',

  // Future modules (placeholder)
  EXPENSE_REQUEST_CREATED: 'expense_request.created',
  EXPENSE_REQUEST_SUBMITTED: 'expense_request.submitted',
  EXPENSE_REQUEST_APPROVED: 'expense_request.approved',
  EXPENSE_REQUEST_REJECTED: 'expense_request.rejected',
  PAYMENT_EXECUTED: 'payment.executed',
  BANK_ACCOUNT_CHANGE_REQUESTED: 'bank_account_change.requested',
  BANK_ACCOUNT_CHANGE_APPROVED: 'bank_account_change.approved',
} as const;

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];

export interface AuditAppendInput {
  entityType: string;
  entityId: string;
  action: AuditActionType | string;
  actorId?: string | null;
  payload: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditVerifyResult {
  ok: boolean;
  count: number;
  brokenAtId?: string;
  brokenAtIndex?: number;
  reason?: 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH' | 'NO_ENTRIES';
}
