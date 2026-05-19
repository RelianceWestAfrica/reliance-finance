// =============================================================================
// PDF template - Bon de Commande (M6)
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
  formatDateTime,
  type ItemRow,
  type SignatureData,
} from '../components.js';

export interface PurchaseOrderPdfData {
  reference: string;
  status: string;
  title: string;
  amountHT: string;
  amountTTC: string;
  vatRate: string;
  currency: string;
  signedAt?: Date | null;
  createdAt: Date;
  deliveryAddress?: string | null;
  paymentTerms?: string | null;
  warrantyMonths?: number | null;
  penaltyClause?: string | null;
  entity: { code: string; name: string };
  supplier: {
    code: string;
    name: string;
    address?: string | null;
    rib?: string | null;
    rib_holder?: string | null;
  };
  expenseRequestRef?: string | null;
  items: ItemRow[];
  signatures: SignatureData[];
  verifyUrl?: string;
  qrDataUrl?: string;
  chainTip?: string | null;
}

export function PurchaseOrderPdf({ data }: { data: PurchaseOrderPdfData }) {
  return (
    <Document
      title={`Bon de Commande ${data.reference}`}
      author="Reliance Finance"
      subject={`BC - ${data.title}`}
    >
      <Page size="A4" style={styles.page}>
        <PdfHeader
          docType="Bon de Commande"
          reference={data.reference}
          date={data.createdAt}
          entityName={data.entity.name}
          badge={data.status === 'SIGNED' || data.status === 'ACTIVE' ? 'SIGNE' : undefined}
        />

        <Section title="Parties">
          <FieldRow
            label="Donneur d'ordre"
            value={`${data.entity.name} (${data.entity.code})`}
          />
          <FieldRow
            label="Fournisseur"
            value={`${data.supplier.name} (${data.supplier.code})`}
          />
          {data.supplier.address ? (
            <FieldRow label="Adresse" value={data.supplier.address} />
          ) : null}
          {data.supplier.rib ? (
            <FieldRow
              label="RIB (snapshot)"
              value={`${data.supplier.rib}${data.supplier.rib_holder ? ` (${data.supplier.rib_holder})` : ''}`}
            />
          ) : null}
        </Section>

        <Section title="Identification">
          <FieldRow label="Objet" value={data.title} />
          <FieldRow label="Statut" value={data.status} />
          {data.expenseRequestRef ? (
            <FieldRow label="FDA/FD source" value={data.expenseRequestRef} />
          ) : null}
          <FieldRow label="Date d'emission" value={formatDate(data.createdAt)} />
          {data.signedAt ? (
            <FieldRow label="Date de signature" value={formatDateTime(data.signedAt)} />
          ) : null}
        </Section>

        <Section title="Articles / prestations">
          <ItemsTable
            items={data.items}
            totalLabel="Total HT"
            totalAmount={formatAmount(data.amountHT, 0)}
            currency={data.currency}
          />
          <FieldRow label="TVA" value={`${data.vatRate} %`} />
          <FieldRow
            label="Total TTC"
            value={`${formatAmount(data.amountTTC, 0)} ${data.currency}`}
          />
        </Section>

        <Section title="Conditions">
          <FieldRow label="Conditions paiement" value={data.paymentTerms ?? '-'} />
          <FieldRow
            label="Garantie"
            value={data.warrantyMonths ? `${data.warrantyMonths} mois` : '-'}
          />
          <FieldRow label="Penalites de retard" value={data.penaltyClause ?? '-'} />
          {data.deliveryAddress ? (
            <FieldRow label="Lieu livraison" value={data.deliveryAddress} />
          ) : null}
        </Section>

        <Section title="Signatures (chaine cryptographique)">
          <SignatureBlock signatures={data.signatures} />
        </Section>

        <Text style={[styles.italic, { marginTop: 8 }]}>
          Toute modification du present bon de commande apres signature complete
          fait l&apos;objet d&apos;un avenant tracable dans la chaine d&apos;audit.
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
