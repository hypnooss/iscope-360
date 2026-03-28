/**
 * PDFSubdomainSection - Subdomain cards for PDF reports (dedicated page)
 */
import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';

interface SubdomainEntry {
  subdomain: string;
  sources: string[];
  addresses: Array<{ ip: string; type?: string }>;
  is_alive?: boolean;
}

interface SubdomainSummary {
  total_found: number;
  subdomains: SubdomainEntry[];
  sources: string[];
  mode: string;
}

interface PDFSubdomainSectionProps {
  subdomainSummary?: SubdomainSummary;
}

const headerColor = '#6366F1'; // Indigo

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.sectionGap,
  },
  categoryHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginBottom: 8,
    backgroundColor: headerColor,
  },
  categoryHeaderText: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: '#FFFFFF',
  },
  twoColumnContainer: {
    flexDirection: 'row',
  },
  column: {
    width: '48%',
  },
  columnLeft: {
    marginRight: '4%',
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    marginRight: 10,
    backgroundColor: colors.success,
  },
  valueContent: {
    flex: 1,
  },
  valuePrimary: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  valueSecondary: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  emptyText: {
    fontSize: typography.bodySmall,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingLeft: 20,
  },
});

const truncate = (str: string, len: number): string =>
  str.length <= len ? str : str.substring(0, len - 1) + '...';

function ValueCard({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <View style={styles.valueCard} wrap={false}>
      <View style={styles.statusDot} />
      <View style={styles.valueContent}>
        <Text style={styles.valuePrimary}>{primary}</Text>
        {secondary && <Text style={styles.valueSecondary}>{secondary}</Text>}
      </View>
    </View>
  );
}

export function PDFSubdomainSection({ subdomainSummary }: PDFSubdomainSectionProps) {
  const allSubdomains = subdomainSummary?.subdomains || [];
  const activeSubdomains = allSubdomains.filter(sub => sub.is_alive === true);

  if (activeSubdomains.length === 0) return null;

  // Build pairs for two-column layout
  const displaySubs = activeSubdomains.slice(0, 20);
  const pairs: SubdomainEntry[][] = [];
  for (let i = 0; i < displaySubs.length; i += 2) {
    pairs.push(displaySubs.slice(i, i + 2));
  }

  return (
    <View>
      <Text style={styles.pageTitle}>Subdomínios Ativos</Text>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryHeaderText}>
          Subdomínios ({activeSubdomains.length})
        </Text>
      </View>

      {pairs.map((pair, idx) => (
        <View key={idx} wrap={false} style={styles.twoColumnContainer}>
          <View style={[styles.column, styles.columnLeft]}>
            <ValueCard
              primary={truncate(pair[0].subdomain, 35)}
              secondary={pair[0].addresses?.map(a => a.ip).join(', ') || undefined}
            />
          </View>
          {pair[1] && (
            <View style={styles.column}>
              <ValueCard
                primary={truncate(pair[1].subdomain, 35)}
                secondary={pair[1].addresses?.map(a => a.ip).join(', ') || undefined}
              />
            </View>
          )}
        </View>
      ))}

      {activeSubdomains.length > 20 && (
        <Text style={styles.emptyText}>
          + {activeSubdomains.length - 20} subdomínios adicionais
        </Text>
      )}
    </View>
  );
}
