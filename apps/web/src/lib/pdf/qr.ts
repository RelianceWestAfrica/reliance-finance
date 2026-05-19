// =============================================================================
// QR code helper - lien de verification d'integrite
// =============================================================================
// Chaque document genere embarque un QR vers l'endpoint de verification
// /api/audit/verify/[entityType]/[entityId]. Un scan = check de la chaine
// cryptographique SHA-256 sur l'historique du dossier.
// =============================================================================

import QRCode from 'qrcode';

export interface VerifyQrPayload {
  baseUrl: string;
  entityType: string;
  entityId: string;
}

export function buildVerifyUrl({ baseUrl, entityType, entityId }: VerifyQrPayload): string {
  // baseUrl sans trailing slash
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/api/audit/verify/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

export async function generateVerifyQrDataUrl(payload: VerifyQrPayload): Promise<string> {
  const url = buildVerifyUrl(payload);
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 160,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });
}
