// =============================================================================
// PDF components reutilisables - Header, Footer, FieldRow, SignatureBlock, ...
// =============================================================================

/* eslint-disable jsx-a11y/alt-text */
import { Image, Text, View } from '@react-pdf/renderer';

import { styles, colors } from './styles.js';

// ----- Header ---------------------------------------------------------------

interface PdfHeaderProps {
  docType: string;
  reference: string;
  date: Date;
  entityName?: string | null;
  badge?: string;
}

export function PdfHeader({ docType, reference, date, entityName, badge }: PdfHeaderProps) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <Text style={styles.brand}>Reliance Finance</Text>
        <Text style={styles.brandSub}>
          {entityName ?? 'Reliance West Africa'} - Procedure Finance Holding/Filiales (Fev. 2026)
        </Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.docType}>{docType}</Text>
        <Text style={styles.docRef}>Ref. {reference}</Text>
        <Text style={styles.docDate}>{formatDate(date)}</Text>
        {badge ? <Text style={[styles.badge, { marginTop: 4 }]}>{badge}</Text> : null}
      </View>
    </View>
  );
}

// ----- Footer ---------------------------------------------------------------

interface PdfFooterProps {
  /** data URL PNG du QR de verification chaine audit */
  qrDataUrl?: string;
  /** Hash de cloture du dernier event de la chaine (8 premiers chars) */
  chainTip?: string | null;
  verifyUrl?: string;
}

export function PdfFooter({ qrDataUrl, chainTip, verifyUrl }: PdfFooterProps) {
  return (
    <View style={styles.footer} fixed>
      <View style={{ flexDirection: 'column' }}>
        <Text style={styles.footerText}>
          Document genere automatiquement par Reliance Finance. Verifiez son
          integrite en scannant le QR ou en visitant l&apos;URL ci-contre.
        </Text>
        {chainTip ? (
          <Text style={[styles.footerText, { marginTop: 2 }]}>
            Empreinte chaine audit : {chainTip}
          </Text>
        ) : null}
        {verifyUrl ? (
          <Text style={[styles.footerText, styles.mono, { marginTop: 2 }]}>
            {verifyUrl}
          </Text>
        ) : null}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </View>
      {qrDataUrl ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.footerQrLabel}>Verification</Text>
          <Image src={qrDataUrl} style={styles.footerQr} />
        </View>
      ) : null}
    </View>
  );
}

// ----- FieldRow ------------------------------------------------------------

export function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? '-'}</Text>
    </View>
  );
}

// ----- Section -------------------------------------------------------------

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ----- ItemsTable ----------------------------------------------------------

export interface ItemRow {
  position: number | string;
  description: string;
  quantity?: string | number | null;
  unit?: string | null;
  unitPrice?: string | null;
  total?: string | null;
}

export function ItemsTable({
  items,
  totalLabel,
  totalAmount,
  currency,
}: {
  items: ItemRow[];
  totalLabel?: string;
  totalAmount?: string;
  currency?: string;
}) {
  return (
    <View style={styles.table}>
      <View style={styles.thead}>
        <Text style={[styles.th, { width: '4%' }]}>N</Text>
        <Text style={[styles.th, { flex: 1 }]}>Designation</Text>
        <Text style={[styles.th, { width: '10%', textAlign: 'right' }]}>Qte</Text>
        <Text style={[styles.th, { width: '10%' }]}>Unite</Text>
        <Text style={[styles.th, { width: '18%', textAlign: 'right' }]}>P.U.</Text>
        <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Total</Text>
      </View>
      {items.map((it) => (
        <View key={String(it.position)} style={styles.tr}>
          <Text style={[styles.td, { width: '4%' }]}>{it.position}</Text>
          <Text style={[styles.td, { flex: 1 }]}>{it.description}</Text>
          <Text style={[styles.tdRight, { width: '10%' }]}>{it.quantity ?? '-'}</Text>
          <Text style={[styles.td, { width: '10%' }]}>{it.unit ?? '-'}</Text>
          <Text style={[styles.tdRight, { width: '18%' }]}>{it.unitPrice ?? '-'}</Text>
          <Text style={[styles.tdRight, { width: '20%' }]}>{it.total ?? '-'}</Text>
        </View>
      ))}
      {totalAmount ? (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{totalLabel ?? 'Total'}</Text>
          <Text style={styles.totalValue}>
            {totalAmount} {currency ?? ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ----- SignatureBlock ------------------------------------------------------

export interface SignatureData {
  role: string;
  name: string;
  date: Date;
  /** Hash chaine cryptographique (signature service) - tronquer 12 chars */
  hash?: string | null;
}

export function SignatureBlock({ signatures }: { signatures: SignatureData[] }) {
  if (signatures.length === 0) {
    return (
      <Text style={[styles.italic, { marginTop: 4 }]}>Aucune signature enregistree.</Text>
    );
  }
  return (
    <View style={styles.signaturesRow}>
      {signatures.map((s, i) => (
        <View key={`${s.role}-${i}`} style={styles.signatureBox}>
          <Text style={styles.signatureRole}>{s.role}</Text>
          <Text style={styles.signatureName}>{s.name}</Text>
          <Text style={styles.signatureDate}>{formatDateTime(s.date)}</Text>
          {s.hash ? (
            <Text style={styles.signatureHash}>{s.hash.slice(0, 16)}...</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ----- Formatters ----------------------------------------------------------

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAmount(value: { toString(): string } | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return '-';
  const n = Number(value.toString());
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Re-export colors for convenience
export { colors };
