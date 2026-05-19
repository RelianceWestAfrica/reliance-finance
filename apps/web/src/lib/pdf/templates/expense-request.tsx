// =============================================================================
// PDF template - Dossier FDA / FD (M4)
// =============================================================================

import { Document, Page, Text, View } from '@react-pdf/renderer';

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

export interface ExpenseRequestPdfData {
  reference: string;
  type: string; // FDA / FD / FD_URGENCE
  status: string;
  title: string;
  description?: string | null;
  justification?: string | null;
  urgency: string;
  urgencyReason?: string | null;
  opexCapex: string;
  amount: string;
  currency: string;
  budgetLineRef?: string | null;
  isOutOfBudget: boolean;
  desiredDate?: Date | null;
  emergencyDeadlineAt?: Date | null;
  regularizedAt?: Date | null;
  location?: string | null;
  createdAt: Date;
  entity: { code: string; name: string };
  project?: { code: string; name: string } | null;
  costCenter?: { code: string; name: string } | null;
  supplier?: { code: string; name: string } | null;
  createdBy: { name: string | null; email: string };
  items: ItemRow[];
  signatures: SignatureData[];
  attachmentsCount: number;
  verifyUrl?: string;
  qrDataUrl?: string;
  chainTip?: string | null;
}

export function ExpenseRequestPdf({ data }: { data: ExpenseRequestPdfData }) {
  const isUrgence = data.type === 'FD_URGENCE';
  return (
    <Document
      title={`Dossier ${data.reference}`}
      author="Reliance Finance"
      subject={`${data.type} - ${data.title}`}
    >
      <Page size="A4" style={styles.page}>
        <PdfHeader
          docType={prettyType(data.type)}
          reference={data.reference}
          date={data.createdAt}
          entityName={data.entity.name}
          badge={isUrgence ? 'URGENCE' : undefined}
        />

        <Section title="Identification du dossier">
          <FieldRow label="Intitule" value={data.title} />
          <FieldRow label="Type" value={prettyType(data.type)} />
          <FieldRow label="Statut" value={data.status} />
          <FieldRow label="Entite" value={`${data.entity.name} (${data.entity.code})`} />
          {data.project ? (
            <FieldRow
              label="Projet"
              value={`${data.project.name} (${data.project.code})`}
            />
          ) : null}
          {data.costCenter ? (
            <FieldRow
              label="Centre de cout"
              value={`${data.costCenter.name} (${data.costCenter.code})`}
            />
          ) : null}
          {data.supplier ? (
            <FieldRow
              label="Fournisseur"
              value={`${data.supplier.name} (${data.supplier.code})`}
            />
          ) : null}
          <FieldRow label="Demandeur" value={data.createdBy.name ?? data.createdBy.email} />
          <FieldRow label="Date de creation" value={formatDateTime(data.createdAt)} />
          {data.desiredDate ? (
            <FieldRow label="Date souhaitee" value={formatDate(data.desiredDate)} />
          ) : null}
          {data.location ? <FieldRow label="Lieu" value={data.location} /> : null}
        </Section>

        <Section title="Cadrage financier">
          <FieldRow
            label="Montant"
            value={`${formatAmount(data.amount, 0)} ${data.currency}`}
          />
          <FieldRow label="OPEX / CAPEX" value={data.opexCapex} />
          <FieldRow label="Ligne budgetaire" value={data.budgetLineRef ?? '-'} />
          <FieldRow
            label="Hors budget"
            value={data.isOutOfBudget ? 'OUI - justification requise' : 'Non'}
          />
        </Section>

        {isUrgence ? (
          <Section title="Urgence FD_URGENCE - Conditions cumulatives (§7)">
            <FieldRow label="Niveau urgence" value={data.urgency} />
            <FieldRow label="Motivation" value={data.urgencyReason ?? '-'} />
            <FieldRow
              label="Echeance regularisation"
              value={formatDateTime(data.emergencyDeadlineAt)}
            />
            <FieldRow
              label="Regularise le"
              value={data.regularizedAt ? formatDateTime(data.regularizedAt) : 'En attente'}
            />
          </Section>
        ) : null}

        {data.description ? (
          <Section title="Description">
            <Text style={styles.fieldValue}>{data.description}</Text>
          </Section>
        ) : null}

        {data.justification ? (
          <Section title="Justification">
            <Text style={styles.fieldValue}>{data.justification}</Text>
          </Section>
        ) : null}

        <Section title="Lignes de depense">
          {data.items.length === 0 ? (
            <Text style={styles.italic}>Aucune ligne saisie.</Text>
          ) : (
            <ItemsTable
              items={data.items}
              totalLabel="Total dossier"
              totalAmount={formatAmount(data.amount, 0)}
              currency={data.currency}
            />
          )}
        </Section>

        <Section title="Signatures (chaine cryptographique)">
          <SignatureBlock signatures={data.signatures} />
        </Section>

        {data.attachmentsCount > 0 ? (
          <Section title="Pieces jointes">
            <Text style={styles.fieldValue}>
              {data.attachmentsCount} document(s) attache(s). Consultables via
              l&apos;application Reliance Finance.
            </Text>
          </Section>
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

function prettyType(t: string): string {
  switch (t) {
    case 'FDA':
      return 'Demande Fonds d\'Avance (FDA)';
    case 'FD':
      return 'Demande de Fonds (FD)';
    case 'FD_URGENCE':
      return 'FD Urgence';
    default:
      return t;
  }
}
