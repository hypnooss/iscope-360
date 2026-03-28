import { cn } from '@/lib/utils';

interface M365ScoreGaugeProps {
  score: number;
  classification: 'excellent' | 'good' | 'attention' | 'critical';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  excellent: 'Excelente',
  good: 'Bom',
  attention: 'Atenção',
  critical: 'Crítico',
};

const CLASSIFICATION_COLORS: Record<string, { text: string; ring: string; glow: string }> = {
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

const SIZE_CONFIG = {
  sm: { size: 120, strokeWidth: 8, fontSize: 'text-2xl', labelSize: 'text-xs' },
  md: { size: 160, strokeWidth: 10, fontSize: 'text-4xl', labelSize: 'text-sm' },
  lg: { size: 200, strokeWidth: 12, fontSize: 'text-5xl', labelSize: 'text-base' },
};

export function M365ScoreGauge({ 
  score, 
  classification, 
  size = 'md',
  loading = false 
}: M365ScoreGaugeProps) {
  const config = SIZE_CONFIG[size];
  const colors = CLASSIFICATION_COLORS[classification];
  const label = CLASSIFICATION_LABELS[classification];
  
  const radius = (config.size - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = loading ? 0 : (score / 100) * circumference;
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
        <span className={cn(config.fontSize, 'font-bold', colors.text, loading && 'animate-pulse')}>
          {loading ? '--' : score}
        </span>
        <span className={cn(config.labelSize, 'text-muted-foreground font-medium uppercase tracking-wider')}>
          {loading ? 'Analisando...' : label}
        </span>
      </div>
    </div>
  );
}
