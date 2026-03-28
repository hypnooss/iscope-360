import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';
import { 
  PostureClassification, 
  getPostureClassification,
  priorityLabels,
  Priority,
} from '../data/explanatoryContent';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sectionGap,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.cardPadding,
  },
  titleContainer: {
    flex: 1,
  },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: colors.textPrimary,
  },
  postureBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postureLabel: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
  },
  description: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.cardPadding,
    lineHeight: 1.4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.cardPadding,
  },
  summaryTitle: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.textSecondary,
    marginBottom: spacing.itemGap,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countsContainer: {
    flexDirection: 'row',
  },
  countItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  countDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  countValue: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    marginRight: 4,
  },
  countLabel: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
  },
});

interface PriorityCounts {
  critical: number;
  recommended: number;
  ok: number;
}

interface PDFPostureOverviewProps {
  counts: PriorityCounts;
  domainName?: string;
}

export const PDFPostureOverview: React.FC<PDFPostureOverviewProps> = ({
  counts,
  domainName,
}) => {
  const posture = getPostureClassification(counts.critical, counts.recommended);
  
  return (
    <View style={styles.container}>
      {/* Header with Posture Badge */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.label}>Postura Geral</Text>
          <Text style={styles.title}>
            {domainName || 'Análise do Domínio'}
          </Text>
        </View>
        
        <View style={[styles.postureBadge, { backgroundColor: posture.bgColor }]}>
          <Text style={[styles.postureLabel, { color: posture.color }]}>
            {posture.label}
          </Text>
        </View>
      </View>
      
      {/* Description */}
      <Text style={styles.description}>
        {posture.description}
      </Text>
      
      {/* Divider */}
      <View style={styles.divider} />
      
      {/* Priority Counts */}
      <Text style={styles.summaryTitle}>Resumo de Verificações</Text>
      
      <View style={styles.countsContainer}>
        {/* Critical */}
        <View style={styles.countItem}>
          <View style={[styles.countDot, { backgroundColor: priorityLabels.critical.color }]} />
          <Text style={[styles.countValue, { color: priorityLabels.critical.color }]}>
            {counts.critical}
          </Text>
          <Text style={styles.countLabel}>
            {counts.critical === 1 ? 'crítico' : 'críticos'}
          </Text>
        </View>
        
        {/* Recommended */}
        <View style={styles.countItem}>
          <View style={[styles.countDot, { backgroundColor: priorityLabels.recommended.color }]} />
          <Text style={[styles.countValue, { color: priorityLabels.recommended.color }]}>
            {counts.recommended}
          </Text>
          <Text style={styles.countLabel}>
            {counts.recommended === 1 ? 'recomendação' : 'recomendações'}
          </Text>
        </View>
        
        {/* OK */}
        <View style={styles.countItem}>
          <View style={[styles.countDot, { backgroundColor: priorityLabels.ok.color }]} />
          <Text style={[styles.countValue, { color: priorityLabels.ok.color }]}>
            {counts.ok}
          </Text>
          <Text style={styles.countLabel}>
            OK
          </Text>
        </View>
      </View>
    </View>
  );
};
