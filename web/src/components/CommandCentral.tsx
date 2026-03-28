import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ScoreGauge } from './ScoreGauge';

interface MiniStatProps {
  value: number;
  label: string;
  variant?: "default" | "primary" | "success" | "destructive";
}

export function MiniStat({ value, label, variant = "default" }: MiniStatProps) {
  const variantStyles = {
    default: { text: "text-foreground", border: "border-border/30", bg: "bg-background/50" },
    primary: { text: "text-sky-400", border: "border-sky-500/30", bg: "bg-sky-500/10" },
    success: { text: "text-primary", border: "border-primary/30", bg: "bg-primary/10" },
    destructive: { text: "text-rose-400", border: "border-rose-500/30", bg: "bg-rose-500/10" }
  };
  const style = variantStyles[variant];

  return (
    <div className={cn("text-center px-4 py-2 rounded-lg border min-w-[100px]", style.bg, style.border)}>
      <span className={cn("text-xl font-bold tabular-nums block", style.text)}>{value}</span>
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string | string[];
  highlight?: boolean;
  indicator?: "success" | "error";
}

export function DetailRow({ label, value, highlight, indicator }: DetailRowProps) {
  const isMultiline = Array.isArray(value);
  
  return (
    <div className="group">
      <div className="flex items-start gap-3 py-2">
        <span className="text-xs text-muted-foreground w-24 flex-shrink-0 uppercase tracking-wide pt-0.5">
          {label}
        </span>
        <div className="flex-1 min-w-0 flex items-center">
          {indicator && (
            <span 
              className={cn(
                "inline-block w-2 h-2 rounded-full mr-2 flex-shrink-0",
                indicator === "success" 
                  ? "bg-emerald-400 shadow-[0_0_6px_hsl(142_76%_60%/0.5)]" 
                  : "bg-rose-400 shadow-[0_0_6px_hsl(0_72%_60%/0.5)]"
              )} 
            />
          )}
          {isMultiline ? (
            <div className="space-y-0.5">
              {value.map((v, i) => (
                <div key={i} className={cn("text-sm font-medium", highlight ? "text-primary" : "text-foreground")}>
                  {v}
                </div>
              ))}
            </div>
          ) : (
            <span className={cn("text-sm font-medium truncate", highlight ? "text-primary" : "text-foreground")}>
              {value}
            </span>
          )}
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-border/50 via-border/20 to-transparent" />
    </div>
  );
}

interface CommandCentralLayoutProps {
  title: string;
  score: number;
  skipGaugeAnimation?: boolean;
  miniStats: ReactNode;
  detailRows: ReactNode;
}

export function CommandCentralLayout({ title, score, skipGaugeAnimation, miniStats, detailRows }: CommandCentralLayoutProps) {
  return (
    <div className="max-w-full mb-8">
      <div 
        className="relative overflow-hidden rounded-2xl border border-border/50 bg-card"
      >

        <div className="relative p-8">
          {/* Identification Strip */}
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold tracking-[0.2em] text-foreground uppercase">
              {title}
            </h2>
            <div className="h-0.5 w-48 mx-auto mt-3 bg-gradient-to-r from-transparent via-primary to-transparent" />
          </div>

          {/* Two-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            
            {/* Left Panel: Score + Stats */}
            <div className="flex flex-col items-center justify-center">
              <div>
                <ScoreGauge score={score} size={180} skipAnimation={skipGaugeAnimation} />
              </div>

              {/* Mini Stats Row */}
              <div className="flex gap-3 mt-14">
                {miniStats}
              </div>
            </div>

            {/* Right Panel: Details */}
            <div className="flex flex-col justify-center lg:border-l lg:border-border/30 lg:pl-8">
              {detailRows}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
