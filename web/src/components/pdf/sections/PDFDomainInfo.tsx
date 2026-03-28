import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';
import { PDFStatusIcon } from '../shared/PDFStatusIcon';

const MAX_NAMESERVERS = 3;

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
  },
  section: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.itemGap,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '50%',
    paddingVertical: spacing.tight,
    paddingRight: spacing.itemGap,
  },
  gridItemFull: {
    width: '100%',
    paddingVertical: spacing.tight,
  },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginBottom: 2,
  },
  value: {
    fontSize: typography.bodySmall,
    color: colors.textPrimary,
    fontFamily: typography.bold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
  },
  listItem: {
    fontSize: typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 2,
    paddingLeft: 8,
  },
  moreItems: {
    fontSize: typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingLeft: 8,
    marginTop: 2,
  },
  emailAuthGrid: {
    flexDirection: 'row',
    gap: spacing.itemGap,
  },
  emailAuthItem: {
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
  emailAuthLabel: {
    fontSize: typography.bodySmall,
    fontFamily: typography.bold,
    color: colors.textPrimary,
  },
  emailAuthStatus: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
});

interface DomainInfoData {
  soa?: string;
  nameservers?: string[];
  contactEmail?: string;
  dnssec?: boolean;
  spf?: {
    valid: boolean;
    record?: string;
  };
  dkim?: {
    valid: boolean;
    selectors?: string[];
  };
  dmarc?: {
    valid: boolean;
    policy?: string;
    record?: string;
  };
}

interface PDFDomainInfoProps {
  data: DomainInfoData;
}

export const PDFDomainInfo: React.FC<PDFDomainInfoProps> = ({ data }) => {
  const {
    soa,
    nameservers = [],
    contactEmail,
    dnssec,
    spf,
    dkim,
    dmarc,
  } = data;

  return (
    <View style={styles.container}>
      {/* DNS Infrastructure */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Infraestrutura DNS</Text>
        
        <View style={styles.grid}>
          {soa && (
            <View style={styles.gridItem}>
              <Text style={styles.label}>SOA Primary</Text>
              <Text style={styles.value}>{soa}</Text>
            </View>
          )}
          
          {dnssec !== undefined && (
            <View style={styles.gridItem}>
              <Text style={styles.label}>DNSSEC</Text>
              <View style={styles.statusRow}>
                <PDFStatusIcon status={dnssec ? 'pass' : 'fail'} size={10} />
                <Text style={styles.statusLabel}>
                  {dnssec ? 'Ativo' : 'Inativo'}
                </Text>
              </View>
            </View>
          )}
          
          {contactEmail && (
            <View style={styles.gridItem}>
              <Text style={styles.label}>Contato</Text>
              <Text style={styles.value}>{contactEmail}</Text>
            </View>
          )}
        </View>

        {/* Nameservers */}
        {nameservers.length > 0 && (
          <View style={styles.gridItemFull}>
            <Text style={styles.label}>Nameservers</Text>
            {nameservers.slice(0, MAX_NAMESERVERS).map((ns, index) => (
              <Text key={index} style={styles.listItem}>
                • {ns}
              </Text>
            ))}
            {nameservers.length > MAX_NAMESERVERS && (
              <Text style={styles.moreItems}>
                + {nameservers.length - MAX_NAMESERVERS} nameserver{nameservers.length - MAX_NAMESERVERS > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Email Authentication */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Autenticação de Email</Text>
        
        <View style={styles.emailAuthGrid}>
          {/* SPF */}
          <View style={styles.emailAuthItem}>
            <PDFStatusIcon status={spf?.valid ? 'pass' : 'fail'} size={12} />
            <View>
              <Text style={styles.emailAuthLabel}>SPF</Text>
              <Text style={styles.emailAuthStatus}>
                {spf?.valid ? 'Válido' : 'Inválido'}
              </Text>
            </View>
          </View>

          {/* DKIM */}
          <View style={styles.emailAuthItem}>
            <PDFStatusIcon status={dkim?.valid ? 'pass' : 'fail'} size={12} />
            <View>
              <Text style={styles.emailAuthLabel}>DKIM</Text>
              <Text style={styles.emailAuthStatus}>
                {dkim?.valid ? 'Configurado' : 'Ausente'}
              </Text>
            </View>
          </View>

          {/* DMARC */}
          <View style={styles.emailAuthItem}>
            <PDFStatusIcon status={dmarc?.valid ? 'pass' : 'fail'} size={12} />
            <View>
              <Text style={styles.emailAuthLabel}>DMARC</Text>
              <Text style={styles.emailAuthStatus}>
                {dmarc?.valid ? `Ativo (${dmarc.policy || 'none'})` : 'Ausente'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
