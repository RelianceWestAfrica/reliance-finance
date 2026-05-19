// =============================================================================
// Design tokens PDF - charte Reliance Finance
// =============================================================================
// Palette inspiree de la charte RWA. Sobre, formelle, conforme aux usages
// SYSCOHADA + procedure interne (gris/noir + accent bleu pour les signatures).
// =============================================================================

import { StyleSheet, Font } from '@react-pdf/renderer';

// Helvetica est embarque par defaut dans @react-pdf/renderer.
// On peut ajouter des polices custom plus tard (Space Grotesk, DM Sans)
// si besoin via Font.register().

export const colors = {
  text: '#0F172A',
  textMuted: '#475569',
  textLight: '#94A3B8',
  accent: '#1E40AF', // bleu officiel
  accentLight: '#DBEAFE',
  border: '#E2E8F0',
  background: '#F8FAFC',
  success: '#15803D',
  danger: '#B91C1C',
  warning: '#B45309',
} as const;

export const sizes = {
  xs: 7,
  sm: 8,
  base: 9,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 18,
  hero: 22,
} as const;

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: sizes.base,
    color: colors.text,
    paddingTop: 50,
    paddingBottom: 80,
    paddingHorizontal: 40,
  },

  // ---- Header ----
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
    marginBottom: 16,
  },
  headerLeft: { flexDirection: 'column' },
  brand: { fontSize: sizes.xl, fontFamily: 'Helvetica-Bold', color: colors.accent },
  brandSub: { fontSize: sizes.xs, color: colors.textMuted, marginTop: 2 },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end' },
  docType: { fontSize: sizes.lg, fontFamily: 'Helvetica-Bold' },
  docRef: { fontSize: sizes.sm, color: colors.textMuted, marginTop: 2 },
  docDate: { fontSize: sizes.sm, color: colors.textMuted },

  // ---- Section ----
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: sizes.md,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },

  // ---- Field row (label : value) ----
  fieldRow: { flexDirection: 'row', marginBottom: 3 },
  fieldLabel: {
    width: 130,
    color: colors.textMuted,
    fontSize: sizes.sm,
  },
  fieldValue: {
    flex: 1,
    fontSize: sizes.sm,
    color: colors.text,
  },

  // ---- Table ----
  table: { width: '100%', marginTop: 4 },
  thead: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.25,
    borderBottomColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: {
    fontSize: sizes.sm,
    fontFamily: 'Helvetica-Bold',
    color: colors.textMuted,
  },
  td: { fontSize: sizes.sm },
  tdRight: { fontSize: sizes.sm, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingHorizontal: 4,
    marginTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: colors.text,
  },
  totalLabel: {
    flex: 1,
    fontSize: sizes.sm,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    paddingRight: 8,
  },
  totalValue: {
    fontSize: sizes.md,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
  },

  // ---- Signatures ----
  signaturesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 10,
  },
  signatureBox: {
    width: 160,
    minHeight: 70,
    padding: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  signatureRole: {
    fontSize: sizes.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  signatureName: {
    fontSize: sizes.sm,
    fontFamily: 'Helvetica-Bold',
    marginTop: 2,
  },
  signatureDate: { fontSize: sizes.xs, color: colors.textMuted, marginTop: 2 },
  signatureHash: {
    fontSize: sizes.xs,
    color: colors.textLight,
    marginTop: 6,
    fontFamily: 'Courier',
  },

  // ---- Footer ----
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  footerText: {
    fontSize: sizes.xs,
    color: colors.textMuted,
    maxWidth: 380,
  },
  footerQrLabel: {
    fontSize: sizes.xs,
    color: colors.textMuted,
    marginBottom: 2,
    textAlign: 'right',
  },
  footerQr: { width: 50, height: 50 },
  pageNumber: {
    fontSize: sizes.xs,
    color: colors.textLight,
  },

  // Misc
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.accentLight,
    color: colors.accent,
    fontSize: sizes.xs,
    fontFamily: 'Helvetica-Bold',
  },
  italic: { fontStyle: 'italic', color: colors.textMuted },
  mono: { fontFamily: 'Courier', fontSize: sizes.xs },
});

// Re-export Font registration helper for future custom font installs
export { Font };
