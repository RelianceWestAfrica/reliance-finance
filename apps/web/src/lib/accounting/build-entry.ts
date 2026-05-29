// =============================================================================
// Accounting - Construction d'ecritures comptables (pure)
// =============================================================================
// Pour chaque type de transaction metier, genere les lignes debit/credit
// equilibrees selon le plan comptable SYSCOHADA.
//
// Garantie : totalDebit === totalCredit (verifie par tests).
//
// Codes comptables par defaut (modifiables via mapping) :
//   401100 - Fournisseurs (passif)
//   512100 - Banque (actif)
//   571000 - Caisse (actif)
//   445000 - TVA recuperable (actif)
//   601000 - Achats marchandises (charge)
//
// Source : cadre §5 etape 8 + plan SYSCOHADA seede dans M2.
// =============================================================================

export interface AccountingLine {
  position: number;
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
  costCenterCode?: string | null;
}

export interface BuiltEntry {
  /** Code journal (BNQ=banque, ACH=achats, OD=operations diverses) */
  journalCode: string;
  description: string;
  entryDate: Date;
  lines: AccountingLine[];
  totalDebit: number;
  totalCredit: number;
  currency: string;
}

export interface AccountMapping {
  supplier: string;
  client: string;
  bank: string;
  cash: string;
  vatRecoverable: string;
  vatCollected: string;
  expenseDefault: string;
}

export const DEFAULT_ACCOUNT_MAPPING: AccountMapping = {
  supplier: '401100',
  client: '411100',
  bank: '512100',
  cash: '571000',
  vatRecoverable: '445000',
  vatCollected: '443000',
  expenseDefault: '601000',
};

// =============================================================================
// Paiement fournisseur : D 401100 / C 512100
// =============================================================================

export interface PaymentEntryInput {
  paymentReference: string;
  paymentAmount: number;
  paymentMethod: 'BANK_TRANSFER' | 'SWIFT' | 'CHECK' | 'MOBILE_MONEY' | 'CASH' | 'OTHER';
  executedAt: Date;
  invoiceNumber: string;
  supplierCode: string;
  currency: string;
  costCenterCode?: string | null;
}

export function buildPaymentEntry(
  input: PaymentEntryInput,
  mapping: AccountMapping = DEFAULT_ACCOUNT_MAPPING,
): BuiltEntry {
  // CASH (caisse) ou BANK
  const cashAccount = input.paymentMethod === 'CASH' ? mapping.cash : mapping.bank;
  const description =
    'Reglement facture ' + input.invoiceNumber + ' - ' + input.supplierCode;

  return {
    journalCode: input.paymentMethod === 'CASH' ? 'CAI' : 'BNQ',
    description,
    entryDate: input.executedAt,
    currency: input.currency,
    lines: [
      {
        position: 1,
        accountCode: mapping.supplier,
        debit: input.paymentAmount,
        credit: 0,
        description,
        costCenterCode: input.costCenterCode,
      },
      {
        position: 2,
        accountCode: cashAccount,
        debit: 0,
        credit: input.paymentAmount,
        description: 'Sortie ' + (input.paymentMethod === 'CASH' ? 'caisse' : 'banque'),
        costCenterCode: input.costCenterCode,
      },
    ],
    totalDebit: input.paymentAmount,
    totalCredit: input.paymentAmount,
  };
}

// =============================================================================
// Achat (depuis Invoice) : D 601000 + D 445000 / C 401100
// =============================================================================

export interface InvoiceEntryInput {
  invoiceReference: string;
  invoiceNumber: string;
  invoiceDate: Date;
  supplierCode: string;
  subtotalHt: number;
  taxAmount: number;
  totalTtc: number;
  currency: string;
  expenseAccountCode?: string;
  costCenterCode?: string | null;
}

export function buildInvoiceEntry(
  input: InvoiceEntryInput,
  mapping: AccountMapping = DEFAULT_ACCOUNT_MAPPING,
): BuiltEntry {
  const description = 'Facture ' + input.invoiceNumber + ' - ' + input.supplierCode;
  const expenseAccount = input.expenseAccountCode ?? mapping.expenseDefault;

  const lines: AccountingLine[] = [
    {
      position: 1,
      accountCode: expenseAccount,
      debit: input.subtotalHt,
      credit: 0,
      description,
      costCenterCode: input.costCenterCode,
    },
  ];

  let position = 2;
  if (input.taxAmount > 0) {
    lines.push({
      position: position++,
      accountCode: mapping.vatRecoverable,
      debit: input.taxAmount,
      credit: 0,
      description: 'TVA recuperable ' + input.invoiceNumber,
      costCenterCode: input.costCenterCode,
    });
  }

  lines.push({
    position: position++,
    accountCode: mapping.supplier,
    debit: 0,
    credit: input.totalTtc,
    description,
    costCenterCode: input.costCenterCode,
  });

  return {
    journalCode: 'ACH',
    description,
    entryDate: input.invoiceDate,
    currency: input.currency,
    lines,
    totalDebit: input.subtotalHt + input.taxAmount,
    totalCredit: input.totalTtc,
  };
}

// =============================================================================
// Encaissement client (COLLECTION, pont P4) : D 512100 (ou 571000 si CASH) / C 411100
// =============================================================================
// L'argent est deja recu (echeance immobiliere PAID cote source) : l'ecriture
// constate l'entree de tresorerie et solde la creance client (compte collectif).

export interface CollectionEntryInput {
  collectionReference: string;
  collectionAmount: number;
  collectionDate: Date;
  clientCode: string;
  clientName?: string | null;
  currency: string;
  costCenterCode?: string | null;
  paymentMethod?: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
}

export function buildCollectionEntry(
  input: CollectionEntryInput,
  mapping: AccountMapping = DEFAULT_ACCOUNT_MAPPING,
): BuiltEntry {
  const cashAccount = input.paymentMethod === 'CASH' ? mapping.cash : mapping.bank;
  const hasCode = input.clientCode.trim().length > 0;
  const who = input.clientName
    ? input.clientName + (hasCode ? ' (' + input.clientCode + ')' : '')
    : hasCode
      ? input.clientCode
      : 'client';
  const description = 'Encaissement client ' + who + ' - ' + input.collectionReference;

  return {
    journalCode: input.paymentMethod === 'CASH' ? 'CAI' : 'BNQ',
    description,
    entryDate: input.collectionDate,
    currency: input.currency,
    lines: [
      {
        position: 1,
        accountCode: cashAccount,
        debit: input.collectionAmount,
        credit: 0,
        description: 'Entree ' + (input.paymentMethod === 'CASH' ? 'caisse' : 'banque'),
        costCenterCode: input.costCenterCode,
      },
      {
        position: 2,
        accountCode: mapping.client,
        debit: 0,
        credit: input.collectionAmount,
        description: 'Creance client ' + who,
        costCenterCode: input.costCenterCode,
      },
    ],
    totalDebit: input.collectionAmount,
    totalCredit: input.collectionAmount,
  };
}

// =============================================================================
// Verification equilibre
// =============================================================================

export function isBalanced(entry: BuiltEntry, toleranceCents: number = 1): boolean {
  return Math.abs(entry.totalDebit - entry.totalCredit) <= toleranceCents / 100;
}
