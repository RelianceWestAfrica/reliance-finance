// Placeholders pour les definitions de workflows par type de dossier.
// Implementation complete : session M9.
//
// expense-request.ts : workflow FDA -> FD -> APPROVED
// purchase-order.ts  : workflow BC (signatures par seuil)
// reception.ts       : PV (operationnel + technique + finance)
// invoice.ts         : 3-way match + approbation
// payment.ts         : anti-fraude + execution + reconciliation
// bank-change.ts     : double validation + quarantaine 24h

export const WORKFLOW_DEFINITIONS = {} as const;
