import React, { useMemo } from 'react';
import { formatDateTimeBR } from '@/lib/dateUtils';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import {
  colors,
  typography,
  spacing,
  baseStyles,
} from './styles/pdfStyles';
import {
  PDFHeader,
  PDFCategorySummaryTable,
  PDFFooter,
  PDFHowToRead,
  PDFPostureOverview,
  PDFExplanatoryCard,
  PDFActionPlan,
} from './sections';
import type { CategorySummary } from './sections';
import { CategoryConfig, getCategoryConfig } from '@/hooks/useCategoryConfig';
import {
  severityToPriority,
  Priority,
  ExplanatoryContent,
} from './data/explanatoryContent';
import type { CorrectionGuideData } from './ExternalDomainPDF';

// Page styles
const pageStyles = StyleSheet.create({
  page: {
    ...baseStyles.page,
    paddingBottom: 60,
  },
  content: {
    flex: 1,
  },
  pageTitle: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.sectionGap,
  },
  categoryHeader: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.itemGap,
    marginTop: spacing.sectionGap,
    paddingBottom: spacing.tight,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  noticeIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3B82F6',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeIconText: {
    fontSize: 12,
    fontFamily: typography.bold,
    color: '#FFFFFF',
  },
  noticeText: {
    flex: 1,
    fontSize: typography.bodySmall,
    color: '#1E40AF',
    lineHeight: 1.4,
  },
  // Tenant info section
  tenantInfoSection: {
    backgroundColor: colors.cardBg,
    borderRadius: 6,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sectionGap,
  },
  tenantInfoTitle: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.itemGap,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tenantInfoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  tenantInfoLabel: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: colors.textSecondary,
    width: 120,
  },
  tenantInfoValue: {
    fontSize: typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  // Passed checks
  passedTitle: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.success,
    marginBottom: spacing.itemGap,
  },
  passedList: {
    backgroundColor: colors.successBg,
    borderRadius: 6,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.success,
  },
  passedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  passedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 8,
  },
  passedText: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
});

// Types
interface ComplianceCategory {
  name: string;
  passRate: number;
  checks: Array<{
    id: string;
    name: string;
    status: 'pass' | 'fail' | 'warning' | 'pending' | 'unknown';
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
    description?: string;
    recommendation?: string;
  }>;
}

interface M365PosturePDFProps {
  report: {
    overallScore: number;
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
    categories: ComplianceCategory[];
    generatedAt: Date | string;
  };
  tenantInfo: {
    name: string;
    domain: string;
    clientName?: string;
  };
  logoBase64?: string;
  categoryConfigs?: CategoryConfig[];
  correctionGuides?: CorrectionGuideData[];
}

// Helper to get guide content from database or M365-specific fallback
const getGuideContent = (
  ruleId: string,
  correctionGuides: CorrectionGuideData[] | undefined,
  fallbackName?: string,
  fallbackDescription?: string,
  fallbackRecommendation?: string
): ExplanatoryContent => {
  const dbGuide = correctionGuides?.find(g => g.rule_code === ruleId);
  
  if (dbGuide && dbGuide.friendly_title) {
    return {
      friendlyTitle: dbGuide.friendly_title || fallbackName || ruleId,
      whatIs: dbGuide.what_is || fallbackDescription || 'Verificação de configuração.',
      whyMatters: dbGuide.why_matters || 'Esta configuração afeta a segurança do seu ambiente Microsoft 365.',
      impacts: dbGuide.impacts || [],
      howToFix: dbGuide.how_to_fix || (fallbackRecommendation ? [fallbackRecommendation] : []),
      difficulty: dbGuide.difficulty || 'medium',
      timeEstimate: dbGuide.time_estimate || '30 min',
      providerExamples: dbGuide.provider_examples || undefined,
    };
  }
  
  // M365-specific fallback (instead of domain-oriented generic)
  return {
    friendlyTitle: fallbackName || ruleId,
    whatIs: fallbackDescription || 'Verificação de configuração do Microsoft 365.',
    whyMatters: 'Esta configuração afeta a segurança do seu ambiente Microsoft 365.',
    impacts: [
      'Possíveis riscos de segurança no tenant',
      'Exposição a acessos não autorizados',
    ],
    howToFix: fallbackRecommendation
      ? [fallbackRecommendation]
      : ['Acesse o portal de administração do Microsoft 365 e revise esta configuração.'],
    difficulty: 'medium',
    timeEstimate: '30 min',
  };
};

