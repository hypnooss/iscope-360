import { useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Customized } from 'recharts';
import { Eye } from 'lucide-react';
import { OuterLabelsLayer } from './OuterLabelsLayer';
import type { SurfaceFinding, SurfaceFindingSeverity } from '@/lib/surfaceFindings';

/* ── Severity colors ── */
const SEV_COLORS: Record<SurfaceFindingSeverity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#60a5fa',
};

const SEV_LABELS: Record<SurfaceFindingSeverity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
};

/* ── Tech ring colors (distinct palette) ── */
const TECH_COLORS = [
  '#4db8a4', '#7b8fdb', '#b07cc3', '#45b5bf', '#c4956a',
  '#5bae7e', '#8f8bc7', '#c27884', '#5aa3c9', '#a98db5',
];

const RADIAN = Math.PI / 180;
const MIN_PERCENT_FOR_LABEL = 0.10;


function renderCustomLabel({
  cx, cy, midAngle, innerRadius, outerRadius, name, value, percent,
}: any) {
  if (percent < MIN_PERCENT_FOR_LABEL) return null;

  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  const label = name.length > 7 ? name.slice(0, 6) + '…' : name;

  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
    >
      {label} {value}
    </text>
  );
}


/* ── Custom Tooltip ── */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const { name, value, payload: data } = entry;
  const color = data?.color || entry.color || '#888';
  const total = entry.payload?._total || 1;
  const pct = ((value / total) * 100).toFixed(1);
  const ring = entry.payload?._ring || '';

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg text-popover-foreground">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-semibold">{name}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {value} ({pct}%) · {ring}
      </div>
    </div>
  );
}

interface SeverityTechDonutProps {
  findings: SurfaceFinding[];
  assets: Array<{
    allTechs: string[];
    services: Array<{ product?: string; version?: string }>;
    webServices: Array<{ server?: string; technologies?: string[] }>;
  }>;
}

export function SeverityTechDonut({ findings, assets }: SeverityTechDonutProps) {
  const sliceDataRef = useRef<any[]>([]);

  function captureSliceData({ cx, cy, midAngle, outerRadius, name, value, percent, fill, index }: any) {
    sliceDataRef.current[index] = { cx, cy, midAngle, outerRadius, name, value, percent, color: fill };
    return null;
  }
  const severityData = useMemo(() => {
    const counts: Record<SurfaceFindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity]++;
    const total = findings.length || 1;
    return (['critical', 'high', 'medium', 'low'] as SurfaceFindingSeverity[])
      .filter(s => counts[s] > 0)
      .map(s => ({ name: SEV_LABELS[s], value: counts[s], color: SEV_COLORS[s], _total: total, _ring: 'Severidade' }));
  }, [findings]);

  const techData = useMemo(() => {
    const techCount = new Map<string, number>();
    for (const asset of assets) {
      const seen = new Set<string>();
      for (const tech of asset.allTechs) {
        const name = tech.split('/')[0].split(':')[0].trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        techCount.set(name, (techCount.get(name) || 0) + 1);
      }
    }
    const sorted = Array.from(techCount.entries()).sort((a, b) => b[1] - a[1]);
    const MAX_ITEMS = 8;
    const top = sorted.slice(0, MAX_ITEMS);
    const otherCount = sorted.slice(MAX_ITEMS).reduce((sum, [, c]) => sum + c, 0);
    const totalTech = sorted.reduce((sum, [, c]) => sum + c, 0) || 1;
    const result = top.map(([name, value], i) => ({
      name, value, color: TECH_COLORS[i % TECH_COLORS.length], _total: totalTech, _ring: 'Tecnologia',
    }));
    if (otherCount > 0) result.push({ name: 'Outros', value: otherCount, color: '#6b7280', _total: totalTech, _ring: 'Tecnologia' });
    return result;
  }, [assets]);

  const hasData = severityData.length > 0 || techData.length > 0;

  return (
    <Card className="border-border/50 flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Gráfico de Exposição
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-0 pb-2">
        {!hasData ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem dados para exibir</p>
        ) : (
          <div className="w-full h-full min-h-[380px] overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart style={{ overflow: 'hidden' }}>
                <Pie
                  data={severityData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius="15%"
                  outerRadius="36%"
                  paddingAngle={2}
                  strokeWidth={0}
                  label={renderCustomLabel}
                  labelLine={false}
                >
                  {severityData.map((entry, i) => (
                    <Cell key={`sev-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Pie
                  data={techData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius="42%"
                  outerRadius="55%"
                  paddingAngle={1}
                  strokeWidth={0}
                  label={captureSliceData}
                  labelLine={false}
                >
                  {techData.map((entry, i) => (
                    <Cell key={`tech-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Customized
                  component={(props: any) => (
                    <OuterLabelsLayer
                      sliceData={sliceDataRef.current}
                      techData={techData}
                      width={props.width}
                      height={props.height}
                    />
                  )}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
