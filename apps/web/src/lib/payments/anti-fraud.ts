// =============================================================================
// Payment - Anti-fraude au moment de l'execution (cadre §5 etape 7 + §8)
// =============================================================================
// Verifications obligatoires avant tout decaissement :
//   1. Beneficiaire = fournisseur du contrat/BC (titulaire compte =
//      raison sociale facture)
//   2. RIB utilisable (actif + verifie + hors quarantaine)
//   3. RIB beneficiaire = RIB snapshot du BC (si BC lie)
//   4. Montant > 0 et <= reste a payer de la facture
//
// Logique PURE : prend des snapshots, retourne verdict. Aucune I/O.
// =============================================================================

import { isBankAccountUsable, type BankAccountStatus } from '@/lib/bank-accounts/usability';

export interface AntiFraudContext {
  /** Identite du fournisseur (raison sociale officielle) */
  supplierName: string;
  supplierId: string;

  /** Compte beneficiaire utilise pour le paiement */
  bankAccount: BankAccountStatus & {
    id: string;
    holderName: string;
    iban: string | null;
    rib: string | null;
  };

  /** RIB snapshot fige sur le BC (si paiement adosse a un BC) */
  bcBankAccountSnapshotId: string | null;
  bcBankAccountIban: string | null;
  bcBankAccountRib: string | null;

  /** Montant a payer (devise Groupe ou facture) */
  amountToPay: number;

  /** Solde restant a payer sur la facture (apres avoirs et paiements precedents) */
  invoiceAmountDue: number;
}

export type AntiFraudViolationCode =
  | 'BENEFICIARY_NAME_MISMATCH'
  | 'BANK_ACCOUNT_NOT_USABLE'
  | 'RIB_NOT_BC_SNAPSHOT'
  | 'AMOUNT_INVALID'
  | 'AMOUNT_EXCEEDS_DUE';

export interface AntiFraudViolation {
  code: AntiFraudViolationCode;
  message: string;
}

export type AntiFraudResult =
  | { ok: true }
  | { ok: false; violations: AntiFraudViolation[] };

/**
 * Normalise une raison sociale pour comparaison anti-typo :
 *   - lowercase
 *   - suppression accents (NFD)
 *   - suppression de TOUS les caracteres non-alphanumeriques (espaces,
 *     ponctuation, etc.) -> tolere les variations "BTP MATERIAUX SARL"
 *     vs "B.T.P. Materiaux S.A.R.L."
 *
 * Compromis securite : la garde reste utile contre les typos majeurs et
 * les substitutions de beneficiaire (raison sociale completement
 * differente), mais accepte les variations de presentation tolerees par
 * les normes bancaires.
 */
export function normalizeHolderName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function checkAntiFraud(
  ctx: AntiFraudContext,
  now: Date = new Date(),
): AntiFraudResult {
  const violations: AntiFraudViolation[] = [];

  // 1) Beneficiaire (titulaire compte) = fournisseur (raison sociale)
  const normalizedHolder = normalizeHolderName(ctx.bankAccount.holderName);
  const normalizedSupplier = normalizeHolderName(ctx.supplierName);
  if (normalizedHolder !== normalizedSupplier) {
    violations.push({
      code: 'BENEFICIARY_NAME_MISMATCH',
      message:
        'Titulaire du compte ("' +
        ctx.bankAccount.holderName +
        '") different de la raison sociale fournisseur ("' +
        ctx.supplierName +
        '"). Refus paiement (cadre §8).',
    });
  }

  // 2) RIB utilisable (actif + verifie + hors quarantaine)
  const usability = isBankAccountUsable(ctx.bankAccount, now);
  if (!usability.usable) {
    violations.push({
      code: 'BANK_ACCOUNT_NOT_USABLE',
      message: 'RIB non utilisable : ' + usability.message,
    });
  }

  // 3) RIB beneficiaire = RIB snapshot du BC (si BC lie)
  if (ctx.bcBankAccountSnapshotId !== null) {
    if (ctx.bcBankAccountSnapshotId !== ctx.bankAccount.id) {
      // Tolerance : si le snapshot porte la meme IBAN/RIB que le compte actuel
      // (cas du renouvellement de compte conserve par le fournisseur), on
      // accepte. Sinon : blocage.
      const sameIban =
        ctx.bcBankAccountIban !== null && ctx.bcBankAccountIban === ctx.bankAccount.iban;
      const sameRib =
        ctx.bcBankAccountRib !== null && ctx.bcBankAccountRib === ctx.bankAccount.rib;
      if (!sameIban && !sameRib) {
        violations.push({
          code: 'RIB_NOT_BC_SNAPSHOT',
          message:
            'RIB beneficiaire (' +
            (ctx.bankAccount.iban ?? ctx.bankAccount.rib) +
            ') different du RIB snapshot du BC (' +
            (ctx.bcBankAccountIban ?? ctx.bcBankAccountRib ?? '?') +
            '). Workflow change RIB requis (cadre §8).',
        });
      }
    }
  }

  // 4) Montant > 0 et <= reste a payer
  if (ctx.amountToPay <= 0) {
    violations.push({
      code: 'AMOUNT_INVALID',
      message: 'Montant a payer doit etre strictement positif',
    });
  } else if (ctx.amountToPay > ctx.invoiceAmountDue) {
    violations.push({
      code: 'AMOUNT_EXCEEDS_DUE',
      message:
        'Montant a payer (' +
        ctx.amountToPay +
        ') depasse le reste du sur la facture (' +
        ctx.invoiceAmountDue +
        ').',
    });
  }

  if (violations.length === 0) return { ok: true };
  return { ok: false, violations };
}
