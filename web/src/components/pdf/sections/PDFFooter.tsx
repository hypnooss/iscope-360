import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing } from '../styles/pdfStyles';

const styles = StyleSheet.create({
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
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brand: {
    fontSize: typography.caption,
    color: colors.primary,
    fontFamily: typography.bold,
  },
  separator: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginHorizontal: 6,
  },
  tagline: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageLabel: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  pageNumber: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    fontFamily: typography.bold,
  },
  confidential: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    marginRight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

interface PDFFooterProps {
  showConfidential?: boolean;
}

export const PDFFooter: React.FC<PDFFooterProps> = ({
  showConfidential = false,
}) => {
  return (
    <View style={styles.container} fixed>
      {/* Left: Brand */}
      <View style={styles.left}>
        <Text style={styles.brand}>iScope 360</Text>
        <Text style={styles.separator}>•</Text>
        <Text style={styles.tagline}>Powered by Precisio</Text>
      </View>

      {/* Right: Page Number */}
      <View style={styles.right}>
        {showConfidential && (
          <Text style={styles.confidential}>Confidencial</Text>
        )}
        <Text style={styles.pageLabel}>Página </Text>
        <Text 
          style={styles.pageNumber} 
          render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`}
        />
      </View>
    </View>
  );
};
