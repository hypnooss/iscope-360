import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, radius, typography, getSeverityColors, getStatusColors } from '../styles/pdfStyles';

export interface PDFBadgeProps {
  // Option 1: Just pass a label with optional colors
  label?: string;
  bgColor?: string;
  textColor?: string;
  // Option 2: Pass severity directly (auto-generates label and colors)
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  // Option 3: Pass status directly (auto-generates label and colors)
  status?: 'pass' | 'fail' | 'warning' | 'pending';
}

const severityLabels: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
};

const statusLabels: Record<string, string> = {
  pass: 'OK',
  fail: 'Falha',
  warning: 'Alerta',
  pending: 'Pendente',
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: typography.tiny,
    fontFamily: typography.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export function PDFBadge({ 
  label, 
  severity,
  status,
  bgColor,
  textColor,
}: PDFBadgeProps) {
  let bg = bgColor || colors.cardBgAlt;
  let text = textColor || colors.textMuted;
  let displayLabel = label || '';

  // If severity is provided, use severity colors and label
  if (severity) {
    const severityColors = getSeverityColors(severity);
    bg = severityColors.bg;
    text = severityColors.text;
    displayLabel = label || severityLabels[severity] || severity;
  }

  // If status is provided, use status colors and label
  if (status) {
    const statusColors = getStatusColors(status);
    bg = statusColors.bg;
    text = statusColors.text;
    displayLabel = label || statusLabels[status] || status;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{displayLabel}</Text>
    </View>
  );
}
