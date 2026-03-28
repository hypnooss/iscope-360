import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius, getSeverityColors } from '../styles/pdfStyles';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.danger,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    marginTop: spacing.sectionGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.itemGap,
    gap: 8,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 14,
    fontFamily: typography.bold,
    color: colors.pageBg,
  },
  title: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.danger,
    flex: 1,
  },
  count: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.textMuted,
  },
  issuesList: {
    marginTop: spacing.tight,
  },
  issueItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingLeft: 4,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
    marginTop: 4,
  },
  issueContent: {
    flex: 1,
  },
  issueName: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    marginBottom: 1,
  },
  issueDescription: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    lineHeight: 1.3,
  },
  truncatedNote: {
    fontSize: typography.caption,
    color: colors.textMuted,
    fontFamily: typography.italic,
    marginTop: spacing.itemGap,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.cardPadding,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.success,
    fontFamily: typography.bold,
  },
  // Success container style
  containerSuccess: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
    borderLeftColor: colors.success,
  },
});

export interface Issue {
  name: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category?: string;
}

interface PDFIssuesSummaryProps {
  issues: Issue[];
  maxItems?: number;
  title?: string;
}

export const PDFIssuesSummary: React.FC<PDFIssuesSummaryProps> = ({
  issues,
  maxItems = 15,
  title = 'Problemas Encontrados',
}) => {
  const displayedIssues = issues.slice(0, maxItems);
  const hiddenCount = issues.length - displayedIssues.length;

  // If no issues, show success state
  if (issues.length === 0) {
    return (
      <View style={[styles.container, styles.containerSuccess]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Nenhum problema encontrado
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>!</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>({issues.length})</Text>
      </View>

      {/* Issues List */}
      <View style={styles.issuesList}>
        {displayedIssues.map((issue, index) => {
          const severityColors = getSeverityColors(issue.severity);
          
          return (
            <View key={index} style={styles.issueItem}>
              <View 
                style={[styles.bullet, { backgroundColor: severityColors.text }]} 
              />
              <View style={styles.issueContent}>
                <Text style={styles.issueName}>{issue.name}</Text>
                {issue.description && (
                  <Text style={styles.issueDescription}>
                    {issue.description}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Truncation Note */}
      {hiddenCount > 0 && (
        <Text style={styles.truncatedNote}>
          ... e mais {hiddenCount} problema{hiddenCount > 1 ? 's' : ''} não exibido{hiddenCount > 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
};
