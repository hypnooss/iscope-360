import { View, StyleSheet } from '@react-pdf/renderer';
import { colors, spacing } from '../styles/pdfStyles';
import type { Style } from '@react-pdf/types';

export interface PDFDividerProps {
  color?: string;
  thickness?: number;
  marginVertical?: number;
  width?: string | number;
  style?: Style;
}

const baseStyles = StyleSheet.create({
  divider: {
    alignSelf: 'center',
  },
});

export function PDFDivider({ 
  color = colors.border, 
  thickness = 1,
  marginVertical = spacing.itemGap,
  width = '100%',
  style,
}: PDFDividerProps) {
  return (
    <View 
      style={[
        baseStyles.divider, 
        { 
          backgroundColor: color,
          height: thickness,
          width,
          marginVertical,
        },
        style,
      ]} 
    />
  );
}

// Gradient-like divider using primary color
export function PDFPrimaryDivider({ 
  marginVertical = spacing.itemGap,
  width = 120,
  style,
}: Omit<PDFDividerProps, 'color' | 'thickness'>) {
  return (
    <View 
      style={[
        baseStyles.divider, 
        { 
          backgroundColor: colors.primary,
          height: 2,
          width,
          marginVertical,
          borderRadius: 1,
        },
        style,
      ]} 
    />
  );
}
