/**
 * PDFDNSMap - DNS Infrastructure Map for PDF reports
 * Layout: Category headers + individual value cards with primary/secondary lines
 * Version: 4.0.0 - Redesigned with separated header and value cards
 */
import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import {
  colors,
  typography,
  spacing,
  radius,
} from '../styles/pdfStyles';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

interface ComplianceCheck {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'pending' | 'unknown';
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description?: string;
  recommendation?: string;
  rawData?: Record<string, unknown>;
}

interface ComplianceCategory {
  name: string;
  passRate: number;
  checks: ComplianceCheck[];
}

interface NsRecord {
  host: string;
  resolvedIps: string[];
}

interface MxRecord {
  exchange: string;
  priority: number;
  ips: string[];
}

interface DkimKey {
  selector: string;
  keySize: number | null;
}

interface DmarcPolicy {
  p: string | null;
  sp: string | null;
}

interface PDFDNSMapProps {
  dnsSummary?: DnsSummary;
  emailAuth?: { spf: boolean; dkim: boolean; dmarc: boolean };
  subdomainSummary?: SubdomainSummary;
  categories: ComplianceCategory[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Colors - Header backgrounds (solid colors matching web DNS Map)
// ─────────────────────────────────────────────────────────────────────────────

const headerColors = {
  ns: '#0EA5E9',      // Sky
  soa: '#F59E0B',     // Amber
  mx: '#A855F7',      // Violet
  txt: '#EC4899',     // Pink
  subdomain: '#6366F1', // Indigo
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Page title
  pageTitle: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.sectionGap,
  },
  // Section container (category + values)
  section: {
    marginBottom: 16,
  },
  // Row container for side-by-side layout
  rowContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  halfSection: {
    width: '48%',
  },
  halfSectionLeft: {
    marginRight: '4%',
  },
  // Two-column layout for subdomains
  twoColumnContainer: {
    flexDirection: 'row',
  },
  column: {
    width: '48%',
  },
  columnLeft: {
    marginRight: '4%',
  },
  // Category header (colored bar)
  categoryHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  categoryHeaderText: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: '#FFFFFF',
  },
  // Value card (individual item)
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
  // Status dot
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    marginRight: 10,
  },
  statusDotActive: {
    backgroundColor: colors.success,
  },
  statusDotInactive: {
    backgroundColor: colors.textMuted,
  },
  // Value content
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
  // Empty state
  emptyText: {
    fontSize: typography.bodySmall,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingLeft: 20,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const extractNsRecords = (categories: ComplianceCategory[]): NsRecord[] => {
  const allChecks = categories.flatMap(c => c.checks);
  const nsCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'ns_records');
  const records = (nsCheck?.rawData as any)?.data?.records || [];
  
  return records.map((r: any) => ({
    host: r.host || r.name || r.value || 'Unknown',
    resolvedIps: Array.isArray(r.resolved_ips) ? r.resolved_ips : [],
  })).filter((ns: NsRecord) => ns.host && ns.host !== 'Unknown');
};

const extractMxRecords = (categories: ComplianceCategory[]): MxRecord[] => {
  const allChecks = categories.flatMap(c => c.checks);
  const mxCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'mx_records');
  const records = (mxCheck?.rawData as any)?.data?.records || [];
  
  return records.map((r: any) => ({
    exchange: r.exchange || r.host || 'Unknown',
    priority: r.priority || 0,
    ips: r.resolved_ips || [],
  }));
};

const extractSpfRecord = (categories: ComplianceCategory[]): string | null => {
  const allChecks = categories.flatMap(c => c.checks);
  const spfCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'spf_record');
  return (spfCheck?.rawData as any)?.data?.raw || null;
};

const extractDkimKeys = (categories: ComplianceCategory[]): DkimKey[] => {
  const allChecks = categories.flatMap(c => c.checks);
  const dkimCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'dkim_records');
  const found = (dkimCheck?.rawData as any)?.data?.found || [];
  return found.map((f: any) => ({
    selector: f.selector,
    keySize: f.key_size_bits || null,
  })).filter((k: DkimKey) => k.selector);
};

const extractDmarcPolicy = (categories: ComplianceCategory[]): DmarcPolicy => {
  const allChecks = categories.flatMap(c => c.checks);
  const dmarcCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'dmarc_record');
  const parsed = (dmarcCheck?.rawData as any)?.data?.parsed || {};
  return {
    p: parsed.p || null,
    sp: parsed.sp || null,
  };
};

