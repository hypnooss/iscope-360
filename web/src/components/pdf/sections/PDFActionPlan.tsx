import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';
import { priorityLabels, Priority, ExplanatoryContent } from '../data/explanatoryContent';

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sectionGap,
  },
  title: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.cardPadding,
  },
  description: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sectionGap,
    lineHeight: 1.4,
  },
  // Timeline sections
  timelineSection: {
    marginBottom: spacing.cardPadding,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.itemGap,
    paddingBottom: spacing.tight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  timelineTitle: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    flex: 1,
  },
  timelinePeriod: {
    fontSize: typography.caption,
    color: colors.textMuted,
    fontFamily: typography.italic,
  },
  // Task items
  taskList: {
    paddingLeft: 20,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  taskBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 8,
    marginTop: 5,
  },
  taskContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskName: {
    fontSize: typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  taskTime: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginLeft: 8,
  },
  // Empty state
  emptyState: {
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.success,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.success,
    fontFamily: typography.bold,
  },
  // Continuous improvement
  improvementNote: {
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    marginTop: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.info,
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
  },
  improvementTitle: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: colors.info,
    marginBottom: 4,
  },
  improvementText: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
});

interface ActionItem {
  name: string;
  timeEstimate: string;
  priority: Priority;
}

interface PDFActionPlanProps {
  immediateActions: ActionItem[];
  shortTermActions: ActionItem[];
  continuousActions?: string[];
}

export const PDFActionPlan: React.FC<PDFActionPlanProps> = ({
  immediateActions,
  shortTermActions,
  continuousActions = [],
}) => {
  const hasNoActions = immediateActions.length === 0 && shortTermActions.length === 0;
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plano de Ação Sugerido</Text>
      
      <Text style={styles.description}>
        Organize as correções por ordem de prioridade. 
        Comece pelos itens críticos e avance progressivamente para as melhorias recomendadas.
      </Text>
      
      {hasNoActions ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Parabéns! Todas as verificações passaram. Nenhuma ação necessária.
          </Text>
        </View>
      ) : (
        <>
          {/* IMEDIATO (0-7 dias) */}
          {immediateActions.length > 0 && (
            <View style={styles.timelineSection}>
              <View style={styles.timelineHeader}>
                <View style={[styles.timelineDot, { backgroundColor: priorityLabels.critical.color }]} />
                <Text style={[styles.timelineTitle, { color: priorityLabels.critical.color }]}>
                  Imediato
                </Text>
                <Text style={styles.timelinePeriod}>0-7 dias</Text>
              </View>
              
              <View style={styles.taskList}>
                {immediateActions.map((action, index) => (
                  <View key={index} style={styles.taskItem}>
                    <View style={[styles.taskBullet, { backgroundColor: priorityLabels.critical.color }]} />
                    <View style={styles.taskContent}>
                      <Text style={styles.taskName}>{action.name}</Text>
                      <Text style={styles.taskTime}>{action.timeEstimate}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
          
          {/* CURTO PRAZO (30 dias) */}
          {shortTermActions.length > 0 && (
            <View style={styles.timelineSection}>
              <View style={styles.timelineHeader}>
                <View style={[styles.timelineDot, { backgroundColor: priorityLabels.recommended.color }]} />
                <Text style={[styles.timelineTitle, { color: priorityLabels.recommended.color }]}>
                  Curto Prazo
                </Text>
                <Text style={styles.timelinePeriod}>30 dias</Text>
              </View>
              
              <View style={styles.taskList}>
                {shortTermActions.map((action, index) => (
                  <View key={index} style={styles.taskItem}>
                    <View style={[styles.taskBullet, { backgroundColor: priorityLabels.recommended.color }]} />
                    <View style={styles.taskContent}>
                      <Text style={styles.taskName}>{action.name}</Text>
                      <Text style={styles.taskTime}>{action.timeEstimate}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}
      
      {/* MELHORIA CONTÍNUA */}
      <View style={styles.improvementNote}>
        <Text style={styles.improvementTitle}>Melhoria Contínua</Text>
        <Text style={styles.improvementText}>
          {continuousActions.length > 0 
            ? continuousActions.join('. ') + '.'
            : 'Após corrigir os itens acima, agende verificações periódicas (trimestrais) para garantir que as configurações permanecem corretas. Monitore relatórios DMARC mensalmente para detectar tentativas de uso indevido do domínio.'
          }
        </Text>
      </View>
    </View>
  );
};
