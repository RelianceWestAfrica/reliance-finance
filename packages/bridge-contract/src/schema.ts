// =============================================================================
// Pont financier - Schema de validation Zod de FinancialIntent
// =============================================================================
// Les types TypeScript sont DERIVES du schema (z.infer) pour eviter toute derive
// entre validation runtime et types statiques.
// =============================================================================

import { z } from 'zod';

import {
  BRIDGE_FLOW_TYPES,
  BRIDGE_SCHEMA_VERSION,
  BRIDGE_SOURCE_APPS,
  COUNTERPARTY_KINDS,
  OPEX_CAPEX,
  UPSTREAM_DECISIONS,
  URGENCY_LEVELS,
} from './constants.js';

/** Montant Decimal(18,4) serialise en string (jamais Float). */
const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Montant attendu : Decimal(18,4) en chaine (ex: "12500000.0000")');

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, 'sha256 hex (64 caracteres) attendu');

export const intentSourceSchema = z.object({
  app: z.enum(BRIDGE_SOURCE_APPS),
  objectType: z.string().min(1).max(80),
  objectId: z.string().min(1).max(120),
  objectRef: z.string().min(1).max(120),
  deepLink: z.string().url().max(500).optional(),
});

export const intentTargetSchema = z.object({
  entityCode: z.string().min(1).max(60),
  projectCode: z.string().max(60).optional(),
  costCenterCode: z.string().max(60).optional(),
});

export const moneySchema = z.object({
  value: decimalString,
  currency: z.string().length(3).toUpperCase(),
});

export const bridgeBankAccountSchema = z.object({
  bankName: z.string().max(160).optional(),
  holderName: z.string().max(200).optional(),
  iban: z.string().max(60).optional(),
  rib: z.string().max(60).optional(),
  swift: z.string().max(20).optional(),
  country: z.string().max(2).optional(),
});

export const counterpartySchema = z.object({
  kind: z.enum(COUNTERPARTY_KINDS),
  ref: z.string().max(120).optional(),
  name: z.string().min(1).max(200),
  rccm: z.string().max(80).optional(),
  ifu: z.string().max(80).optional(),
  bankAccount: bridgeBankAccountSchema.optional(),
});

export const intentItemSchema = z.object({
  position: z.number().int().nonnegative(),
  description: z.string().min(1).max(500),
  quantity: decimalString.optional(),
  unit: z.string().max(20).optional(),
  unitPrice: decimalString.optional(),
  totalPrice: decimalString.optional(),
  notes: z.string().max(500).optional(),
});

export const upstreamValidationSchema = z.object({
  stage: z.string().min(1).max(80),
  role: z.string().max(80).optional(),
  actorName: z.string().max(160).optional(),
  actorExternalId: z.string().max(160).optional(),
  decision: z.enum(UPSTREAM_DECISIONS),
  signedAt: isoDateTime,
  evidenceHash: z.string().max(200).optional(),
});

export const attachmentRefSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().nonnegative(),
  sha256,
  downloadUrl: z.string().url().max(1000),
  expiresAt: isoDateTime.optional(),
});

export const documentTrailSchema = z.object({
  fdaRef: z.string().max(120).nullish(),
  daRef: z.string().max(120).nullish(),
  bcRef: z.string().max(120).nullish(),
  brRef: z.string().max(120).nullish(),
  pvRef: z.string().max(120).nullish(),
  invoiceRef: z.string().max(120).nullish(),
});

export const intentContentSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  justification: z.string().max(2000).optional(),
  desiredDate: isoDate.optional(),
  location: z.string().max(200).optional(),
  items: z.array(intentItemSchema).max(200).optional(),
});

export const financialIntentSchema = z
  .object({
    schemaVersion: z.literal(BRIDGE_SCHEMA_VERSION),
    intentId: z.string().min(8).max(120),
    flowType: z.enum(BRIDGE_FLOW_TYPES),
    source: intentSourceSchema,
    target: intentTargetSchema,
    amount: moneySchema,
    budget: z
      .object({
        lineRef: z.string().max(100).optional(),
        isOutOfBudget: z.boolean().default(false),
      })
      .optional(),
    classification: z
      .object({
        opexCapex: z.enum(OPEX_CAPEX).default('OPEX'),
        urgency: z.enum(URGENCY_LEVELS).default('LOW'),
        urgencyReason: z.string().max(500).nullish(),
      })
      .optional(),
    content: intentContentSchema,
    counterparty: counterpartySchema.optional(),
    documentTrail: documentTrailSchema.optional(),
    upstreamValidations: z.array(upstreamValidationSchema).max(20).optional(),
    attachments: z.array(attachmentRefSchema).max(50).optional(),
    metadata: z.object({
      emittedAt: isoDateTime,
      emittedByName: z.string().max(160).optional(),
    }),
  })
  .superRefine((val, ctx) => {
    // Garde metier : un decaissement doit porter la preuve d'une validation amont
    // (Ligne 1 cote source), sauf urgence critique (route FD_URGENCE cote Finance).
    if (val.flowType === 'DISBURSEMENT') {
      const hasOk = (val.upstreamValidations ?? []).some((v) => v.decision === 'OK');
      const isCritical = val.classification?.urgency === 'CRITICAL';
      if (!hasOk && !isCritical) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['upstreamValidations'],
          message:
            'DISBURSEMENT exige au moins une validation amont OK, ou classification.urgency=CRITICAL',
        });
      }
    }
    // Une collecte (entree) doit cibler un client, pas un fournisseur.
    if (val.flowType === 'COLLECTION' && val.counterparty && val.counterparty.kind !== 'CLIENT') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['counterparty', 'kind'],
        message: 'COLLECTION attend une contrepartie de type CLIENT',
      });
    }
  });

export type FinancialIntent = z.infer<typeof financialIntentSchema>;
export type IntentSource = z.infer<typeof intentSourceSchema>;
export type IntentTarget = z.infer<typeof intentTargetSchema>;
export type IntentMoney = z.infer<typeof moneySchema>;
export type IntentCounterparty = z.infer<typeof counterpartySchema>;
export type IntentBankAccount = z.infer<typeof bridgeBankAccountSchema>;
export type IntentItem = z.infer<typeof intentItemSchema>;
export type IntentUpstreamValidation = z.infer<typeof upstreamValidationSchema>;
export type IntentAttachmentRef = z.infer<typeof attachmentRefSchema>;
export type IntentDocumentTrail = z.infer<typeof documentTrailSchema>;

/** Parse + valide une intention. Retourne un resultat discrimine. */
export function parseFinancialIntent(
  input: unknown,
):
  | { ok: true; intent: FinancialIntent }
  | { ok: false; error: { message: string; path: string; code: string } } {
  const parsed = financialIntentSchema.safeParse(input);
  if (parsed.success) return { ok: true, intent: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    error: {
      message: first?.message ?? 'FinancialIntent invalide',
      path: first?.path.join('.') ?? '',
      code: first?.code ?? 'invalid',
    },
  };
}