const truncate = (str: string, len: number): string => {
  if (str.length <= len) return str;
  return str.substring(0, len - 1) + '...';
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryHeaderProps {
  title: string;
  color: string;
  minPresenceAhead?: number;
}

function CategoryHeader({ title, color, minPresenceAhead }: CategoryHeaderProps) {
  const headerContent = (
    <View style={[styles.categoryHeader, { backgroundColor: color }]}>
      <Text style={styles.categoryHeaderText}>{title}</Text>
    </View>
  );
  
  // Wrap with minPresenceAhead if specified
  if (minPresenceAhead) {
    return (
      <View minPresenceAhead={minPresenceAhead}>
        {headerContent}
      </View>
    );
  }
  
  return headerContent;
}

interface ValueCardProps {
  primary: string;
  secondary?: string;
  isActive?: boolean;
}

function ValueCard({ primary, secondary, isActive = true }: ValueCardProps) {
  return (
    <View style={styles.valueCard} wrap={false}>
      <View style={[
        styles.statusDot, 
        isActive ? styles.statusDotActive : styles.statusDotInactive
      ]} />
      <View style={styles.valueContent}>
        <Text style={styles.valuePrimary}>{primary}</Text>
        {secondary && (
          <Text style={styles.valueSecondary}>{secondary}</Text>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function PDFDNSMap({ dnsSummary, emailAuth, subdomainSummary, categories }: PDFDNSMapProps) {
  // Extract data
  const nsRecordsFromRaw = extractNsRecords(categories);
  const nsRecordsFallback = (dnsSummary?.ns || []).map(host => ({ host, resolvedIps: [] as string[] }));
  const nsRecords = nsRecordsFromRaw.length > 0 ? nsRecordsFromRaw : nsRecordsFallback;
  
  const mxRecords = extractMxRecords(categories);
  const spfRecord = extractSpfRecord(categories);
  const dkimKeys = extractDkimKeys(categories);
  const dmarcPolicy = extractDmarcPolicy(categories);
  
  const dnssecActive = dnsSummary?.dnssecHasDnskey || dnsSummary?.dnssecHasDs;

  // Filter only active subdomains
  const allSubdomains = subdomainSummary?.subdomains || [];
  const activeSubdomains = allSubdomains.filter(sub => sub.is_alive === true);

  return (
    <View>
      {/* Page Title */}
      <Text style={styles.pageTitle}>Mapa de Infraestrutura DNS</Text>

      {/* NS and SOA Side by Side - Keep together */}
      <View style={styles.rowContainer} wrap={false}>
        {/* NS Section */}
        <View style={[styles.halfSection, styles.halfSectionLeft]}>
          <CategoryHeader title="NS" color={headerColors.ns} />
          {nsRecords.length > 0 ? (
            nsRecords.map((ns, idx) => (
              <ValueCard 
                key={idx}
                primary={truncate(ns.host, 40)}
                secondary={ns.resolvedIps.length > 0 ? ns.resolvedIps.join(', ') : undefined}
              />
            ))
          ) : (
            <Text style={styles.emptyText}>Nenhum NS encontrado</Text>
          )}
        </View>

        {/* SOA Section */}
        <View style={styles.halfSection}>
          <CategoryHeader title="SOA" color={headerColors.soa} />
          <ValueCard 
            primary="Primary" 
            secondary={dnsSummary?.soaMname ? truncate(dnsSummary.soaMname, 40) : 'N/A'}
          />
          <ValueCard 
            primary="Contact" 
            secondary={dnsSummary?.soaContact ? truncate(dnsSummary.soaContact, 40) : 'N/A'}
          />
          <ValueCard 
            primary="DNSSEC" 
            secondary={dnssecActive ? 'Ativo' : 'Inativo'}
            isActive={dnssecActive}
          />
        </View>
      </View>

      {/* MX Section - Keep together */}
      <View style={styles.section} wrap={false}>
        <CategoryHeader title="MX" color={headerColors.mx} />
        {mxRecords.length > 0 ? (
          mxRecords.map((mx, idx) => (
            <ValueCard 
              key={idx}
              primary={truncate(mx.exchange, 60)}
              secondary={`Prioridade: ${mx.priority}${mx.ips.length > 0 ? ` - ${mx.ips.join(', ')}` : ''}`}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>Nenhum MX encontrado</Text>
        )}
      </View>

      {/* TXT (Email Auth) Section - Keep together */}
      <View style={styles.section} wrap={false}>
        <CategoryHeader title="TXT (Email Auth)" color={headerColors.txt} />
        
        {/* SPF */}
        <ValueCard 
          primary="SPF" 
          secondary={spfRecord ? truncate(spfRecord, 80) : 'Não encontrado'}
          isActive={emailAuth?.spf}
        />
        
        {/* DKIM */}
        {dkimKeys.length > 0 ? (
          dkimKeys.map((key, idx) => (
            <ValueCard 
              key={idx}
              primary={`DKIM - ${key.selector}`}
              secondary={key.keySize ? `Tamanho da chave - ${key.keySize} bits` : 'Tamanho desconhecido'}
              isActive={emailAuth?.dkim}
            />
          ))
        ) : (
          <ValueCard 
            primary="DKIM" 
            secondary="Nenhum seletor encontrado"
            isActive={false}
          />
        )}
        
        {/* DMARC */}
        <ValueCard 
          primary="DMARC" 
          secondary={
            dmarcPolicy.p 
              ? `Política: ${dmarcPolicy.p}${dmarcPolicy.sp ? ` | Política Subdomínios: ${dmarcPolicy.sp}` : ''}`
              : 'Não encontrado'
          }
          isActive={emailAuth?.dmarc}
        />
      </View>

    </View>
  );
}
