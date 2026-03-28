import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius, tableStyles, baseStyles, getSeverityColors } from './styles/pdfStyles';
import { PDFFooter } from './sections/PDFFooter';
import { PDFBadge } from './shared/PDFBadge';
import type { M365Insight, M365Severity } from '@/types/m365Insights';

const SEVERITY_LABELS: Record<M365Severity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
};

const styles = StyleSheet.create({
  page: {
    ...baseStyles.page,
    paddingBottom: 60,
  },
  header: {
    marginBottom: spacing.sectionGap,
    padding: spacing.cardPadding,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.tight,
  },
  codeBadge: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.textSecondary,
    backgroundColor: colors.cardBgAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  title: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    marginTop: spacing.tight,
  },
  subtitle: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  thRow: {
    flexDirection: 'row',
    backgroundColor: colors.tableHeader,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: {
    padding: spacing.itemGap,
    fontFamily: typography.bold,
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  trAlt: {
    backgroundColor: colors.tableRowAlt,
  },
  td: {
    padding: spacing.itemGap,
    fontSize: typography.bodySmall,
    color: colors.textPrimary,
  },
  tdMuted: {
    padding: spacing.itemGap,
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
  },
  footer: {
    marginTop: spacing.sectionGap,
    fontSize: typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

interface M365AffectedEntitiesPDFProps {
  insight: M365Insight;
  detailKeys: string[];
}

export const M365AffectedEntitiesPDF: React.FC<M365AffectedEntitiesPDFProps> = ({ insight, detailKeys }) => {
  const totalCols = 2 + detailKeys.length;
  // Distribute widths: Name and Identifier get more space, details share the rest
  const nameWidth = detailKeys.length > 0 ? '25%' : '40%';
  const idWidth = detailKeys.length > 0 ? '30%' : '60%';
  const detailWidth = detailKeys.length > 0 ? `${Math.floor(45 / detailKeys.length)}%` : '0%';

  const sevColors = getSeverityColors(insight.severity);
  const date = new Date().toLocaleDateString('pt-BR');

  return (
    <Document>
      <Page size="A4" orientation={detailKeys.length > 2 ? 'landscape' : 'portrait'} style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.codeBadge}>{insight.code}</Text>
            <PDFBadge severity={insight.severity} />
          </View>
          <Text style={styles.title}>{insight.titulo}</Text>
          <Text style={styles.subtitle}>
            {insight.affectedCount} {insight.affectedCount === 1 ? 'item afetado' : 'itens afetados'} • Exportado em {date}
          </Text>
        </View>

        {/* Table */}
        <View style={styles.tableContainer}>
          {/* Header row */}
          <View style={styles.thRow} wrap={false}>
            <Text style={[styles.th, { width: nameWidth }]}>Nome</Text>
            <Text style={[styles.th, { width: idWidth }]}>Identificador</Text>
            {detailKeys.map(key => (
              <Text key={key} style={[styles.th, { width: detailWidth, textTransform: 'capitalize' }]}>{key}</Text>
            ))}
          </View>

          {/* Data rows */}
          {insight.affectedEntities.map((entity, idx) => (
            <View key={entity.id} style={[styles.tr, idx % 2 === 1 && styles.trAlt]} wrap={false}>
              <Text style={[styles.td, { width: nameWidth, fontFamily: typography.bold }]}>
                {entity.displayName}
              </Text>
              <Text style={[styles.tdMuted, { width: idWidth }]}>
                {entity.userPrincipalName || entity.email || '—'}
              </Text>
              {detailKeys.map(key => (
                <Text key={key} style={[styles.td, { width: detailWidth }]}>
                  {entity.details?.[key] != null ? String(entity.details[key]) : '—'}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Remaining note */}
        {insight.affectedCount > insight.affectedEntities.length && (
          <Text style={styles.footer}>
            e mais {insight.affectedCount - insight.affectedEntities.length} entidades não listadas
          </Text>
        )}

        <PDFFooter showConfidential />
      </Page>
    </Document>
  );
};
