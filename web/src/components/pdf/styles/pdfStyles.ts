import { StyleSheet } from '@react-pdf/renderer';

// ═══════════════════════════════════════════════════════════════
// COLOR PALETTE - Light Mode for Professional PDF Reports
// ═══════════════════════════════════════════════════════════════

export const colors = {
  // Backgrounds
  pageBg: '#FFFFFF',          // white
  cardBg: '#F8FAFC',          // slate-50
  cardBgAlt: '#F1F5F9',       // slate-100
  cardBgSubtle: '#FFFFFF',    // white
  
  // Primary (Teal - brand accent)
  primary: '#0D9488',         // teal-600
  primaryLight: '#14B8A6',    // teal-500
  primaryDark: '#0F766E',     // teal-700
  primaryMuted: '#CCFBF1',    // teal-100
  primaryBg: '#F0FDFA',       // teal-50
  
  // Text
  textPrimary: '#0F172A',     // slate-900
  textSecondary: '#475569',   // slate-600
  textMuted: '#94A3B8',       // slate-400
  textDark: '#64748B',        // slate-500
  
  // Status Colors
  success: '#16A34A',         // green-600
  successLight: '#22C55E',    // green-500
  successBg: '#F0FDF4',       // green-50
  
  warning: '#D97706',         // amber-600
  warningLight: '#F59E0B',    // amber-500
  warningBg: '#FFFBEB',       // amber-50
  
  danger: '#DC2626',          // red-600
  dangerLight: '#EF4444',     // red-500
  dangerBg: '#FEF2F2',        // red-50
  
  info: '#0284C7',            // sky-600
  infoLight: '#0EA5E9',       // sky-500
  infoBg: '#F0F9FF',          // sky-50
  
  // Severity Colors
  critical: '#DC2626',        // red-600
  criticalBg: '#FEF2F2',      // red-50
  high: '#EA580C',            // orange-600
  highBg: '#FFF7ED',          // orange-50
  medium: '#CA8A04',          // yellow-600
  mediumBg: '#FEFCE8',        // yellow-50
  low: '#0284C7',             // sky-600
  lowBg: '#F0F9FF',           // sky-50
  
  // Category Colors (saturated for headers)
  categoryDns: '#0891B2',     // cyan-600
  categoryEmail: '#7C3AED',   // violet-600
  categorySpf: '#059669',     // emerald-600
  categoryDkim: '#DB2777',    // pink-600
  categoryDmarc: '#D97706',   // amber-600
  categoryFirewall: '#4F46E5', // indigo-600
  
  // Borders
  border: '#E2E8F0',          // slate-200
  borderLight: '#F1F5F9',     // slate-100
  borderPrimary: '#0D9488',   // teal-600
  borderDanger: '#FECACA',    // red-200
  
  // Table
  tableHeader: '#F1F5F9',     // slate-100
  tableRowAlt: '#F8FAFC',     // slate-50
  tableRowHover: '#F1F5F9',   // slate-100
};

// ═══════════════════════════════════════════════════════════════
// TYPOGRAPHY
// ═══════════════════════════════════════════════════════════════

export const typography = {
  // Font sizes
  title: 24,
  heading: 16,
  subheading: 14,
  body: 10,
  bodySmall: 9,
  caption: 8,
  tiny: 7,
  
  // Font weights (Helvetica variants)
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
};

// ═══════════════════════════════════════════════════════════════
// SPACING
// ═══════════════════════════════════════════════════════════════

export const spacing = {
  page: 40,           // Page margins (top/bottom)
  pageHorizontal: 30, // Page margins (left/right)
  sectionGap: 20,     // Gap between major sections
  cardPadding: 16,    // Internal card padding
  cardGap: 12,        // Gap between cards
  itemGap: 8,         // Gap between list items
  inlineGap: 6,       // Gap between inline elements
  tight: 4,           // Tight spacing
};

// ═══════════════════════════════════════════════════════════════
// BORDER RADIUS
// ═══════════════════════════════════════════════════════════════

export const radius = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
  full: 9999,
};

// ═══════════════════════════════════════════════════════════════
// SHADOWS (as border effects since PDF doesn't support box-shadow)
// ═══════════════════════════════════════════════════════════════

export const shadows = {
  card: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPrimary: {
    borderWidth: 1,
    borderColor: colors.borderPrimary,
  },
  cardDanger: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
};

// ═══════════════════════════════════════════════════════════════
// SEVERITY HELPERS
// ═══════════════════════════════════════════════════════════════

export const getSeverityColors = (severity: string) => {
  switch (severity) {
    case 'critical':
      return { bg: colors.criticalBg, text: colors.critical, border: colors.critical };
    case 'high':
      return { bg: colors.highBg, text: colors.high, border: colors.high };
    case 'medium':
      return { bg: colors.mediumBg, text: colors.medium, border: colors.medium };
    case 'low':
      return { bg: colors.lowBg, text: colors.low, border: colors.low };
    default:
      return { bg: colors.cardBg, text: colors.textMuted, border: colors.border };
  }
};

