import React from 'react';
import { View, Text, Svg, Path, Circle, StyleSheet } from '@react-pdf/renderer';
import { colors, typography, spacing, getScoreColor, getScoreLabel } from '../styles/pdfStyles';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gaugeWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 36,
    fontFamily: typography.bold,
  },
  classificationBadge: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  classificationText: {
    fontSize: typography.caption,
    fontFamily: typography.bold,
    color: colors.pageBg,
    letterSpacing: 1,
  },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

interface PDFScoreGaugeProps {
  score: number;
  size?: number;
  label?: string;
}

// Helper to create SVG arc path
const describeArc = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
};

const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

export const PDFScoreGauge: React.FC<PDFScoreGaugeProps> = ({
  score,
  size = 140,
  label = 'Score de Conformidade',
}) => {
  const scoreColor = getScoreColor(score);
  const { label: classification } = getScoreLabel(score);
  const center = size / 2;
  const radius = (size - 20) / 2; // Account for stroke width
  const strokeWidth = 12;
  
  // Calculate arc (270 degrees max, from 135 to 405)
  const startAngle = 135;
  const maxSweep = 270;
  const scoreAngle = startAngle + (score / 100) * maxSweep;
  
  // Background arc (full)
  const bgArcPath = describeArc(center, center, radius, startAngle, startAngle + maxSweep);
  // Score arc
  const scoreArcPath = score > 0 
    ? describeArc(center, center, radius, startAngle, scoreAngle)
    : '';

  return (
    <View style={styles.container}>
      <View style={[styles.gaugeWrapper, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background Arc */}
          <Path
            d={bgArcPath}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
          />
          
          {/* Score Arc */}
          {score > 0 && (
            <Path
              d={scoreArcPath}
              stroke={scoreColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
          )}
          
          {/* Inner circle for visual depth */}
          <Circle
            cx={center}
            cy={center}
            r={radius - 25}
            fill={colors.pageBg}
          />
        </Svg>
        
        {/* Score Text Overlay */}
        <View style={styles.scoreContainer}>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>
            {Math.round(score)}
          </Text>
        </View>
      </View>
      
      {/* Classification Badge */}
      <View style={[styles.classificationBadge, { backgroundColor: scoreColor }]}>
        <Text style={styles.classificationText}>{classification}</Text>
      </View>
      
      {/* Label */}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};
