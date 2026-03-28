import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface AttackSurfaceSourceIP {
  ip: string;
  source: 'dns' | 'firewall';
  label: string;
}

export interface AttackSurfaceService {
  port: number;
  transport: string;
  product: string;
  version: string;
  banner: string;
  cpe: string[];
  name?: string;
  extra_info?: string;
  scripts?: Record<string, string>;
}

export interface AttackSurfaceWebService {
  url: string;
  status_code: number;
  title: string;
  server: string;
  technologies: string[];
  content_length: number;
  tls: {
    cipher?: string;
    issuer?: string | string[];
    subject_cn?: string;
    version?: string;
    not_after?: string;
  };
}

export interface AttackSurfaceIPResult {
  ports: number[];
  services: AttackSurfaceService[];
  web_services?: AttackSurfaceWebService[];
  vulns: string[];
  os: string;
  hostnames: string[];
  asn?: { asn: string; provider: string; org: string; is_cdn: boolean } | null;
  error?: string;
}

export interface AttackSurfaceCVE {
  cve_id: string;
  title: string;
  severity: string;
  score: number | null;
  advisory_url: string;
  products: string[];
}

export interface AttackSurfaceSummary {
  total_ips: number;
  open_ports: number;
  services: number;
  cves: number;
}

export interface AttackSurfaceSnapshot {
  id: string;
  client_id: string;
  status: string;
  source_ips: AttackSurfaceSourceIP[];
  results: Record<string, AttackSurfaceIPResult>;
  cve_matches: AttackSurfaceCVE[];
  summary: AttackSurfaceSummary;
  score: number | null;
  created_at: string;
  completed_at: string | null;
}

function parseSnapshot(row: Record<string, unknown>): AttackSurfaceSnapshot {
  return {
    id: row.id as string,
    client_id: row.client_id as string,
    status: (row.status as string) ?? 'pending',
    source_ips: (Array.isArray(row.source_ips) ? row.source_ips : []) as AttackSurfaceSourceIP[],
    results: (row.results ?? {}) as Record<string, AttackSurfaceIPResult>,
    cve_matches: (Array.isArray(row.cve_matches) ? row.cve_matches : []) as AttackSurfaceCVE[],
    summary: (row.summary ?? { total_ips: 0, open_ports: 0, services: 0, cves: 0 }) as AttackSurfaceSummary,
    score: row.score as number | null,
    created_at: row.created_at as string,
    completed_at: row.completed_at as string | null,
  };
}

