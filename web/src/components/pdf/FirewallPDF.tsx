import React, { useMemo } from 'react';
import { formatDateTimeBR } from '@/lib/dateUtils';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import {
  colors,
  typography,
  spacing,
  baseStyles,
  radius,
} from './styles/pdfStyles';
import {
  PDFHeader,
  PDFFirewallInfo,
  PDFCategorySummaryTable,
  PDFFooter,
  PDFHowToRead,
  PDFPostureOverview,
  PDFExplanatoryCard,
  PDFActionPlan,
} from './sections';
import { PDFStatusIcon } from './shared/PDFStatusIcon';
import type { CategorySummary } from './sections';
import { CategoryConfig, getCategoryConfig } from '@/hooks/useCategoryConfig';
import {
  severityToPriority,
  getExplanatoryContent,
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
  // Security Notice
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
  // Status Cards Section (Licensing & Firmware)
  statusSection: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sectionGap,
  },
  statusTitle: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.itemGap,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusGrid: {
    flexDirection: 'row',
    gap: spacing.itemGap,
  },
  statusItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.itemGap,
    backgroundColor: colors.pageBg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusItemLabel: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.textPrimary,
  },
  statusItemValue: {
    fontSize: typography.caption,
    color: colors.textMuted,
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
interface SystemInfo {
  vendor?: string;
  model?: string;
  serial?: string;
  hostname?: string;
  uptime?: string;
}

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

interface StatusInfo {
  firmwareUpToDate?: boolean;
  licensingActive?: boolean;
  mfaEnabled?: boolean;
}

interface FirewallPDFProps {
  report: {
    overallScore: number;
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
    categories: ComplianceCategory[];
    generatedAt: Date | string;
    firmwareVersion?: string;
    systemInfo?: SystemInfo;
  };
  deviceInfo: {
    name: string;
    url?: string;
    vendor?: string;
    clientName?: string;
  };
  logoBase64?: string;
  categoryConfigs?: CategoryConfig[];
  statusInfo?: StatusInfo;
  correctionGuides?: CorrectionGuideData[];
}

// Helper to get guide content from database or fallback
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
      whyMatters: dbGuide.why_matters || 'Esta configuração afeta a segurança do seu firewall.',
      impacts: dbGuide.impacts || [],
      howToFix: dbGuide.how_to_fix || (fallbackRecommendation ? [fallbackRecommendation] : []),
      difficulty: dbGuide.difficulty || 'medium',
      timeEstimate: dbGuide.time_estimate || '30 min',
      providerExamples: dbGuide.provider_examples || undefined,
    };
  }
  
  return getExplanatoryContent(ruleId, fallbackName, fallbackDescription, fallbackRecommendation);
};

export const FirewallPDF: React.FC<FirewallPDFProps> = ({
  report,
  deviceInfo,
  logoBase64,
  categoryConfigs,
  statusInfo,
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

        if (check.status === 'pass') {
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

  // Device info values
  const vendor = deviceInfo.vendor || report.systemInfo?.vendor;
  const model = report.systemInfo?.model;
  const serialNumber = report.systemInfo?.serial;
  const firmware = report.firmwareVersion;
  const hostname = report.systemInfo?.hostname;
  const uptime = report.systemInfo?.uptime;
  const url = deviceInfo.url;

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

  // Group failed checks by category
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
      title={`iScope 360 - ${deviceInfo.name}`}
      author="Precisio Analytics"
      subject="Relatório de Análise de Firewall"
      keywords="compliance, security, firewall"
    >
      {/* PAGE 1: Executive Summary */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          <PDFHeader
            title="iScope 360"
            subtitle={deviceInfo.clientName}
            target={deviceInfo.name}
            date={dateString}
            reportType="Análise de Firewall"
            logoBase64={logoBase64}
          />

          <PDFHowToRead />

          <PDFPostureOverview
            counts={priorityCounts}
            domainName={deviceInfo.name}
          />
        </View>

        <PDFFooter />
      </Page>

      {/* PAGE 2: Device Info + Category Summary */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          <PDFFirewallInfo
            data={{
              vendor,
              model,
              serialNumber,
              firmware,
              hostname,
              uptime,
              url,
            }}
          />

          {/* Status Cards: Licensing & Firmware & MFA */}
          {statusInfo && (
            <View style={pageStyles.statusSection}>
              <Text style={pageStyles.statusTitle}>Licenciamento e Firmware</Text>
              <View style={pageStyles.statusGrid}>
                <View style={pageStyles.statusItem}>
                  <PDFStatusIcon status={statusInfo.firmwareUpToDate ? 'pass' : 'fail'} size={12} />
                  <View>
                    <Text style={pageStyles.statusItemLabel}>Firmware</Text>
                    <Text style={pageStyles.statusItemValue}>
                      {statusInfo.firmwareUpToDate ? 'Atualizado' : 'Desatualizado'}
                    </Text>
                  </View>
                </View>
                <View style={pageStyles.statusItem}>
                  <PDFStatusIcon status={statusInfo.licensingActive ? 'pass' : 'fail'} size={12} />
                  <View>
                    <Text style={pageStyles.statusItemLabel}>Licenciamento</Text>
                    <Text style={pageStyles.statusItemValue}>
                      {statusInfo.licensingActive ? 'Ativo' : 'Expirado'}
                    </Text>
                  </View>
                </View>
                <View style={pageStyles.statusItem}>
                  <PDFStatusIcon status={statusInfo.mfaEnabled ? 'pass' : 'fail'} size={12} />
                  <View>
                    <Text style={pageStyles.statusItemLabel}>MFA</Text>
                    <Text style={pageStyles.statusItemValue}>
                      {statusInfo.mfaEnabled ? 'Ativo' : 'Inativo'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

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
              'Revisar políticas de firewall trimestralmente',
              'Manter firmware atualizado com patches de segurança',
              'Auditar regras de acesso e VPN periodicamente',
              'Monitorar logs de segurança e alertas continuamente',
            ]}
          />
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
};
