import React from 'react';
import { View, Text, Image, Svg, Defs, LinearGradient, Stop, Rect, StyleSheet } from '@react-pdf/renderer';
import { typography, spacing } from '../styles/pdfStyles';

// Dark blue header background (matching system background)
const headerBg = '#0F172A'; // slate-900 (dark blue)
const textWhite = '#FFFFFF';
const textMuted = '#94A3B8'; // slate-400
const accentTeal = '#14B8A6'; // teal-500

// Grid configuration
const GRID_SPACING = 40;
const GRID_WIDTH = 600;
const GRID_HEIGHT = 150;

const styles = StyleSheet.create({
  container: {
    backgroundColor: headerBg,
    marginLeft: -(spacing.pageHorizontal + 1),
    marginRight: -(spacing.pageHorizontal + 1),
    marginTop: -spacing.page,
    paddingVertical: spacing.sectionGap,
    marginBottom: spacing.sectionGap,
    position: 'relative',
    overflow: 'hidden',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    minHeight: 60,
    paddingHorizontal: spacing.pageHorizontal + 1,
  },
  gradientLineContainer: {
    width: '100%',
    height: 1,
    marginBottom: 16,
  },
  logoContainer: {
    position: 'absolute',
    right: spacing.pageHorizontal + 1,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: 'contain',
  },
  brandText: {
    fontSize: 22,
    fontFamily: typography.bold,
    color: accentTeal,
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 0,
    paddingHorizontal: spacing.pageHorizontal + 1,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  reportType: {
    fontSize: typography.subheading,
    fontFamily: typography.regular,
    color: textMuted,
    marginBottom: 4,
  },
  target: {
    fontSize: typography.heading,
    fontFamily: typography.bold,
    color: textWhite,
  },
  dateText: {
    fontSize: typography.body,
    color: textMuted,
    textAlign: 'right',
  },
  workspaceName: {
    fontSize: typography.body,
    color: textMuted,
    textAlign: 'right',
    marginTop: 6,
  },
});

// Generate grid lines for cyber-grid effect
const GridOverlay: React.FC = () => {
  const verticalLines = [];
  const horizontalLines = [];
  
  for (let x = 0; x <= GRID_WIDTH; x += GRID_SPACING) {
    verticalLines.push(
      <Rect key={`v${x}`} x={x} y={0} width={1} height={GRID_HEIGHT} fill={accentTeal} fillOpacity={0.05} />
    );
  }
  
  for (let y = 0; y <= GRID_HEIGHT; y += GRID_SPACING) {
    horizontalLines.push(
      <Rect key={`h${y}`} x={0} y={y} width={GRID_WIDTH} height={1} fill={accentTeal} fillOpacity={0.05} />
    );
  }
  
  return (
    <Svg style={styles.gridOverlay} viewBox={`0 0 ${GRID_WIDTH} ${GRID_HEIGHT}`}>
      {verticalLines}
      {horizontalLines}
    </Svg>
  );
};

interface PDFHeaderProps {
  title?: string;
  subtitle?: string;
  target: string;
  date: string;
  reportType?: string;
  logoBase64?: string;
}

export const PDFHeader: React.FC<PDFHeaderProps> = ({
  title = 'iScope 360',
  subtitle,
  target,
  date,
  reportType = 'Análise de Domínio Externo',
  logoBase64,
}) => {
  return (
    <View style={styles.container}>
      {/* Cyber-grid background overlay */}
      <GridOverlay />

      {/* Linha 1: Título + Logo */}
      <View style={styles.topRow}>
        <Text style={styles.brandText}>{title}</Text>
        {logoBase64 && (
          <View style={styles.logoContainer}>
            <Image style={styles.logo} src={logoBase64} />
          </View>
        )}
      </View>

      {/* Linha decorativa degradê */}
      <View style={styles.gradientLineContainer}>
        <Svg width="100%" height={1} viewBox="0 0 500 1">
          <Defs>
            <LinearGradient id="headerGradient" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.1} />
              <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="500" height="1" fill="url(#headerGradient)" />
        </Svg>
      </View>

      {/* Linha 2: Info + Metadata */}
      <View style={styles.infoRow}>
        <View style={styles.leftColumn}>
          <Text style={styles.reportType}>{reportType}</Text>
          <Text style={styles.target}>{target}</Text>
        </View>
        <View style={styles.rightColumn}>
          <Text style={styles.dateText}>Análise executada em: {date}</Text>
          {subtitle && <Text style={styles.workspaceName}>Workspace: {subtitle}</Text>}
        </View>
      </View>
    </View>
  );
};
