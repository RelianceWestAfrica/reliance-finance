// =============================================================================
// PDF template - PV de Reception (M7)
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
  formatDate,
  type ItemRow,
  type SignatureData,
} from '../components.js';

export interface ReceptionPdfData {
  reference: string;
  status: string;
  type: string; // GOODS / SERVICE / ATTACHMENT
  receivedAt: Date;
  location?: string | null;
  notes?: string | null;
  conformity: string; // FULL / PARTIAL / NON_CONFORM
  observations?: string | null;
  createdAt: Date;
  entity: { code: string; name: string };
  supplier: { code: string; name: string };
  purchaseOrderRef?: string | null;
  items: ItemRow[];
  signatures: SignatureData[];
  verifyUrl?: string;
  qrDataUrl?: string;
  chainTip?: string | null;
}

export function ReceptionPdf({ data }: { data: ReceptionPdfData }) {
  return (
    <Document
      title={`PV Reception ${data.reference}`}
      author="Reliance Finance"
      subject={`PV reception ${data.reference}`}
    >
      <Page size="A4" style={styles.page}>
        <PdfHeader
          docType="Proces-Verbal de Reception"
          reference={data.reference}
          date={data.receivedAt}
          entityName={data.entity.name}
          badge={data.conformity === 'NON_CONFORM' ? 'NON CONFORME' : undefined}
        />

        <Section title="Identification">
          <FieldRow label="Type" value={prettyReceptionType(data.type)} />
          <FieldRow label="Statut" value={data.status} />
          {data.purchaseOrderRef ? (
            <FieldRow label="BC source" value={data.purchaseOrderRef} />
          ) : null}
          <FieldRow
            label="Fournisseur"
            value={`${data.supplier.name} (${data.supplier.code})`}
          />
          <FieldRow
            label="Entite reception"
            value={`${data.entity.name} (${data.entity.code})`}
          />
          <FieldRow label="Date de reception" value={formatDate(data.receivedAt)} />
          {data.location ? <FieldRow label="Lieu" value={data.location} /> : null}
          <FieldRow label="Conformite" value={prettyConformity(data.conformity)} />
        </Section>

        <Section title="Biens / Prestations recus">
          <ItemsTable items={data.items} />
        </Section>

        {data.observations ? (
          <Section title="Observations">
            <Text style={styles.fieldValue}>{data.observations}</Text>
          </Section>
        ) : null}

        {data.notes ? (
          <Section title="Notes">
            <Text style={styles.fieldValue}>{data.notes}</Text>
          </Section>
        ) : null}

        <Section title="Signatures (Operations, Technique, Finance)">
          <SignatureBlock signatures={data.signatures} />
        </Section>

        <Text style={[styles.italic, { marginTop: 8 }]}>
          Le present PV constitue l&apos;attestation du service fait. Toute
          facturation correspondante ne pourra etre engagee sans ce document
          (procedure §M8 - regle "Sans PV = pas de paiement").
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

function prettyReceptionType(t: string): string {
  switch (t) {
    case 'GOODS':
      return 'Reception de biens';
    case 'SERVICE':
      return 'Service fait';
    case 'ATTACHMENT':
      return 'Attachement (chantier)';
    default:
      return t;
  }
}

function prettyConformity(c: string): string {
  switch (c) {
    case 'FULL':
      return 'Conforme';
    case 'PARTIAL':
      return 'Partiellement conforme';
    case 'NON_CONFORM':
      return 'Non conforme';
    default:
      return c;
  }
}
