import { View, StyleSheet } from '@react-pdf/renderer';
import { colors, radius } from '../styles/pdfStyles';

interface PDFStatusIconProps {
  status: 'pass' | 'fail' | 'warning' | 'pending' | 'unknown';
  size?: 'sm' | 'md' | 'lg' | number;
}

const sizeMap = {
  sm: 8,
  md: 12,
  lg: 16,
};

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.full,
  },
});

export function PDFStatusIcon({ status, size = 'md' }: PDFStatusIconProps) {
  // Handle both preset sizes and numeric sizes
  const dimension = typeof size === 'number' ? size : sizeMap[size];
  
  let bgColor: string;

  switch (status) {
    case 'pass':
      bgColor = colors.success;
      break;
    case 'fail':
      bgColor = colors.danger;
      break;
    case 'warning':
      bgColor = colors.warning;
      break;
    case 'pending':
    case 'unknown':
    default:
      bgColor = colors.info;
      break;
  }

  return (
    <View 
      style={[
        styles.circle, 
        { 
          backgroundColor: bgColor,
          width: dimension,
          height: dimension,
        }
      ]}
    />
  );
}