export const M365PosturePDF: React.FC<M365PosturePDFProps> = ({
  report,
  tenantInfo,
  logoBase64,
  categoryConfigs,
  correctionGuides,
}) => {
  const generatedDate = report.generatedAt instanceof Date
    ? report.generatedAt
    : new Date(report.generatedAt);

  const dateString = formatDateTimeBR(generatedDate);

  // Sort categories by display_order from configs
  const sortedCategories = useMemo(() => {
    return [...report.categories].sort((a, b) => {
      const configA = categoryConfigs?.find(c => c.name === a.name);
      const configB = categoryConfigs?.find(c => c.name === b.name);
      return (configA?.display_order ?? 999) - (configB?.display_order ?? 999);
    });
  }, [report.categories, categoryConfigs]);

  // Categorize checks by priority
  const categorizedChecks = useMemo(() => {
    const critical: Array<{ check: ComplianceCategory['checks'][0]; category: string; categoryDisplayName: string }> = [];
    const recommended: Array<{ check: ComplianceCategory['checks'][0]; category: string; categoryDisplayName: string }> = [];
    const passed: Array<{ check: ComplianceCategory['checks'][0]; category: string; categoryDisplayName: string }> = [];

    sortedCategories.forEach(cat => {
      const config = getCategoryConfig(categoryConfigs, cat.name);
      cat.checks.forEach(check => {
        const priority = check.status === 'pass' 
          ? 'ok' 
          : severityToPriority(check.severity);
        
        const item = { 
          check, 
          category: cat.name,
          categoryDisplayName: config.displayName,
        };

        if (check.status === 'pass' || priority === 'ok') {
          passed.push(item);
        } else if (priority === 'critical') {
          critical.push(item);
        } else {
          recommended.push(item);
        }
      });
    });

    return { critical, recommended, passed };
  }, [sortedCategories, categoryConfigs]);

  // Priority counts for posture overview
  const priorityCounts = {
    critical: categorizedChecks.critical.length,
    recommended: categorizedChecks.recommended.length,
    ok: categorizedChecks.passed.length,
  };

  // Prepare category summaries for the table
  const categorySummaries: CategorySummary[] = sortedCategories.map((cat) => {
    const config = getCategoryConfig(categoryConfigs, cat.name);
    const passedCount = cat.checks.filter((c) => c.status === 'pass').length;
    const failedCount = cat.checks.filter((c) => c.status === 'fail').length;
    const total = cat.checks.length;
    return {
      name: config.displayName,
      passRate: total > 0 ? Math.round((passedCount / total) * 100) : 0,
      passed: passedCount,
      failed: failedCount,
      total,
    };
  });

  // Build action plan items
  const immediateActions = categorizedChecks.critical.map(item => {
    const content = getGuideContent(
      item.check.id,
      correctionGuides,
      item.check.name,
      item.check.description,
      item.check.recommendation
    );
    return {
      name: content.friendlyTitle,
      timeEstimate: content.timeEstimate,
      priority: 'critical' as Priority,
    };
  });

  const shortTermActions = categorizedChecks.recommended.map(item => {
    const content = getGuideContent(
      item.check.id,
      correctionGuides,
      item.check.name,
      item.check.description,
      item.check.recommendation
    );
    return {
      name: content.friendlyTitle,
      timeEstimate: content.timeEstimate,
      priority: 'recommended' as Priority,
    };
  });

  // Group failed checks by category for the detail pages
  const failedByCategory = useMemo(() => {
    const grouped: Record<string, Array<{ check: ComplianceCategory['checks'][0]; priority: Priority }>> = {};
    
    [...categorizedChecks.critical, ...categorizedChecks.recommended].forEach(item => {
      if (!grouped[item.categoryDisplayName]) {
        grouped[item.categoryDisplayName] = [];
      }
      grouped[item.categoryDisplayName].push({
        check: item.check,
        priority: item.check.status === 'pass' 
          ? 'ok' 
          : severityToPriority(item.check.severity),
      });
    });
    
    return grouped;
  }, [categorizedChecks]);

  const hasFailedChecks = categorizedChecks.critical.length > 0 || categorizedChecks.recommended.length > 0;

  return (
    <Document
      title={`iScope 360 - ${tenantInfo.name}`}
      author="Precisio Analytics"
      subject="Relatório de Compliance Microsoft 365"
      keywords="compliance, security, m365, microsoft"
    >
      {/* PAGE 1: Executive Summary */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          <PDFHeader
            title="iScope 360"
            subtitle={tenantInfo.clientName}
            target={tenantInfo.domain}
            date={dateString}
            reportType="Compliance Microsoft 365"
            logoBase64={logoBase64}
          />

          <PDFHowToRead />

          <PDFPostureOverview
            counts={priorityCounts}
            domainName={tenantInfo.name}
          />
        </View>

        <PDFFooter />
      </Page>

      {/* PAGE 2: Tenant Info + Category Summary */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          {/* Tenant Info Panel */}
          <View style={pageStyles.tenantInfoSection}>
            <Text style={pageStyles.tenantInfoTitle}>Informações do Tenant</Text>
            <View style={pageStyles.tenantInfoRow}>
              <Text style={pageStyles.tenantInfoLabel}>Tenant:</Text>
              <Text style={pageStyles.tenantInfoValue}>{tenantInfo.name}</Text>
            </View>
            <View style={pageStyles.tenantInfoRow}>
              <Text style={pageStyles.tenantInfoLabel}>Domínio:</Text>
              <Text style={pageStyles.tenantInfoValue}>{tenantInfo.domain}</Text>
            </View>
            {tenantInfo.clientName && (
              <View style={pageStyles.tenantInfoRow}>
                <Text style={pageStyles.tenantInfoLabel}>Organização:</Text>
                <Text style={pageStyles.tenantInfoValue}>{tenantInfo.clientName}</Text>
              </View>
            )}
            <View style={pageStyles.tenantInfoRow}>
              <Text style={pageStyles.tenantInfoLabel}>Última Coleta:</Text>
              <Text style={pageStyles.tenantInfoValue}>{dateString}</Text>
            </View>
          </View>

          <PDFCategorySummaryTable categories={categorySummaries} />
        </View>

        <PDFFooter />
      </Page>

      {/* PAGE 3+: Guia de Correções */}
      {hasFailedChecks && (
        <Page size="A4" style={pageStyles.page} wrap>
          <View style={pageStyles.content}>
            <Text style={pageStyles.pageTitle}>
              Guia de Correções
            </Text>
            
            <View style={pageStyles.securityNotice}>
              <View style={pageStyles.noticeIcon}>
                <Text style={pageStyles.noticeIconText}>i</Text>
              </View>
              <Text style={pageStyles.noticeText}>
                Cada item abaixo explica o problema, por que é importante e como corrigir. 
                Siga a ordem de prioridade para máxima eficiência.
              </Text>
            </View>

            {Object.entries(failedByCategory).map(([categoryName, items]) => (
              <View key={categoryName}>
                {items.map((item, index) => {
                  const content = getGuideContent(
                    item.check.id,
                    correctionGuides,
                    item.check.name,
                    item.check.description,
                    item.check.recommendation
                  );

                  if (index === 0) {
                    return (
                      <View key={`${item.check.id}-${index}`} wrap={false}>
                        <Text style={pageStyles.categoryHeader}>{categoryName}</Text>
                        <PDFExplanatoryCard
                          content={content}
                          priority={item.priority}
                          originalName={item.check.name}
                        />
                      </View>
                    );
                  }

                  return (
                    <PDFExplanatoryCard
                      key={`${item.check.id}-${index}`}
                      content={content}
                      priority={item.priority}
                      originalName={item.check.name}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          <PDFFooter />
        </Page>
      )}

      {/* Passed checks - dedicated page */}
      {categorizedChecks.passed.length > 0 && (
        <Page size="A4" style={pageStyles.page} wrap>
          <View style={pageStyles.content}>
            <Text style={pageStyles.passedTitle}>
              Verificações Aprovadas ({categorizedChecks.passed.length})
            </Text>
            <View style={pageStyles.passedList}>
              {categorizedChecks.passed.map((item, index) => (
                <View key={index} style={pageStyles.passedItem}>
                  <View style={pageStyles.passedDot} />
                  <Text style={pageStyles.passedText}>{item.check.name}</Text>
                </View>
              ))}
            </View>
          </View>
          <PDFFooter />
        </Page>
      )}

      {/* FINAL PAGE: Action Plan */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          <PDFActionPlan
            immediateActions={immediateActions}
            shortTermActions={shortTermActions}
            continuousActions={[
              'Revisar permissões de aplicações OAuth trimestralmente',
              'Monitorar atividades de administradores privilegiados',
              'Auditar configurações de segurança do Exchange mensalmente',
              'Manter políticas de acesso condicional atualizadas',
            ]}
          />
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
};
