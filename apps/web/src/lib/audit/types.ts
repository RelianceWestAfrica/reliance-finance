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
