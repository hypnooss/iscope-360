import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Classification Logic
// ─────────────────────────────────────────────────────────────────────────────

type Classification = 'excellent' | 'good' | 'attention' | 'critical';

const getClassification = (score: number): Classification => {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'attention';
  return 'critical';
};

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  excellent: 'Excelente',
  good: 'Bom',
  attention: 'Atenção',
  critical: 'Crítico',
};

const CLASSIFICATION_COLORS: Record<Classification, { text: string; ring: string; glow: string }> = {
  excellent: {
    text: 'text-primary',
    ring: 'stroke-primary',
    glow: 'shadow-[0_0_30px_hsl(175_80%_45%/0.4)]',
  },
  good: {
    text: 'text-emerald-400',
    ring: 'stroke-emerald-400',
    glow: 'shadow-[0_0_30px_hsl(160_60%_45%/0.4)]',
  },
  attention: {
    text: 'text-warning',
    ring: 'stroke-warning',
    glow: 'shadow-[0_0_30px_hsl(38_92%_50%/0.4)]',
  },
  critical: {
    text: 'text-rose-400',
    ring: 'stroke-rose-400',
    glow: 'shadow-[0_0_30px_hsl(350_70%_50%/0.4)]',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Size Presets
// ─────────────────────────────────────────────────────────────────────────────

type SizePreset = 'sm' | 'md' | 'lg';

const SIZE_CONFIG: Record<SizePreset, { size: number; strokeWidth: number; fontSize: string; labelSize: string }> = {
  sm: { size: 120, strokeWidth: 8, fontSize: 'text-2xl', labelSize: 'text-xs' },
  md: { size: 160, strokeWidth: 10, fontSize: 'text-4xl', labelSize: 'text-sm' },
  lg: { size: 200, strokeWidth: 12, fontSize: 'text-5xl', labelSize: 'text-base' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component Props
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreGaugeProps {
  score: number;
  size?: SizePreset | number;
  skipAnimation?: boolean;
  loading?: boolean;
}

export function ScoreGauge({ 
  score, 
  size = 'lg', 
  skipAnimation = false,
  loading = false 
}: ScoreGaugeProps) {
  const hasAnimatedRef = useRef(false);
  const [animatedScore, setAnimatedScore] = useState(skipAnimation ? score : 0);

  // Determine config based on size prop
  const config = typeof size === 'string' 
    ? SIZE_CONFIG[size] 
    : { 
        size, 
        strokeWidth: Math.max(8, Math.round(size / 16)), 
        fontSize: size >= 180 ? 'text-5xl' : size >= 140 ? 'text-4xl' : 'text-2xl',
        labelSize: size >= 180 ? 'text-base' : size >= 140 ? 'text-sm' : 'text-xs'
      };

  const classification = getClassification(score);
  const colors = CLASSIFICATION_COLORS[classification];
  const label = CLASSIFICATION_LABELS[classification];

  // Animation effect
  useEffect(() => {
    if (loading) {
      setAnimatedScore(0);
      return;
    }

    if (skipAnimation || hasAnimatedRef.current) {
      setAnimatedScore(score);
      return;
    }

    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        hasAnimatedRef.current = true;
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.round(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [score, skipAnimation, loading]);

  const radius = (config.size - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = loading ? 0 : (animatedScore / 100) * circumference;
  const offset = circumference - progress;

  return (
    <div className={cn('relative flex flex-col items-center', colors.glow, 'rounded-full')}>
      <svg
        width={config.size}
        height={config.size}
        className="transform -rotate-90"
      >
        {/* Dark center background */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius - config.strokeWidth / 2}
          fill="hsl(220 18% 10%)"
        />
        
        {/* Background ring */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={config.strokeWidth}
          className="opacity-30"
        />
        
        {/* Progress ring */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          className={cn(colors.ring, 'transition-all duration-1000 ease-out')}
          strokeWidth={config.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : offset}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn(config.fontSize, 'font-bold tabular-nums', colors.text, loading && 'animate-pulse')}>
          {loading ? '--' : animatedScore}
        </span>
        <span className={cn(config.labelSize, 'text-muted-foreground font-medium uppercase tracking-wider')}>
          {loading ? 'Analisando...' : label}
        </span>
      </div>
    </div>
  );
}