export function useAttackSurfaceData(clientId?: string) {
  return useQuery({
    queryKey: ['attack-surface-snapshots', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase
        .from('attack_surface_snapshots' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10) as any);
      if (error) throw error;
      return ((data as any[]) || []).map((r) => parseSnapshot(r as Record<string, unknown>));
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useLatestAttackSurfaceSnapshot(clientId?: string) {
  return useQuery({
    queryKey: ['attack-surface-latest', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await (supabase
        .from('attack_surface_snapshots' as any)
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1) as any);
      if (error) throw error;
      const rows = (data as any[]) || [];
      if (rows.length === 0) return null;
      return parseSnapshot(rows[0] as Record<string, unknown>);
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useRunningAttackSurfaceSnapshot(clientId?: string, enabled = true) {
  return useQuery({
    queryKey: ['attack-surface-running', clientId],
    queryFn: async () => {
      if (!clientId) return null;

      // 1. Buscar snapshot running/pending
      const { data, error } = await (supabase
        .from('attack_surface_snapshots' as any)
        .select('*')
        .eq('client_id', clientId)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1) as any);
      if (error) throw error;
      const rows = (data as any[]) || [];
      if (rows.length === 0) return null;

      const snap = parseSnapshot(rows[0] as Record<string, unknown>);

      // 2. Buscar resultados parciais das tasks completadas
      const { data: tasks, error: tasksError } = await (supabase
        .from('attack_surface_tasks' as any)
        .select('ip, source, label, result')
        .eq('snapshot_id', snap.id)
        .eq('status', 'completed')
        .not('result', 'is', null) as any);

      if (!tasksError && tasks && (tasks as any[]).length > 0) {
        const partialResults: Record<string, AttackSurfaceIPResult> = {};
        for (const task of tasks as any[]) {
          if (task.ip && task.result) {
            partialResults[task.ip] = task.result as AttackSurfaceIPResult;
          }
        }
        // Montar source_ips a partir das tasks se o snapshot não tiver
        if (!snap.source_ips || snap.source_ips.length === 0) {
          snap.source_ips = (tasks as any[]).map((t: any) => ({
            ip: t.ip,
            source: t.source || 'dns',
            label: t.label || t.ip,
          }));
        }
        snap.results = partialResults;
      }

      return snap;
    },
    enabled: !!clientId && enabled,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useAttackSurfaceScan(clientId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (selectedIps?: { ip: string; source: 'dns' | 'firewall'; label: string }[]) => {
      if (!clientId) throw new Error('client_id is required');
      const body: Record<string, unknown> = { client_id: clientId };
      if (selectedIps && selectedIps.length > 0) {
        body.selected_ips = selectedIps;
      }
      const { data, error } = await supabase.functions.invoke('run-attack-surface-queue', {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attack-surface-snapshots', clientId] });
      queryClient.invalidateQueries({ queryKey: ['attack-surface-latest', clientId] });
      toast({ title: 'Scan iniciado', description: 'A análise de superfície de ataque foi iniciada com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao iniciar scan', description: error.message, variant: 'destructive' });
    },
  });
}

export function useAttackSurfaceCancelScan(clientId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error('client_id is required');
      const { data, error } = await supabase.functions.invoke('cancel-attack-surface-scan', {
        body: { client_id: clientId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attack-surface-snapshots', clientId] });
      queryClient.invalidateQueries({ queryKey: ['attack-surface-latest', clientId] });
      queryClient.invalidateQueries({ queryKey: ['attack-surface-progress', clientId] });
      toast({ title: 'Scan cancelado', description: 'O scan de superfície de ataque foi cancelado com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao cancelar scan', description: error.message, variant: 'destructive' });
    },
  });
}

export function useAttackSurfaceRescanIP(clientId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ip, source, label, snapshotId }: { ip: string; source: string; label: string; snapshotId: string }) => {
      if (!clientId) throw new Error('client_id is required');
      const { data, error } = await supabase.functions.invoke('attack-surface-rescan-ip', {
        body: { client_id: clientId, ip, source, label, snapshot_id: snapshotId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attack-surface-snapshots', clientId] });
      queryClient.invalidateQueries({ queryKey: ['attack-surface-latest', clientId] });
      queryClient.invalidateQueries({ queryKey: ['attack-surface-progress', clientId] });
      toast({ title: 'Rescan iniciado', description: 'O scan para este IP foi iniciado com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao iniciar rescan', description: error.message, variant: 'destructive' });
    },
  });
}

/** Check if the Analyzer menu should be visible (both domain and firewall analyses exist) */
export function useAttackSurfaceAvailability(clientId?: string) {
  return useQuery({
    queryKey: ['attack-surface-availability', clientId],
    queryFn: async () => {
      if (!clientId) return false;

      const [domainRes, firewallRes] = await Promise.all([
        supabase
          .from('external_domain_analysis_history')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .in('domain_id', 
            // subquery: domains for this client
            (await supabase
              .from('external_domains')
              .select('id')
              .eq('client_id', clientId)
            ).data?.map(d => d.id) || []
          ),
        supabase
          .from('analysis_history')
          .select('id', { count: 'exact', head: true })
          .in('firewall_id',
            (await supabase
              .from('firewalls')
              .select('id')
              .eq('client_id', clientId)
            ).data?.map(f => f.id) || []
          ),
      ]);

      const hasDomain = (domainRes.count ?? 0) > 0;
      const hasFirewall = (firewallRes.count ?? 0) > 0;

      return hasDomain && hasFirewall;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });
}
