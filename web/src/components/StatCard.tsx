import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  variant: 'success' | 'destructive' | 'warning' | 'default';
  delay?: number;
  compact?: boolean;
  onClick?: () => void;
  active?: boolean;
}

const variantStyles = {
  success: 'border-success/30 bg-success/5',
  destructive: 'border-destructive/30 bg-destructive/5',
  warning: 'border-warning/30 bg-warning/5',
  default: 'border-primary/30 bg-primary/5',
};

const iconStyles = {
  success: 'text-success bg-success/10',
  destructive: 'text-destructive bg-destructive/10',
  warning: 'text-warning bg-warning/10',
  default: 'text-primary bg-primary/10',
};

const valueStyles = {
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
  default: 'text-primary',
};

const ringStyles = {
  success: 'ring-success',
  destructive: 'ring-destructive',
  warning: 'ring-warning',
  default: 'ring-primary',
};

export function StatCard({ title, value, icon: Icon, variant, delay = 0, compact = false, onClick, active = false }: StatCardProps) {
  return (
    <div 
      className={cn(
        "glass-card rounded-xl border animate-fade-in",
        compact ? "p-3" : "p-4",
        variantStyles[variant],
        onClick && "cursor-pointer hover:scale-[1.02] transition-transform",
        active && `ring-2 ring-offset-1 ${ringStyles[variant]}`
      )}
      style={{ animationDelay: `${delay}s` }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={cn("text-muted-foreground mb-1", compact ? "text-xs" : "text-sm")}>{title}</p>
          <p className={cn("font-bold tabular-nums", compact ? "text-xl" : "text-2xl", valueStyles[variant])}>
            {value}
          </p>
        </div>
        <div className={cn("rounded-lg", compact ? "p-1.5" : "p-2", iconStyles[variant])}>
          <Icon className={compact ? "w-4 h-4" : "w-5 h-5"} />
        </div>
      </div>
    </div>
  );
}
