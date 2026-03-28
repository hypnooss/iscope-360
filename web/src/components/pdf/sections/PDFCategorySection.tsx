import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius, getScoreColor } from '../styles/pdfStyles';
import { PDFStatusIcon } from '../shared/PDFStatusIcon';
import { PDFBadge } from '../shared/PDFBadge';

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sectionGap,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    marginBottom: spacing.itemGap,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: '#FFFFFF',
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRate: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: '#FFFFFF',
  },
  headerCount: {
    fontSize: typography.bodySmall,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  checksList: {
    paddingLeft: 8,
  },
  // Expanded check item for failed checks
  checkItemFailed: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    marginBottom: spacing.itemGap,
    borderWidth: 1,
    borderColor: colors.danger,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  // Individual check item for passed checks
  checkItemPassed: {
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    marginBottom: spacing.itemGap,
    borderWidth: 1,
    borderColor: colors.success,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  checkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkName: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
  },
  checkDescription: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 1.4,
    marginTop: spacing.tight,
    marginLeft: 22,
  },
  recommendationContainer: {
    marginLeft: 22,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recommendation: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
  recommendationLabel: {
    fontFamily: typography.bold,
    color: colors.warning,
  },
});

export interface Check {
  id?: string;
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'pending' | 'unknown';
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description?: string;
  recommendation?: string;
}

interface PDFCategorySectionProps {
  name: string;
  checks: Check[];
  icon?: string;
  color?: string;
  showPassedChecks?: boolean;
}

export const PDFCategorySection: React.FC<PDFCategorySectionProps> = ({
  name,
  checks,
  color = colors.primary,
  showPassedChecks = true,
}) => {
  const passedChecks = checks.filter((c) => c.status === 'pass');
  const failedChecks = checks.filter((c) => c.status === 'fail' || c.status === 'warning');
  const applicableChecks = checks.filter((c) => (c.status as string) !== 'not_found');
  const passedCount = passedChecks.length;
  const totalCount = applicableChecks.length;
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : -1;
  
  const rateColor = getScoreColor(passRate);

  return (
    <View style={styles.container}>
      {/* Category Header */}
      <View style={[styles.header, { backgroundColor: color }]} wrap={false}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{name}</Text>
        </View>
        <View style={styles.headerStats}>
          <Text style={styles.headerCount}>
            {passedCount}/{totalCount}
          </Text>
          <Text style={styles.headerRate}>
            {passRate}%
          </Text>
        </View>
      </View>

      {/* Failed Checks (expanded with details) */}
      <View style={styles.checksList}>
        {failedChecks.map((check, index) => (
          <View key={`fail-${index}`} style={styles.checkItemFailed} wrap={false}>
            <View style={styles.checkHeader}>
              <PDFStatusIcon status={check.status} size={14} />
              <Text style={styles.checkName}>{check.name}</Text>
              {check.severity && <PDFBadge severity={check.severity} />}
            </View>

            {check.description && (
              <Text style={styles.checkDescription}>
                {check.description}
              </Text>
            )}

            {check.recommendation && (
              <View style={styles.recommendationContainer}>
                <Text style={styles.recommendation}>
                  <Text style={styles.recommendationLabel}>Recomendação: </Text>
                  {check.recommendation}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Passed Checks (individual cards) */}
      {showPassedChecks && passedChecks.length > 0 && (
        <View style={styles.checksList}>
          {passedChecks.map((check, index) => (
            <View key={`pass-${index}`} style={styles.checkItemPassed} wrap={false}>
              <View style={styles.checkHeader}>
                <PDFStatusIcon status="pass" size={14} />
                <Text style={styles.checkName}>{check.name}</Text>
              </View>
              {check.description && (
                <Text style={styles.checkDescription}>
                  {check.description}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};
