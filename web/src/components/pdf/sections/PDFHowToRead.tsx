import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';
import { priorityLabels } from '../data/explanatoryContent';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    marginBottom: spacing.sectionGap,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
  },
  title: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.itemGap,
  },
  description: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 1.5,
    marginBottom: spacing.cardPadding,
  },
  subtitle: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.itemGap,
  },
  legendContainer: {
    marginTop: spacing.tight,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendTextContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  legendLabel: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    marginRight: 6,
  },
  legendDescription: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
});

export const PDFHowToRead: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Como Ler Este Relatório</Text>
      
      <Text style={styles.description}>
        Este relatório avalia a configuração pública do seu domínio. Cada item informa o risco, o impacto prático e como corrigir o problema.
      </Text>
      
      <Text style={styles.subtitle}>Prioridades:</Text>
      
      <View style={styles.legendContainer}>
        {/* Critical */}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: priorityLabels.critical.color }]} />
          <View style={styles.legendTextContainer}>
            <Text style={[styles.legendLabel, { color: priorityLabels.critical.color }]}>
              {priorityLabels.critical.label}
            </Text>
            <Text style={styles.legendDescription}>
              - risco real de fraude ou indisponibilidade
            </Text>
          </View>
        </View>
        
        {/* Recommended */}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: priorityLabels.recommended.color }]} />
          <View style={styles.legendTextContainer}>
            <Text style={[styles.legendLabel, { color: priorityLabels.recommended.color }]}>
              {priorityLabels.recommended.label}
            </Text>
            <Text style={styles.legendDescription}>
              - melhora resiliência e segurança
            </Text>
          </View>
        </View>
        
        {/* OK */}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: priorityLabels.ok.color }]} />
          <View style={styles.legendTextContainer}>
            <Text style={[styles.legendLabel, { color: priorityLabels.ok.color }]}>
              {priorityLabels.ok.label}
            </Text>
            <Text style={styles.legendDescription}>
              - nenhuma ação necessária
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};
