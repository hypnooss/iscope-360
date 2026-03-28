import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius, getScoreColor } from '../styles/pdfStyles';

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  title: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.itemGap,
  },
  table: {
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
  headerCellCategory: {
    flex: 3,
  },
  headerCellRate: {
    flex: 1,
    textAlign: 'center',
  },
  headerCellCount: {
    flex: 1,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowAlt: {
    backgroundColor: colors.tableRowAlt,
  },
  cell: {
    padding: spacing.itemGap,
    fontSize: typography.bodySmall,
    color: colors.textPrimary,
  },
  cellCategory: {
    flex: 3,
    fontFamily: typography.bold,
  },
  cellRate: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.bold,
  },
  cellCount: {
    flex: 1,
    textAlign: 'center',
  },
  passedCount: {
    color: colors.success,
  },
  failedCount: {
    color: colors.danger,
  },
});

export interface CategorySummary {
  name: string;
  passRate: number;
  passed: number;
  failed: number;
  total: number;
}

interface PDFCategorySummaryTableProps {
  categories: CategorySummary[];
  title?: string;
}

export const PDFCategorySummaryTable: React.FC<PDFCategorySummaryTableProps> = ({
  categories,
  title = 'Resumo por Categoria',
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      
      <View style={styles.table}>
        {/* Header Row - fixed to repeat on page breaks */}
        <View style={styles.headerRow} fixed>
          <Text style={[styles.headerCell, styles.headerCellCategory]}>Categoria</Text>
          <Text style={[styles.headerCell, styles.headerCellRate]}>Taxa</Text>
          <Text style={[styles.headerCell, styles.headerCellCount]}>Aprovadas</Text>
          <Text style={[styles.headerCell, styles.headerCellCount]}>Falhas</Text>
        </View>

        {/* Data Rows */}
        {categories.map((category, index) => {
          const isLast = index === categories.length - 1;
          const isAlt = index % 2 === 1;
          const rateColor = getScoreColor(category.passRate);
          
          return (
            <View 
              key={index} 
              style={[
                styles.row, 
                isLast && styles.rowLast,
                isAlt && styles.rowAlt,
              ]}
            >
              <Text style={[styles.cell, styles.cellCategory]}>
                {category.name}
              </Text>
              <Text style={[styles.cell, styles.cellRate, { color: rateColor }]}>
                {Math.round(category.passRate)}%
              </Text>
              <Text style={[styles.cell, styles.cellCount, styles.passedCount]}>
                {category.passed}
              </Text>
              <Text style={[styles.cell, styles.cellCount, category.failed > 0 && styles.failedCount]}>
                {category.failed}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};
