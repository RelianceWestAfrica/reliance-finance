// =============================================================================
// Tenancy - Liste des modeles soumis a l'isolation par entityId
// =============================================================================
// Cette liste fait foi. Tout ajout d'un nouveau modele metier au schema Prisma
// portant un champ `entityId` DOIT etre ajoute ici, sinon les queries leakeront
// entre filiales.
//
// Les modeles NextAuth (Account, Session, VerificationToken) et systeme
// (Currency, ChartAccount, ControlCheck, KPISnapshot, AuditLog) ne sont pas
// tenant-scoped : leur acces est filtre autrement.
// =============================================================================

export const TENANT_SCOPED_MODELS = new Set<string>([
  'Membership',
  'Entity',
  'Project',
  'CostCenter',
  'Threshold',
  'Supplier',
  'ExpenseRequest',
  'OfferComparison',
  'PurchaseOrder',
  'Reception',
  'Invoice',
  'Payment',
  'PaymentBatch',
  'CashForecast',
  'AccountingPeriod',
  'JournalEntry',
  'Anomaly',
  'DocumentSequence',
]);

/**
 * `Entity` est un cas special : son champ d'isolation est `id` (pas `entityId`),
 * et un utilisateur ne voit que les entites ou il a un Membership.
 */
export const ENTITY_MODELS_USING_ID_FIELD = new Set<string>(['Entity']);

export function isTenantScoped(model: string | undefined): boolean {
  if (!model) return false;
  return TENANT_SCOPED_MODELS.has(model);
}

export function tenancyField(model: string): 'id' | 'entityId' {
  return ENTITY_MODELS_USING_ID_FIELD.has(model) ? 'id' : 'entityId';
}
