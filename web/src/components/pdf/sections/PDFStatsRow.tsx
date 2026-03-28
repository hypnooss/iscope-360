import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.cardGap,
    marginBottom: spacing.itemGap,
  },
  card: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 4,
  },
  value: {
    fontSize: 24,
    fontFamily: typography.bold,
    marginBottom: 4,
  },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});

export interface StatItem {
  label: string;
  value: number | string;
  color?: string;
  icon?: string;
}

interface PDFStatsRowProps {
  stats: StatItem[];
}

export const PDFStatsRow: React.FC<PDFStatsRowProps> = ({ stats }) => {
  return (
    <View style={styles.container}>
      {stats.map((stat, index) => {
        const accentColor = stat.color || colors.textMuted;
        
        return (
          <View
            key={index}
            style={[
              styles.card,
              { borderTopColor: accentColor, borderColor: accentColor },
            ]}
          >
            {/* Value */}
            <Text style={[styles.value, { color: accentColor }]}>
              {stat.value}
            </Text>
            
            {/* Label */}
            <Text style={styles.label}>{stat.label}</Text>
          </View>
        );
      })}
    </View>
  );
};

// Convenience wrapper for common compliance stats
interface ComplianceStatsProps {
  total: number;
  passed: number;
  failed: number;
  warnings?: number;
}

export const PDFComplianceStats: React.FC<ComplianceStatsProps> = ({
  total,
  passed,
  failed,
  warnings = 0,
}) => {
  const stats: StatItem[] = [
    { label: 'Total', value: total, color: colors.info },
    { label: 'Aprovadas', value: passed, color: colors.success },
    { label: 'Falhas', value: failed, color: colors.danger },
  ];
  
  if (warnings > 0) {
    stats.push({ label: 'Alertas', value: warnings, color: colors.warning });
  }
  
  return <PDFStatsRow stats={stats} />;
};
