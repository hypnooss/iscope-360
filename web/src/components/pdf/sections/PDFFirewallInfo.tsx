import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, radius } from '../styles/pdfStyles';
import { PDFStatusIcon } from '../shared/PDFStatusIcon';
import { PDFDivider } from '../shared/PDFDivider';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    marginBottom: spacing.sectionGap,
  },
  title: {
    fontSize: typography.subheading,
    fontFamily: typography.bold,
    color: colors.primary,
    marginBottom: spacing.itemGap,
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
  gridItemThird: {
    width: '33.33%',
    paddingVertical: spacing.tight,
    paddingRight: spacing.itemGap,
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
  section: {
    marginTop: spacing.itemGap,
  },
  sectionTitle: {
    fontSize: typography.body,
    fontFamily: typography.bold,
    color: colors.textSecondary,
    marginBottom: spacing.tight,
  },
});

interface FirewallInfoData {
  vendor?: string;
  model?: string;
  serialNumber?: string;
  firmware?: string;
  hostname?: string;
  uptime?: string;
  url?: string;
  haEnabled?: boolean;
  adminPasswordChanged?: boolean;
  syslogEnabled?: boolean;
}

interface PDFFirewallInfoProps {
  data: FirewallInfoData;
}

export const PDFFirewallInfo: React.FC<PDFFirewallInfoProps> = ({ data }) => {
  const {
    vendor,
    model,
    serialNumber,
    firmware,
    hostname,
    uptime,
    url,
    haEnabled,
    adminPasswordChanged,
    syslogEnabled,
  } = data;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Informações do Dispositivo</Text>
      
      {/* Device Info Grid */}
      <View style={styles.grid}>
        {vendor && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>Fabricante</Text>
            <Text style={styles.value}>{vendor}</Text>
          </View>
        )}
        
        {model && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>Modelo</Text>
            <Text style={styles.value}>{model}</Text>
          </View>
        )}
        
        {serialNumber && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>Número de Série</Text>
            <Text style={styles.value}>{serialNumber}</Text>
          </View>
        )}
        
        {firmware && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>Firmware</Text>
            <Text style={styles.value}>{firmware}</Text>
          </View>
        )}
        
        {hostname && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>Hostname</Text>
            <Text style={styles.value}>{hostname}</Text>
          </View>
        )}
        
        {uptime && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>Uptime</Text>
            <Text style={styles.value}>{uptime}</Text>
          </View>
        )}
        
        {url && (
          <View style={styles.gridItem}>
            <Text style={styles.label}>URL de Acesso</Text>
            <Text style={styles.value}>{url}</Text>
          </View>
        )}
      </View>

      <PDFDivider style={{ marginVertical: spacing.itemGap }} />

      {/* Security Status */}
      <Text style={styles.sectionTitle}>Status de Segurança</Text>
      <View style={styles.grid}>
        {adminPasswordChanged !== undefined && (
          <View style={styles.gridItemThird}>
            <Text style={styles.label}>Senha Admin</Text>
            <View style={styles.statusRow}>
              <PDFStatusIcon 
                status={adminPasswordChanged ? 'pass' : 'fail'} 
                size={12} 
              />
              <Text style={styles.statusLabel}>
                {adminPasswordChanged ? 'Alterada' : 'Padrão'}
              </Text>
            </View>
          </View>
        )}

        {haEnabled !== undefined && (
          <View style={styles.gridItemThird}>
            <Text style={styles.label}>Alta Disponibilidade</Text>
            <View style={styles.statusRow}>
              <PDFStatusIcon 
                status={haEnabled ? 'pass' : 'warning'} 
                size={12} 
              />
              <Text style={styles.statusLabel}>
                {haEnabled ? 'Ativo' : 'Inativo'}
              </Text>
            </View>
          </View>
        )}

        {syslogEnabled !== undefined && (
          <View style={styles.gridItemThird}>
            <Text style={styles.label}>Syslog</Text>
            <View style={styles.statusRow}>
              <PDFStatusIcon 
                status={syslogEnabled ? 'pass' : 'warning'} 
                size={12} 
              />
              <Text style={styles.statusLabel}>
                {syslogEnabled ? 'Configurado' : 'Não Configurado'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
