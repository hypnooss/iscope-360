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
  PDFDomainInfo,
  PDFCategorySummaryTable,
  PDFFooter,
  PDFDNSMap,
  PDFHowToRead,
  PDFPostureOverview,
  PDFExplanatoryCard,
  PDFActionPlan,
} from './sections';
import { PDFSubdomainSection } from './sections/PDFSubdomainSection';
import type { CategorySummary } from './sections';
import { CategoryConfig, getCategoryConfig } from '@/hooks/useCategoryConfig';
import {
  severityToPriority,
  getExplanatoryContent,
  Priority,
  ExplanatoryContent,
} from './data/explanatoryContent';

// Type for correction guides from database
export interface CorrectionGuideData {
  rule_code: string;
  friendly_title: string | null;
  what_is: string | null;
  why_matters: string | null;
  impacts: string[];
  how_to_fix: string[];
  provider_examples: string[];
  difficulty: 'low' | 'medium' | 'high' | null;
  time_estimate: string | null;
}

// Page styles
const pageStyles = StyleSheet.create({
  page: {
    ...baseStyles.page,
    paddingBottom: 60, // Space for footer
  },
  content: {
    flex: 1,
  },
  // Page titles
  pageTitle: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.sectionGap,
  },
  // Category header for grouping cards
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
  // Security Notice for DNS Map
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
  // Passed checks summary section
  passedSection: {
    marginTop: spacing.sectionGap,
  },
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
interface EmailAuthStatus {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

interface DnsSummary {
  ns?: string[];
  soaMname?: string | null;
  soaContact?: string | null;
  dnssecHasDnskey?: boolean;
  dnssecHasDs?: boolean;
  dnssecValidated?: boolean;
  dnssecNotes?: string[];
}

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

interface ExternalDomainPDFProps {
  report: {
    overallScore: number;
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
    categories: ComplianceCategory[];
    generatedAt: Date | string;
  };
  domainInfo: {
    name: string;
    domain: string;
    clientName?: string;
  };
  dnsSummary?: DnsSummary;
  emailAuth?: EmailAuthStatus;
  subdomainSummary?: SubdomainSummary;
  logoBase64?: string;
  categoryConfigs?: CategoryConfig[];
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
  // First try to find in database guides
  const dbGuide = correctionGuides?.find(g => g.rule_code === ruleId);
  
  if (dbGuide && dbGuide.friendly_title) {
    return {
      friendlyTitle: dbGuide.friendly_title || fallbackName || ruleId,
      whatIs: dbGuide.what_is || fallbackDescription || 'Verificação de configuração.',
      whyMatters: dbGuide.why_matters || 'Esta configuração afeta a segurança do seu domínio.',
      impacts: dbGuide.impacts || [],
      howToFix: dbGuide.how_to_fix || (fallbackRecommendation ? [fallbackRecommendation] : []),
      difficulty: dbGuide.difficulty || 'medium',
      timeEstimate: dbGuide.time_estimate || '30 min',
      providerExamples: dbGuide.provider_examples || undefined,
    };
  }
  
  // Fallback to hardcoded content
  return getExplanatoryContent(ruleId, fallbackName, fallbackDescription, fallbackRecommendation);
};

export const ExternalDomainPDF: React.FC<ExternalDomainPDFProps> = ({
  report,
  domainInfo,
  dnsSummary,
  emailAuth,
  subdomainSummary,
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

  // Prepare category summaries for the table (using displayName from configs)
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

  // Prepare domain info data for PDFDomainInfo
  const domainInfoData = {
    soa: dnsSummary?.soaMname || undefined,
    nameservers: dnsSummary?.ns,
    contactEmail: dnsSummary?.soaContact || undefined,
    dnssec: dnsSummary?.dnssecHasDnskey && dnsSummary?.dnssecHasDs,
    spf: emailAuth ? { valid: emailAuth.spf } : undefined,
    dkim: emailAuth ? { valid: emailAuth.dkim } : undefined,
    dmarc: emailAuth ? { valid: emailAuth.dmarc } : undefined,
  };

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
      title={`iScope 360 - ${domainInfo.name}`}
      author="Precisio Analytics"
      subject="Relatório de Análise de Domínio Externo"
      keywords="compliance, security, domain, dns, email"
    >
      {/* PAGE 1: Executive Summary */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          {/* Header */}
          <PDFHeader
            title="iScope 360"
            subtitle={domainInfo.clientName}
            target={domainInfo.domain}
            date={dateString}
            reportType="Análise de Domínio Externo"
            logoBase64={logoBase64}
          />

          {/* How to Read This Report */}
          <PDFHowToRead />

          {/* Posture Overview (replaces Score Gauge) */}
          <PDFPostureOverview
            counts={priorityCounts}
            domainName={domainInfo.domain}
          />
        </View>

        <PDFFooter />
      </Page>

      {/* PAGE 2: Infrastructure Summary */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          {/* Domain Info Panel */}
          <PDFDomainInfo data={domainInfoData} />

          {/* Category Summary Table */}
          <PDFCategorySummaryTable categories={categorySummaries} />
        </View>

        <PDFFooter />
      </Page>

      {/* PAGE 3: DNS Infrastructure Map */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.content}>
          <PDFDNSMap
            dnsSummary={dnsSummary}
            emailAuth={emailAuth}
            subdomainSummary={subdomainSummary}
            categories={report.categories}
          />
        </View>
        <PDFFooter />
      </Page>

      {/* PAGE 3b: Subdomains (dedicated page) */}
      {subdomainSummary && subdomainSummary.subdomains?.some(s => s.is_alive) && (
        <Page size="A4" style={pageStyles.page} wrap>
          <View style={pageStyles.content}>
            <PDFSubdomainSection subdomainSummary={subdomainSummary} />
          </View>
          <PDFFooter />
        </Page>
      )}

      {/* PAGE 4+: Explanatory Cards for Failed Checks */}
      {hasFailedChecks && (
        <Page size="A4" style={pageStyles.page} wrap>
          <View style={pageStyles.content}>
            <Text style={pageStyles.pageTitle}>
              Guia de Correções
            </Text>
            
            {/* Security Notice */}
            <View style={pageStyles.securityNotice}>
              <View style={pageStyles.noticeIcon}>
                <Text style={pageStyles.noticeIconText}>i</Text>
              </View>
              <Text style={pageStyles.noticeText}>
                Cada item abaixo explica o problema, por que é importante e como corrigir. 
                Siga a ordem de prioridade para máxima eficiência.
              </Text>
            </View>

            {/* Render explanatory cards grouped by category */}
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
              'Revisar política DMARC progressivamente até p=reject',
              'Monitorar relatórios DMARC mensalmente',
              'Agendar verificações trimestrais de configuração DNS',
            ]}
          />
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
};