export const getStatusColors = (status: string) => {
  switch (status) {
    case 'pass':
      return { bg: colors.successBg, text: colors.success, icon: '✓' };
    case 'fail':
      return { bg: colors.dangerBg, text: colors.danger, icon: '✗' };
    case 'warning':
      return { bg: colors.warningBg, text: colors.warning, icon: '!' };
    case 'pending':
      return { bg: colors.infoBg, text: colors.info, icon: '?' };
    default:
      return { bg: colors.cardBg, text: colors.textMuted, icon: '-' };
  }
};

export const getScoreColor = (score: number) => {
  if (score >= 75) return colors.primary;
  if (score >= 50) return colors.warning;
  return colors.danger;
};

export const getScoreLabel = (score: number): { label: string; color: string } => {
  if (score >= 75) return { label: 'BOM', color: colors.primary };
  if (score >= 50) return { label: 'REGULAR', color: colors.warning };
  return { label: 'CRÍTICO', color: colors.danger };
};

// ═══════════════════════════════════════════════════════════════
// BASE STYLES
// ═══════════════════════════════════════════════════════════════

export const baseStyles = StyleSheet.create({
  // Page
  page: {
    backgroundColor: colors.pageBg,
    paddingVertical: spacing.page,
    paddingHorizontal: spacing.pageHorizontal,
    fontFamily: typography.regular,
    fontSize: typography.body,
    color: colors.textPrimary,
  },
  
  // Layout
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  column: {
    flexDirection: 'column',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Cards
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPrimary: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
  },
  
  // Typography
  title: {
    fontSize: typography.title,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.tight,
  },
  heading: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.tight,
  },
  subheading: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.textSecondary,
  },
  body: {
    fontSize: typography.body,
    fontFamily: typography.regular,
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
  caption: {
    fontSize: typography.caption,
    fontFamily: typography.regular,
    color: colors.textMuted,
  },
  
  // Utilities
  textPrimary: {
    color: colors.primary,
  },
  textMuted: {
    color: colors.textMuted,
  },
  textSuccess: {
    color: colors.success,
  },
  textDanger: {
    color: colors.danger,
  },
  textWarning: {
    color: colors.warning,
  },
  bold: {
    fontFamily: typography.bold,
  },
  
  // Spacing utilities
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
});

// ═══════════════════════════════════════════════════════════════
// COMPONENT-SPECIFIC STYLES
// ═══════════════════════════════════════════════════════════════

export const headerStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.sectionGap,
    alignItems: 'center',
  },
  brandText: {
    fontSize: typography.title,
    fontFamily: typography.bold,
    color: colors.primary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: typography.subheading,
    fontFamily: typography.regular,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  date: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  divider: {
    width: 120,
    height: 2,
    backgroundColor: colors.primary,
    marginTop: 8,
    borderRadius: radius.full,
  },
});

export const scoreStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.cardPadding,
  },
  value: {
    fontSize: 48,
    fontFamily: typography.bold,
  },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export const statsStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.cardGap,
  },
  card: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    marginBottom: 2,
  },
  label: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});

export const issuesStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.borderDanger,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    marginTop: spacing.sectionGap,
  },
  header: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.danger,
    marginBottom: spacing.itemGap,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.tight,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    marginRight: 6,
    marginTop: 3,
  },
  itemText: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
});

export const categoryStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.sectionGap,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    marginBottom: spacing.itemGap,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  headerTitle: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.textPrimary,
  },
  headerRate: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
  },
  checkItem: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    marginBottom: spacing.tight,
    marginLeft: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.tight,
  },
  checkName: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  checkDescription: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.tight,
    lineHeight: 1.4,
  },
  recommendation: {
    fontSize: typography.bodySmall,
    color: colors.warning,
    fontFamily: typography.italic,
    marginTop: spacing.tight,
  },
});

export const footerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: spacing.page,
    left: spacing.pageHorizontal,
    right: spacing.pageHorizontal,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.itemGap,
  },
  brand: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  pageNumber: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
});

export const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: spacing.tight,
  },
  text: {
    fontSize: typography.tiny,
    fontFamily: typography.bold,
    textTransform: 'uppercase',
  },
});

export const tableStyles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.tableHeader,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCell: {
    padding: spacing.itemGap,
    fontFamily: typography.bold,
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowAlt: {
    backgroundColor: colors.tableRowAlt,
  },
  cell: {
    padding: spacing.itemGap,
    fontSize: typography.bodySmall,
    color: colors.textPrimary,
  },
});
