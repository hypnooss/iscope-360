import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis } from 'recharts';

export interface ScoreHistoryPoint {
  date: string;
  score: number;
}

interface ScoreSparklineProps {
  data: ScoreHistoryPoint[];
}

function getColorForScore(score: number): string {
  if (score >= 90) return 'hsl(175, 80%, 45%)';
  if (score >= 75) return 'hsl(158, 64%, 52%)';
  if (score >= 60) return 'hsl(48, 96%, 53%)';
  return 'hsl(351, 95%, 72%)';
}

export function ScoreSparkline({ data }: ScoreSparklineProps) {
  const sortedData = useMemo(() =>
    [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data]
  );

  const fillGradientId = useMemo(() => `sparkFill-${Math.random().toString(36).slice(2, 8)}`, []);

  const lineColor = useMemo(() => {
    if (sortedData.length < 2) return 'hsl(175, 80%, 45%)';
    return getColorForScore(sortedData[sortedData.length - 1].score);
  }, [sortedData]);

  const ticks = useMemo(() => {
    if (sortedData.length < 2) return [];
    return [sortedData[0].date, sortedData[sortedData.length - 1].date];
  }, [sortedData]);

  const formatTick = (date: string) => {
    const [, m, d] = date.split('-');
    return `${d}/${m}`;
  };

  if (sortedData.length < 2) {
    return (
      <div className="w-full h-[56px] flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">Sem histórico</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[56px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sortedData} margin={{ top: 2, right: 16, bottom: 0, left: 16 }}>
          <defs>
            <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
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
            fill={`url(#${fillGradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
