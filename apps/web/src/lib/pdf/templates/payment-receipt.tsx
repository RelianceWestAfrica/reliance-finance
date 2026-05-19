// =============================================================================
// PDF template - Recu de paiement (M10)
// =============================================================================

import { Document, Page, Text } from '@react-pdf/renderer';

import { styles } from '../styles.js';
import {
  FieldRow,
  PdfFooter,
  PdfHeader,
  Section,
  SignatureBlock,
  formatAmount,
  formatDate,
  formatDateTime,
  type SignatureData,
} from '../components.js';

export interface PaymentReceiptPdfData {
  reference: string;
  status: string;
  method: string; // BANK_TRANSFER / CHECK / CASH
  amount: string;
  currency: string;
  scheduledAt?: Date | null;
  executedAt?: Date | null;
  proofUrl?: string | null;
  entity: { code: string; name: string };
  supplier: { code: string; name: string };
  invoiceRef?: string | null;
  purchaseOrderRef?: string | null;
  beneficiaryRib: string;
  beneficiaryHolderName: string;
  bankName?: string | null;
  signatures: SignatureData[];
  verifyUrl?: string;
  qrDataUrl?: string;
  chainTip?: string | null;
}

export function PaymentReceiptPdf({ data }: { data: PaymentReceiptPdfData }) {
  return (
    <Document
      title={`Recu paiement ${data.reference}`}
      author="Reliance Finance"
      subject={`Paiement ${data.reference}`}
    >
      <Page size="A4" style={styles.page}>
        <PdfHeader
          docType="Recu de paiement"
          reference={data.reference}
          date={data.executedAt ?? data.scheduledAt ?? new Date()}
          entityName={data.entity.name}
          badge={data.status === 'EXECUTED' ? 'EXECUTE' : data.status}
        />

        <Section title="Donneur d'ordre">
          <FieldRow
            label="Entite emettrice"
            value={`${data.entity.name} (${data.entity.code})`}
          />
        </Section>

        <Section title="Beneficiaire">
          <FieldRow
            label="Fournisseur"
            value={`${data.supplier.name} (${data.supplier.code})`}
          />
          <FieldRow label="Titulaire RIB" value={data.beneficiaryHolderName} />
          <FieldRow label="RIB / IBAN" value={data.beneficiaryRib} />
          <FieldRow label="Banque" value={data.bankName ?? '-'} />
        </Section>

        <Section title="Paiement">
          <FieldRow label="Statut" value={data.status} />
          <FieldRow label="Methode" value={prettyMethod(data.method)} />
          <FieldRow
            label="Montant"
            value={`${formatAmount(data.amount, 0)} ${data.currency}`}
          />
          <FieldRow label="Programmation" value={formatDate(data.scheduledAt)} />
          <FieldRow label="Execution" value={formatDateTime(data.executedAt)} />
          {data.invoiceRef ? (
            <FieldRow label="Facture adossee" value={data.invoiceRef} />
          ) : null}
          {data.purchaseOrderRef ? (
            <FieldRow label="BC source" value={data.purchaseOrderRef} />
          ) : null}
        </Section>

        {data.proofUrl ? (
          <Section title="Preuve bancaire">
            <FieldRow
              label="Type"
              value="Avis de debit / SWIFT (consultable dans l'application)"
            />
          </Section>
        ) : null}

        <Section title="Double validation (anti-fraude)">
          <SignatureBlock signatures={data.signatures} />
        </Section>

        <Text style={[styles.italic, { marginTop: 8 }]}>
          Ce paiement a fait l&apos;objet d&apos;une double validation
          conformement a la procedure M10 §anti-fraude. Beneficiaire et RIB
          ont ete verifies par rapprochement avec le bon de commande source.
        </Text>

        <PdfFooter
          qrDataUrl={data.qrDataUrl}
          chainTip={data.chainTip}
          verifyUrl={data.verifyUrl}
        />
      </Page>
    </Document>
  );
}

function prettyMethod(m: string): string {
  switch (m) {
    case 'BANK_TRANSFER':
      return 'Virement bancaire';
    case 'CHECK':
      return 'Cheque';
    case 'CASH':
      return 'Especes';
    default:
      return m;
  }
}
