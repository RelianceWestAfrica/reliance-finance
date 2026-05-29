// =============================================================================
// Pont financier - Constantes du contrat (transport + enums)
// =============================================================================
// Ce package est volontairement SANS dependance a la base de donnees : il doit
// pouvoir etre importe par des apps sources sur d'autres stacks (Next/Prisma,
// AdonisJS/Lucid, ...). Il ne contient que des types, de la validation Zod et
// des helpers HMAC (node:crypto).
// =============================================================================

/** Version du schema du contrat. Bump = changement non retrocompatible. */
export const BRIDGE_SCHEMA_VERSION = '1.0';

/** En-tetes HTTP du protocole de pont (signature HMAC + idempotence). */
export const BRIDGE_HEADERS = {
  SOURCE: 'X-RWA-Bridge-Source',
  TIMESTAMP: 'X-RWA-Bridge-Timestamp',
  SIGNATURE: 'X-RWA-Bridge-Signature',
  IDEMPOTENCY_KEY: 'Idempotency-Key',
} as const;

/**
 * Type de flux financier.
 * - DISBURSEMENT : sortie (chantier/logistique) -> ExpenseRequest Finance
 * - COLLECTION   : entree (immobilier) -> CashForecastLine{INFLOW} + ecriture
 * - PAYROLL_BATCH: paie (RH/SIRH, futur)
 * - INTERCO      : flux inter-entites (futur)
 */
export const BRIDGE_FLOW_TYPES = [
  'DISBURSEMENT',
  'COLLECTION',
  'PAYROLL_BATCH',
  'INTERCO',
] as const;

/** Apps sources autorisees a pousser des intentions. */
export const BRIDGE_SOURCE_APPS = [
  'rwa-btp',
  'rwa-achats-logistique',
  'reliance-domains',
  'reliance-escalade',
] as const;

/** Nature de la contrepartie selon le sens du flux. */
export const COUNTERPARTY_KINDS = ['SUPPLIER', 'CLIENT', 'EMPLOYEE', 'INTERNAL'] as const;

/** Decision d'une validation amont (Ligne 1, cote source). */
export const UPSTREAM_DECISIONS = ['OK', 'RESERVES', 'REJECTED'] as const;

/** Niveaux d'urgence (alignes sur Finance.UrgencyLevel). */
export const URGENCY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Nature comptable (alignee sur Finance.OpexCapex). */
export const OPEX_CAPEX = ['OPEX', 'CAPEX'] as const;

/** Fenetre anti-replay du timestamp (secondes). */
export const BRIDGE_TIMESTAMP_TOLERANCE_SECONDS = 300;

export type BridgeFlowType = (typeof BRIDGE_FLOW_TYPES)[number];
export type BridgeSourceApp = (typeof BRIDGE_SOURCE_APPS)[number];
export type CounterpartyKind = (typeof COUNTERPARTY_KINDS)[number];
export type UpstreamDecision = (typeof UPSTREAM_DECISIONS)[number];
export type BridgeUrgencyLevel = (typeof URGENCY_LEVELS)[number];
export type BridgeOpexCapex = (typeof OPEX_CAPEX)[number];
