import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cpu, HardDrive, MemoryStick, Network, Clock, Activity, Monitor } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  useAgentMetrics,
  formatBytes,
  formatUptime,
  formatLinkSpeed,
  getInterfaceNames,
  getInterfaceSpeed,
  buildInterfaceData,
  buildLegacyNetworkData,
  type TimeRange,
  type AgentMetricRow,
  type DiskPartition,
} from "@/hooks/useAgentMetrics";
import { format } from "date-fns";

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
];

function getColor(value: number | null): string {
  if (value == null) return "hsl(var(--muted-foreground))";
  if (value < 60) return "hsl(142, 76%, 36%)";
  if (value < 80) return "hsl(45, 93%, 47%)";
  return "hsl(0, 84%, 60%)";
}

function formatTime(timeRange: TimeRange) {
  return (ts: string) => {
    const d = new Date(ts);
    if (timeRange === "7d") return format(d, "dd/MM HH:mm");
    return format(d, "HH:mm");
  };
}

/* ── Stats helper ── */
function computeSeriesStats(values: number[]): { last: number; min: number; avg: number; max: number } | null {
  if (values.length === 0) return null;
  const last = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { last, min, avg, max };
}

/* ── Zabbix-style legend table ── */
interface LegendSeries {
  color: string;
  label: string;
  stats: { last: number; min: number; avg: number; max: number } | null;
  formatValue: (v: number) => string;
}

