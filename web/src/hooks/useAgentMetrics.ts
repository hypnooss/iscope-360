import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TimeRange = "1h" | "6h" | "24h" | "7d";

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export interface DiskPartition {
  path: string;
  total_gb: number;
  used_gb: number;
  percent: number;
}

export interface NetInterface {
  iface: string;
  bytes_sent: number;
  bytes_recv: number;
  link_speed_mbps?: number | null;
}

export interface AgentMetricRow {
  id: string;
  agent_id: string;
  collected_at: string;
  cpu_percent: number | null;
  cpu_count: number | null;
  load_avg_1m: number | null;
  ram_total_mb: number | null;
  ram_used_mb: number | null;
  ram_percent: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_percent: number | null;
  disk_partitions: DiskPartition[] | null;
  net_bytes_sent: number | null;
  net_bytes_recv: number | null;
  net_interfaces: NetInterface[] | null;
  uptime_seconds: number | null;
  hostname: string | null;
  os_info: string | null;
  process_count: number | null;
  monitor_version: string | null;
  ip_addresses: string[] | null;
}

export function useAgentMetrics(agentId: string | undefined, timeRange: TimeRange = "1h") {
  return useQuery({
    queryKey: ["agent-metrics", agentId, timeRange],
    queryFn: async () => {
      if (!agentId) return [];

      const since = new Date(Date.now() - TIME_RANGE_MS[timeRange]).toISOString();

      const { data, error } = await supabase
        .from("agent_metrics")
        .select("*")
        .eq("agent_id", agentId)
        .gte("collected_at", since)
        .order("collected_at", { ascending: true })
        .limit(1000);

      if (error) throw error;
      return (data ?? []) as unknown as AgentMetricRow[];
    },
    enabled: !!agentId,
    refetchInterval: 60_000,
  });
}

/** Extract unique interface names from metrics */
export function getInterfaceNames(metrics: AgentMetricRow[]): string[] {
  const names = new Set<string>();
  for (const m of metrics) {
    if (m.net_interfaces && Array.isArray(m.net_interfaces)) {
      for (const ni of m.net_interfaces) {
        names.add(ni.iface);
      }
    }
  }
  return Array.from(names).sort();
}

/** Build chart data for a specific interface — includes recvRateNeg for mirrored chart */
export function buildInterfaceData(metrics: AgentMetricRow[], ifaceName: string) {
  return metrics
    .map((m) => {
      const ni = m.net_interfaces?.find((n) => n.iface === ifaceName);
      if (!ni) return null;
      return {
        time: m.collected_at,
        sentRate: ni.bytes_sent,
        recvRate: ni.bytes_recv,
        recvRateNeg: -ni.bytes_recv,
      };
    })
    .filter(Boolean) as { time: string; sentRate: number; recvRate: number; recvRateNeg: number }[];
}

/** Build legacy chart data — includes recvRateNeg for mirrored chart */
export function buildLegacyNetworkData(metrics: AgentMetricRow[]) {
  return metrics
    .filter((m) => m.net_bytes_sent != null && m.net_bytes_recv != null)
    .map((m) => ({
      time: m.collected_at,
      sentRate: m.net_bytes_sent!,
      recvRate: m.net_bytes_recv!,
      recvRateNeg: -m.net_bytes_recv!,
    }));
}

/** Get last known link speed for an interface */
export function getInterfaceSpeed(metrics: AgentMetricRow[], ifaceName: string): number | null {
  for (let i = metrics.length - 1; i >= 0; i--) {
    const ni = metrics[i].net_interfaces?.find((n) => n.iface === ifaceName);
    if (ni?.link_speed_mbps != null) return ni.link_speed_mbps;
  }
  return null;
}

/** Format link speed: 1000 → "1 Gbps", 100 → "100 Mbps" */
export function formatLinkSpeed(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(mbps % 1000 === 0 ? 0 : 1)} Gbps`;
  return `${mbps} Mbps`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
