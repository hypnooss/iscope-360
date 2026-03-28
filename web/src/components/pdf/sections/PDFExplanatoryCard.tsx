import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';
import { 
  Priority, 
  Difficulty,
  priorityLabels, 
  difficultyLabels,
  ExplanatoryContent,
} from '../data/explanatoryContent';

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    marginBottom: spacing.cardGap,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.itemGap,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.textPrimary,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  priorityText: {
    fontSize: typography.caption,
    fontFamily: typography.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Sections
  section: {
    marginBottom: spacing.itemGap,
  },
  sectionLabel: {
    fontSize: typography.caption,
    fontFamily: typography.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sectionText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
  // Impacts list
  impactsList: {
    marginTop: 2,
  },
  impactItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  impactBullet: {
    fontSize: typography.body,
    color: colors.textMuted,
    marginRight: 6,
    marginTop: -1,
  },
  impactText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 1.4,
  },
  // How to fix
  fixStepsList: {
    marginTop: 2,
  },
  fixStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  fixStepNumber: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: colors.primary,
    width: 16,
  },
  fixStepText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 1.4,
  },
  // Footer with metadata
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: spacing.itemGap,
    paddingTop: spacing.itemGap,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  metaLabel: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginRight: 4,
  },
  metaValue: {
    fontSize: typography.caption,
    fontFamily: typography.bold,
    color: colors.textSecondary,
  },
});

interface PDFExplanatoryCardProps {
  content: ExplanatoryContent;
  priority: Priority;
  originalName?: string;
}

export const PDFExplanatoryCard: React.FC<PDFExplanatoryCardProps> = ({
  content,
  priority,
  originalName,
}) => {
  const priorityConfig = priorityLabels[priority];
  
  // Determine card colors based on priority
  const getCardColors = () => {
    switch (priority) {
      case 'critical':
        return {
          bg: colors.dangerBg,
          border: colors.danger,
        };
      case 'recommended':
        return {
          bg: colors.warningBg,
          border: colors.warning,
        };
      default:
        return {
          bg: colors.successBg,
          border: colors.success,
        };
    }
  };
  
  const cardColors = getCardColors();
  
  return (
    <View 
      style={[
        styles.container, 
        { 
          backgroundColor: cardColors.bg,
          borderColor: cardColors.border,
          borderLeftColor: cardColors.border,
        }
      ]}
      wrap={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{content.friendlyTitle}</Text>
        </View>
        
        <View style={[styles.priorityBadge, { backgroundColor: `${priorityConfig.color}15` }]}>
          <View style={[styles.priorityDot, { backgroundColor: priorityConfig.color }]} />
          <Text style={[styles.priorityText, { color: priorityConfig.color }]}>
            {priorityConfig.label}
          </Text>
        </View>
      </View>
      
      {/* O QUE É */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>O que é</Text>
        <Text style={styles.sectionText}>{content.whatIs}</Text>
      </View>
      
      {/* POR QUE IMPORTA */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Por que importa</Text>
        <Text style={styles.sectionText}>{content.whyMatters}</Text>
      </View>
      
      {/* IMPACTO POSSÍVEL */}
      {content.impacts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Impacto possível</Text>
          <View style={styles.impactsList}>
            {content.impacts.slice(0, 4).map((impact, index) => (
              <View key={index} style={styles.impactItem}>
                <Text style={styles.impactBullet}>-</Text>
                <Text style={styles.impactText}>{impact}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      
      {/* COMO CORRIGIR */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Como corrigir</Text>
        <View style={styles.fixStepsList}>
          {content.howToFix.slice(0, 6).map((step, index) => (
            <View key={index} style={styles.fixStepItem}>
              <Text style={styles.fixStepNumber}>{index + 1}.</Text>
              <Text style={styles.fixStepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
      
      {/* Footer with difficulty and time */}
      <View style={styles.footer}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Dificuldade:</Text>
          <Text style={styles.metaValue}>{difficultyLabels[content.difficulty]}</Text>
        </View>
        
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Tempo estimado:</Text>
          <Text style={styles.metaValue}>{content.timeEstimate}</Text>
        </View>
      </View>
    </View>
  );
};
