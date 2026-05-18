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

  // M4 Expense requests + workflow
  EXPENSE_REQUEST_CREATED: 'expense_request.created',
  EXPENSE_REQUEST_UPDATED: 'expense_request.updated',
  EXPENSE_REQUEST_SUBMITTED: 'expense_request.submitted',
  EXPENSE_REQUEST_SIGNED: 'expense_request.signed',
  EXPENSE_REQUEST_APPROVED: 'expense_request.approved',
  EXPENSE_REQUEST_REJECTED: 'expense_request.rejected',
  EXPENSE_REQUEST_CANCELLED: 'expense_request.cancelled',
  EXPENSE_REQUEST_REGULARIZED: 'expense_request.regularized',
  EXPENSE_REQUEST_EMERGENCY_OVERDUE: 'expense_request.emergency_overdue',

  // M5 Offer comparison + sole-source justification
  OFFER_COMPARISON_CREATED: 'offer_comparison.created',
  OFFER_COMPARISON_UPDATED: 'offer_comparison.updated',
  OFFER_ADDED: 'offer.added',
  OFFER_REMOVED: 'offer.removed',
  OFFER_RECOMMENDED: 'offer_comparison.recommended',
  OFFER_COMPARISON_SUBMITTED: 'offer_comparison.submitted',
  OFFER_COMPARISON_APPROVED: 'offer_comparison.approved',
  OFFER_COMPARISON_REJECTED: 'offer_comparison.rejected',
  SOLE_SOURCE_CREATED: 'sole_source.created',
  SOLE_SOURCE_APPROVED: 'sole_source.approved',
  SOLE_SOURCE_REJECTED: 'sole_source.rejected',

  // M6 Purchase order
  PURCHASE_ORDER_CREATED: 'purchase_order.created',
  PURCHASE_ORDER_UPDATED: 'purchase_order.updated',
  PURCHASE_ORDER_ITEM_ADDED: 'purchase_order.item_added',
  PURCHASE_ORDER_ITEM_REMOVED: 'purchase_order.item_removed',
  PURCHASE_ORDER_SUBMITTED: 'purchase_order.submitted',
  PURCHASE_ORDER_SIGNED: 'purchase_order.signed',
  PURCHASE_ORDER_SENT: 'purchase_order.sent_to_supplier',
  PURCHASE_ORDER_CANCELLED: 'purchase_order.cancelled',
  PURCHASE_ORDER_CLOSED: 'purchase_order.closed',
  PAYMENT_EXECUTED: 'payment.executed',
  BANK_ACCOUNT_CHANGE_REQUESTED: 'bank_account_change.requested',
  BANK_ACCOUNT_CHANGE_APPROVED: 'bank_account_change.approved',

  // M7 Reception (PV)
  RECEPTION_CREATED: 'reception.created',
  RECEPTION_UPDATED: 'reception.updated',
  RECEPTION_ITEM_ADDED: 'reception.item_added',
  RECEPTION_SIGNED_OPS: 'reception.signed_ops',
  RECEPTION_SIGNED_TECH: 'reception.signed_tech',
  RECEPTION_SIGNED_FINANCE: 'reception.signed_finance',
  RECEPTION_FINALIZED: 'reception.finalized',
  RECEPTION_REJECTED: 'reception.rejected',

  // M8 Invoice + 3-way match
  INVOICE_CREATED: 'invoice.created',
  INVOICE_UPDATED: 'invoice.updated',
  INVOICE_LINE_ADDED: 'invoice.line_added',
  INVOICE_LINE_REMOVED: 'invoice.line_removed',
  INVOICE_THREE_WAY_MATCH_RUN: 'invoice.three_way_match.run',
  INVOICE_THREE_WAY_MATCH_OK: 'invoice.three_way_match.ok',
  INVOICE_THREE_WAY_MATCH_KO: 'invoice.three_way_match.ko',
  INVOICE_APPROVED: 'invoice.approved',
  INVOICE_DISPUTED: 'invoice.disputed',
  INVOICE_PAID: 'invoice.paid',
  CREDIT_NOTE_CREATED: 'credit_note.created',

  // M10 Treasury / Payments
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_ANTI_FRAUD_PASSED: 'payment.anti_fraud.passed',
  PAYMENT_ANTI_FRAUD_BLOCKED: 'payment.anti_fraud.blocked',
  PAYMENT_SIGNED: 'payment.signed',
  PAYMENT_SCHEDULED: 'payment.scheduled',
  PAYMENT_EXECUTION_ATTEMPTED: 'payment.execution.attempted',
  PAYMENT_EXECUTION_BLOCKED: 'payment.execution.blocked',
  PAYMENT_RECONCILED: 'payment.reconciled',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_CANCELLED: 'payment.cancelled',
  PAYMENT_RATE_LIMITED: 'payment.rate_limited',

  // M12 Comptabilite + export SYSCOHADA / FEC
  JOURNAL_ENTRY_CREATED: 'journal_entry.created',
  JOURNAL_ENTRY_POSTED: 'journal_entry.posted',
  JOURNAL_ENTRY_REVERSED: 'journal_entry.reversed',
  JOURNAL_ENTRY_ARCHIVED: 'journal_entry.archived',
  ACCOUNTING_PERIOD_OPENED: 'accounting_period.opened',
  ACCOUNTING_PERIOD_CLOSED: 'accounting_period.closed',
  ACCOUNTING_PERIOD_REOPENED: 'accounting_period.reopened',
  FEC_EXPORTED: 'accounting.fec_exported',
  SYSCOHADA_EXPORTED: 'accounting.syscohada_exported',
  ERP_WEBHOOK_SENT: 'accounting.erp_webhook_sent',
  ERP_WEBHOOK_FAILED: 'accounting.erp_webhook_failed',
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
