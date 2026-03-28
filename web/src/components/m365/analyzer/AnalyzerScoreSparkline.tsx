import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis } from 'recharts';
import { useMemo } from 'react';

export interface ScorePoint {
  date: string;
  score: number;
}

function getColorForRisk(score: number): string {
  if (score >= 81) return 'hsl(351, 95%, 72%)';
  if (score >= 61) return 'hsl(25, 95%, 53%)';
  if (score >= 31) return 'hsl(48, 96%, 53%)';
  return 'hsl(160, 60%, 50%)';
}

interface Props {
  data: ScorePoint[];
}

export function AnalyzerScoreSparkline({ data }: Props) {
  const sorted = useMemo(() =>
    [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data]
  );

  const gradientId = useMemo(() => `analyzerSparkFill-${Math.random().toString(36).slice(2, 8)}`, []);

  const lineColor = useMemo(() => {
    if (sorted.length < 2) return 'hsl(160, 60%, 50%)';
    return getColorForRisk(sorted[sorted.length - 1].score);
  }, [sorted]);

  const ticks = useMemo(() => {
    if (sorted.length < 2) return [];
    return [sorted[0].date, sorted[sorted.length - 1].date];
  }, [sorted]);

  const formatTick = (d: string) => {
    try {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}h`;
    } catch {
      return d;
    }
  };

  if (sorted.length < 2) {
    return (
      <div className="w-full h-[48px] flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">Sem histórico</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[48px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sorted} margin={{ top: 2, right: 12, bottom: 0, left: 12 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 100]} hide />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={formatTick}
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={lineColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