function ChartLegendTable({ series }: { series: LegendSeries[] }) {
  return (
    <div className="flex flex-col items-end mt-1">
      <div
        className="grid gap-x-3 gap-y-0.5 text-[10px] leading-tight"
        style={{ gridTemplateColumns: 'auto auto auto auto auto auto' }}
      >
        {series.map((s) => (
          <React.Fragment key={s.label}>
            <span
              className="inline-block w-2 h-2 rounded-[2px] shrink-0 self-center"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-foreground font-medium text-left whitespace-nowrap">{s.label}</span>
            {s.stats ? (
              <>
                <span className="tabular-nums text-right whitespace-nowrap text-muted-foreground">
                  last: <span className="text-foreground">{s.formatValue(s.stats.last)}</span>
                </span>
                <span className="tabular-nums text-right whitespace-nowrap text-muted-foreground">
                  min: {s.formatValue(s.stats.min)}
                </span>
                <span className="tabular-nums text-right whitespace-nowrap text-muted-foreground">
                  avg: {s.formatValue(s.stats.avg)}
                </span>
                <span className="tabular-nums text-right whitespace-nowrap text-muted-foreground">
                  max: {s.formatValue(s.stats.max)}
                </span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">—</span>
                <span />
                <span />
                <span />
              </>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/** Strip kernel version from os_info — e.g. "Oracle Linux Server 9.6 6.12.0-xxx" → "Oracle Linux Server 9.6" */
function formatOsInfo(raw: string): string {
  const tokens = raw.split(' ');
  const idx = tokens.findIndex(t => /^\d+\.\d+\.\d+-/.test(t));
  if (idx > 0) return tokens.slice(0, idx).join(' ');
  return raw;
}

function formatMB(v: number): string {
  if (v >= 1024) return `${(v / 1024).toFixed(2)} GB`;
  return `${v.toFixed(1)} MB`;
}

function formatGB(v: number): string {
  return `${v.toFixed(2)} GB`;
}

function formatPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

function MetricIndicator({
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null;
  suffix?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-5 rounded-lg bg-muted/50">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold" style={color ? { color } : undefined}>
          {value != null ? `${value}${suffix || ""}` : "—"}
        </p>
      </div>
    </div>
  );
}

function AbsoluteTooltip({
  active,
  payload,
  label,
  usedKey,
  totalKey,
  unit,
  percentKey,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  label?: string;
  usedKey: string;
  totalKey: string;
  unit: string;
  percentKey: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const used = row[usedKey] as number | null;
  const total = row[totalKey] as number | null;
  const pct = row[percentKey] as number | null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{label ? format(new Date(label), "dd/MM HH:mm:ss") : ""}</p>
      {used != null && total != null && (
        <p className="font-semibold" style={{ color: getColor(pct) }}>
          {Number(used).toFixed(1)} / {Number(total).toFixed(1)} {unit}
        </p>
      )}
      {pct != null && (
        <p className="text-muted-foreground">{Number(pct).toFixed(1)}%</p>
      )}
    </div>
  );
}

function CpuTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: AgentMetricRow }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const pct = payload[0].value;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{label ? format(new Date(label), "dd/MM HH:mm:ss") : ""}</p>
      <p className="font-semibold" style={{ color: getColor(pct) }}>
        {pct != null ? `${Number(pct).toFixed(1)}%` : "—"}
      </p>
      {row.cpu_count != null && (
        <p className="text-muted-foreground">{row.cpu_count} cores</p>
      )}
    </div>
  );
}

function NetworkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{label ? format(new Date(label), "dd/MM HH:mm:ss") : ""}</p>
      {payload.map((p) => {
        const isRecv = p.dataKey === "recvRateNeg";
        const absVal = Math.abs(p.value);
        return (
          <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
            {isRecv ? "↓ Recebido" : "↑ Enviado"}: {formatBytes(absVal)}
          </p>
        );
      })}
    </div>
  );
}

/** Extract unique partition paths from metrics data */
function getPartitionPaths(metrics: AgentMetricRow[]): string[] {
  const paths = new Set<string>();
  for (const m of metrics) {
    if (m.disk_partitions && Array.isArray(m.disk_partitions)) {
      for (const p of m.disk_partitions) {
        paths.add(p.path);
      }
    }
  }
  return Array.from(paths).sort();
}

/** Build chart data for a specific partition */
function buildPartitionData(metrics: AgentMetricRow[], partitionPath: string) {
  return metrics
    .map((m) => {
      const part = m.disk_partitions?.find((p: DiskPartition) => p.path === partitionPath);
      if (!part) return null;
      return {
        time: m.collected_at,
        disk_used_gb: part.used_gb ?? null,
        disk_total_gb: part.total_gb ?? null,
        disk_percent: part.percent ?? null,
      };
    })
    .filter(Boolean) as { time: string; disk_used_gb: number | null; disk_total_gb: number | null; disk_percent: number | null }[];
}

/** Scan metrics backwards to find the most recent non-null value for a field */
function findLastNonNull<K extends keyof AgentMetricRow>(
  metrics: AgentMetricRow[],
  field: K,
): AgentMetricRow[K] | null {
  for (let i = metrics.length - 1; i >= 0; i--) {
    const v = metrics[i][field];
    if (v != null) return v;
  }
  return null;
}

interface Props {
  agentId: string;
}

export function AgentMonitorPanel({ agentId }: Props) {
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    const saved = localStorage.getItem('agent-monitor-timerange');
    return (saved === '1h' || saved === '6h' || saved === '24h' || saved === '7d') ? saved : '1h';
  });
  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
    localStorage.setItem('agent-monitor-timerange', value);
  };
  const { data: metrics = [], isLoading } = useAgentMetrics(agentId, timeRange);

  const latest = metrics.length > 0 ? metrics[metrics.length - 1] : null;
  const interfaceNames = useMemo(() => getInterfaceNames(metrics), [metrics]);
  const hasMultiInterfaces = interfaceNames.length > 0;
  const legacyNetworkData = useMemo(() => !hasMultiInterfaces ? buildLegacyNetworkData(metrics) : [], [metrics, hasMultiInterfaces]);
  const timeFmt = formatTime(timeRange);

  const partitionPaths = useMemo(() => getPartitionPaths(metrics), [metrics]);
  const hasMultiPartitions = partitionPaths.length > 1;

  // RAM total for reference line
  const ramTotal = latest?.ram_total_mb != null ? Number(latest.ram_total_mb) : null;

  // ── Compute legend stats ──
  const cpuLegend = useMemo<LegendSeries[]>(() => {
    const vals = metrics.map((m) => m.cpu_percent).filter((v): v is number => v != null);
    return [{ color: "hsl(142, 76%, 36%)", label: "CPU %", stats: computeSeriesStats(vals), formatValue: formatPercent }];
  }, [metrics]);

  const ramLegend = useMemo<LegendSeries[]>(() => {
    const totalVals = metrics.map((m) => m.ram_total_mb).filter((v): v is number => v != null);
    const usedVals = metrics.map((m) => m.ram_used_mb).filter((v): v is number => v != null);
    return [
      { color: "hsl(217, 91%, 60%)", label: "Total", stats: computeSeriesStats(totalVals), formatValue: formatMB },
      { color: "hsl(217, 71%, 45%)", label: "Usado", stats: computeSeriesStats(usedVals), formatValue: formatMB },
    ];
  }, [metrics]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Monitoramento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-64 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Monitoramento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma métrica recebida ainda.</p>
            <p className="text-xs mt-1">O módulo monitor envia dados a cada 60 segundos.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = metrics.map((m) => ({
    ...m,
    time: m.collected_at,
  }));

  // Filtered data per chart — template-driven collection produces separate rows per metric
  const cpuChartData = chartData.filter((m) => m.cpu_percent != null);
  const ramChartData = chartData.filter((m) => m.ram_used_mb != null);
  const diskLegacyChartData = chartData.filter((m) => m.disk_used_gb != null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5" />
          Monitoramento
        </CardTitle>
        <div className="flex gap-1">
          {TIME_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={timeRange === opt.value ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => handleTimeRangeChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* System info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricIndicator
            icon={Monitor}
            label="Hostname"
            value={findLastNonNull(metrics, 'hostname') ?? null}
          />
          <MetricIndicator
            icon={Cpu}
            label="Sistema Operacional"
            value={(() => { const v = findLastNonNull(metrics, 'os_info'); return v != null ? formatOsInfo(String(v)) : null; })()}
          />
          <MetricIndicator
            icon={Network}
            label="Endereço IP"
            value={(() => { const v = findLastNonNull(metrics, 'ip_addresses'); return v != null && Array.isArray(v) && v.length > 0 ? v.join(', ') : null; })()}
          />
          <MetricIndicator
            icon={Clock}
            label="Uptime"
            value={(() => { const v = findLastNonNull(metrics, 'uptime_seconds'); return v != null ? formatUptime(Number(v)) : null; })()}
          />
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* CPU Chart */}
          <div className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-4">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Cpu className="w-3 h-3" /> CPU (%)
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cpuChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="time" tickFormatter={timeFmt} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<CpuTooltip />} labelFormatter={(v) => v} />
                  <Area type="monotone" dataKey="cpu_percent" stroke="hsl(142, 76%, 36%)" fill="hsl(142, 76%, 36%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <ChartLegendTable series={cpuLegend} />
          </div>

          {/* RAM Chart */}
          <div className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-4">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MemoryStick className="w-3 h-3" /> RAM ({(ramTotal ?? 0) >= 1024 ? "GB" : "MB"})
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ramChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="time" tickFormatter={timeFmt} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis
                    domain={[0, ramTotal ? Math.ceil(ramTotal) : "auto"]}
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) => (ramTotal ?? 0) >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${Math.round(v)} MB`}
                  />
                  <Tooltip content={<AbsoluteTooltip usedKey="ram_used_mb" totalKey="ram_total_mb" unit="MB" percentKey="ram_percent" />} labelFormatter={(v) => v} />
                  <Area type="monotone" dataKey="ram_total_mb" stroke="hsl(217, 91%, 60%)" fill="none" fillOpacity={0} strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="ram_used_mb" stroke="hsl(217, 71%, 45%)" fill="hsl(217, 71%, 45%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <ChartLegendTable series={ramLegend} />
          </div>

          {/* Disk Charts */}
          {hasMultiPartitions ? (
            partitionPaths.map((path) => {
              const partData = buildPartitionData(metrics, path);
              const latestPart = latest?.disk_partitions?.find((p: DiskPartition) => p.path === path);
              const totalVals = metrics.map((m) => m.disk_partitions?.find((p: DiskPartition) => p.path === path)?.total_gb).filter((v): v is number => v != null);
              const usedVals = metrics.map((m) => m.disk_partitions?.find((p: DiskPartition) => p.path === path)?.used_gb).filter((v): v is number => v != null);
              const totalGb = totalVals.length > 0 ? Math.max(...totalVals) : null;
              const diskLegend: LegendSeries[] = [
                { color: "hsl(0, 84%, 60%)", label: `Total (${path})`, stats: computeSeriesStats(totalVals), formatValue: formatGB },
                { color: "hsl(25, 95%, 53%)", label: `Usado (${path})`, stats: computeSeriesStats(usedVals), formatValue: formatGB },
              ];
              return (
                <div key={path} className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-4">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> Disco — {path}
                    {latestPart?.total_gb != null && (
                      <span className="text-muted-foreground/70">({Number(latestPart.total_gb).toFixed(0)} GB)</span>
                    )}
                  </p>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={partData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                        <XAxis dataKey="time" tickFormatter={timeFmt} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <YAxis domain={[0, totalGb ? totalGb : "auto"]} tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => totalGb != null && totalGb < 1 ? `${(v * 1024).toFixed(0)} MB` : `${v} GB`} />
                        <Tooltip content={<AbsoluteTooltip usedKey="disk_used_gb" totalKey="disk_total_gb" unit="GB" percentKey="disk_percent" />} labelFormatter={(v) => v} />
                        <Area type="monotone" dataKey="disk_total_gb" stroke="hsl(0, 84%, 60%)" fill="none" fillOpacity={0} strokeWidth={1.5} dot={false} />
                        <Area type="monotone" dataKey="disk_used_gb" stroke="hsl(25, 95%, 53%)" fill="hsl(25, 95%, 53%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <ChartLegendTable series={diskLegend} />
                </div>
              );
            })
          ) : (
            <div className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <HardDrive className="w-3 h-3" /> Disco
                {latest?.disk_total_gb != null && (
                  <span className="text-muted-foreground/70">({Number(latest.disk_total_gb).toFixed(0)} GB)</span>
                )}
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={diskLegacyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="time" tickFormatter={timeFmt} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis domain={[0, (() => { const vals = metrics.map((m) => m.disk_total_gb).filter((v): v is number => v != null); return vals.length > 0 ? Math.max(...vals) : "auto"; })()]} tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => { const vals = metrics.map((m) => m.disk_total_gb).filter((vv): vv is number => vv != null); const maxGb = vals.length > 0 ? Math.max(...vals) : null; return maxGb != null && maxGb < 1 ? `${(v * 1024).toFixed(0)} MB` : `${v} GB`; }} />
                    <Tooltip content={<AbsoluteTooltip usedKey="disk_used_gb" totalKey="disk_total_gb" unit="GB" percentKey="disk_percent" />} labelFormatter={(v) => v} />
                    <Area type="monotone" dataKey="disk_total_gb" stroke="hsl(0, 84%, 60%)" fill="none" fillOpacity={0} strokeWidth={1.5} dot={false} />
                    <Area type="monotone" dataKey="disk_used_gb" stroke="hsl(25, 95%, 53%)" fill="hsl(25, 95%, 53%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <ChartLegendTable series={(() => {
                const totalVals = metrics.map((m) => m.disk_total_gb).filter((v): v is number => v != null);
                const usedVals = metrics.map((m) => m.disk_used_gb).filter((v): v is number => v != null);
                return [
                  { color: "hsl(0, 84%, 60%)", label: "Total", stats: computeSeriesStats(totalVals), formatValue: formatGB },
                  { color: "hsl(25, 95%, 53%)", label: "Usado", stats: computeSeriesStats(usedVals), formatValue: formatGB },
                ];
              })()} />
            </div>
          )}

          {/* Network Charts */}
          {hasMultiInterfaces ? (
            interfaceNames.map((ifaceName) => {
              const ifaceData = buildInterfaceData(metrics, ifaceName);
              const linkSpeed = getInterfaceSpeed(metrics, ifaceName);
              const sentVals = ifaceData.map((d) => d.sentRate);
              const recvVals = ifaceData.map((d) => d.recvRate);
              const netLegend: LegendSeries[] = [
                { color: "hsl(262, 83%, 58%)", label: "↑ Enviado", stats: computeSeriesStats(sentVals), formatValue: formatBytes },
                { color: "hsl(173, 80%, 40%)", label: "↓ Recebido", stats: computeSeriesStats(recvVals), formatValue: formatBytes },
              ];
              return (
                <div key={ifaceName} className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-4">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Network className="w-3 h-3" /> Rede — {ifaceName}
                    {linkSpeed != null && (
                      <span className="text-muted-foreground/70">({formatLinkSpeed(linkSpeed)})</span>
                    )}
                  </p>
                  <div className="h-64 w-full">
                    {ifaceData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ifaceData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                          <XAxis dataKey="time" tickFormatter={timeFmt} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                          <YAxis tickFormatter={(v: number) => formatBytes(Math.abs(v)).replace("/s", "")} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                          <Tooltip content={<NetworkTooltip />} labelFormatter={(v) => v} />
                          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                          <Area type="monotone" dataKey="sentRate" stroke="hsl(262, 83%, 58%)" fill="hsl(262, 83%, 58%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="recvRateNeg" stroke="hsl(173, 80%, 40%)" fill="hsl(173, 80%, 40%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                        Dados insuficientes para {ifaceName}
                      </div>
                    )}
                  </div>
                  <ChartLegendTable series={netLegend} />
                </div>
              );
            })
          ) : (
            <div className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Network className="w-3 h-3" /> Rede
              </p>
              <div className="h-64 w-full">
                {legacyNetworkData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={legacyNetworkData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="time" tickFormatter={timeFmt} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <YAxis tickFormatter={(v: number) => formatBytes(Math.abs(v)).replace("/s", "")} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <Tooltip content={<NetworkTooltip />} labelFormatter={(v) => v} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                      <Area type="monotone" dataKey="sentRate" stroke="hsl(262, 83%, 58%)" fill="hsl(262, 83%, 58%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="recvRateNeg" stroke="hsl(173, 80%, 40%)" fill="hsl(173, 80%, 40%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Dados insuficientes para calcular taxa de transferência
                  </div>
                )}
              </div>
              <ChartLegendTable series={(() => {
                const sentVals = legacyNetworkData.map((d) => d.sentRate);
                const recvVals = legacyNetworkData.map((d) => d.recvRate);
                return [
                  { color: "hsl(262, 83%, 58%)", label: "↑ Enviado", stats: computeSeriesStats(sentVals), formatValue: formatBytes },
                  { color: "hsl(173, 80%, 40%)", label: "↓ Recebido", stats: computeSeriesStats(recvVals), formatValue: formatBytes },
                ];
              })()} />
            </div>
          )}
        </div>

        {/* Footer info */}
        {latest && (
          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/50">
            {latest.os_info && <span>OS: {latest.os_info}</span>}
            {latest.monitor_version && <span>Monitor v{latest.monitor_version}</span>}
            {latest.process_count != null && <span>{latest.process_count} processos</span>}
            <span>{metrics.length} pontos no período</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
