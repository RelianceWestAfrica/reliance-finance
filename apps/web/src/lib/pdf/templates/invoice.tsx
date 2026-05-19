// =============================================================================
// PDF template - Facture / Avoir (M8)
// =============================================================================

import { Document, Page, Text } from '@react-pdf/renderer';

import { styles } from '../styles.js';
import {
  FieldRow,
  ItemsTable,
  PdfFooter,
  PdfHeader,
  Section,
  SignatureBlock,
  formatAmount,
  formatDate,
  type ItemRow,
  type SignatureData,
} from '../components.js';

export interface InvoicePdfData {
  reference: string;
  type: string; // INVOICE / CREDIT_NOTE
  status: string;
  invoiceNumber?: string | null;
  invoiceDate?: Date | null;
  dueDate?: Date | null;
  totalHt: string;
  vatAmount: string;
  totalTtc: string;
  amountPaid: string;
  currency: string;
  threeWayMatchStatus?: string | null; // OK / MISMATCH / MISSING_PV
  createdAt: Date;
  entity: { code: string; name: string };
  supplier: { code: string; name: string };
  purchaseOrderRef?: string | null;
  receptionRef?: string | null;
  lines: ItemRow[];
  signatures: SignatureData[];
  verifyUrl?: string;
  qrDataUrl?: string;
  chainTip?: string | null;
}

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const isAvoir = data.type === 'CREDIT_NOTE';
  return (
    <Document
      title={`${isAvoir ? 'Avoir' : 'Facture'} ${data.reference}`}
      author="Reliance Finance"
      subject={data.invoiceNumber ?? data.reference}
    >
      <Page size="A4" style={styles.page}>
        <PdfHeader
          docType={isAvoir ? 'Avoir' : 'Facture'}
          reference={data.reference}
          date={data.invoiceDate ?? data.createdAt}
          entityName={data.entity.name}
          badge={data.threeWayMatchStatus === 'OK' ? '3-WAY OK' : data.threeWayMatchStatus ?? undefined}
        />

        <Section title="Parties">
          <FieldRow
            label="Fournisseur"
            value={`${data.supplier.name} (${data.supplier.code})`}
          />
          <FieldRow
            label="Client"
            value={`${data.entity.name} (${data.entity.code})`}
          />
        </Section>

        <Section title="Identification">
          <FieldRow label="N facture fournisseur" value={data.invoiceNumber ?? '-'} />
          <FieldRow label="Reference interne" value={data.reference} />
          <FieldRow label="Type" value={isAvoir ? 'Avoir (CREDIT_NOTE)' : 'Facture'} />
          <FieldRow label="Statut" value={data.status} />
          <FieldRow label="Date facture" value={formatDate(data.invoiceDate)} />
          <FieldRow label="Date echeance" value={formatDate(data.dueDate)} />
          {data.purchaseOrderRef ? (
            <FieldRow label="BC adosse" value={data.purchaseOrderRef} />
          ) : null}
          {data.receptionRef ? (
            <FieldRow label="PV adosse" value={data.receptionRef} />
          ) : null}
          {data.threeWayMatchStatus ? (
            <FieldRow label="3-way match" value={data.threeWayMatchStatus} />
          ) : null}
        </Section>

        <Section title="Lignes de facturation">
          <ItemsTable items={data.lines} />
        </Section>

        <Section title="Recapitulatif">
          <FieldRow
            label="Total HT"
            value={`${formatAmount(data.totalHt, 0)} ${data.currency}`}
          />
          <FieldRow
            label="TVA"
            value={`${formatAmount(data.vatAmount, 0)} ${data.currency}`}
          />
          <FieldRow
            label="Total TTC"
            value={`${formatAmount(data.totalTtc, 0)} ${data.currency}`}
          />
          <FieldRow
            label="Deja regle"
            value={`${formatAmount(data.amountPaid, 0)} ${data.currency}`}
          />
          <FieldRow
            label="Reste a payer"
            value={`${formatAmount(
              (Number(data.totalTtc.toString()) - Number(data.amountPaid.toString())).toFixed(0),
              0,
            )} ${data.currency}`}
          />
        </Section>

        {data.signatures.length > 0 ? (
          <Section title="Visa interne">
            <SignatureBlock signatures={data.signatures} />
          </Section>
        ) : null}

        {data.threeWayMatchStatus === 'MISMATCH' ? (
          <Text style={[styles.italic, { color: '#B91C1C', marginTop: 8 }]}>
            Ecart 3-way match detecte. Le paiement est bloque jusqu&apos;a
            reconciliation (procedure §M8).
          </Text>
        ) : null}

        <PdfFooter
          qrDataUrl={data.qrDataUrl}
          chainTip={data.chainTip}
          verifyUrl={data.verifyUrl}
        />
      </Page>
    </Document>
  );
}
