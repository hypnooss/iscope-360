import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Server, AlertTriangle, TrendingUp, Shield } from 'lucide-react';

interface DashboardStats {
  totalFirewalls: number;
  averageScore: number;
  criticalAlerts: number;
  criticalFailures: number;
}

interface FirewallStatsCardsProps {
  onStatsLoaded?: (stats: DashboardStats) => void;
  workspaceIds?: string[];
}

export function FirewallStatsCards({ onStatsLoaded, workspaceIds }: FirewallStatsCardsProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      // Build queries with optional workspace filtering
      let countQuery = supabase.from('firewalls').select('id', { count: 'exact', head: true });
      let dataQuery = supabase.from('firewalls').select('id, last_score');

      // Apply workspace filter if provided
      if (workspaceIds && workspaceIds.length > 0) {
        countQuery = countQuery.in('client_id', workspaceIds);
        dataQuery = dataQuery.in('client_id', workspaceIds);
      }

      const [firewallsRes, firewallsWithScoreRes] = await Promise.all([
        countQuery,
        dataQuery,
      ]);

      const totalFirewalls = firewallsRes.count || 0;
      const firewallsData = firewallsWithScoreRes.data || [];
      
      // Calculate average score from firewalls with scores
      const firewallsWithScore = firewallsData.filter(f => f.last_score !== null);
      const averageScore = firewallsWithScore.length > 0
        ? Math.round(firewallsWithScore.reduce((sum, f) => sum + (f.last_score || 0), 0) / firewallsWithScore.length)
        : 0;

      // Critical alerts: firewalls with score < 50
      const criticalAlerts = firewallsData.filter(f => f.last_score !== null && f.last_score < 50).length;
      
      // Critical failures: firewalls with score < 30 (severe issues)
      const criticalFailures = firewallsData.filter(f => f.last_score !== null && f.last_score < 30).length;

      const newStats = {
        totalFirewalls,
        averageScore,
        criticalAlerts,
        criticalFailures,
      };

      setStats(newStats);
      onStatsLoaded?.(newStats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceIds, onStatsLoaded]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array(4).fill(0).map((_, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-6">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Server className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Firewalls</p>
              <p className="text-2xl font-bold text-foreground">{stats?.totalFirewalls || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${stats?.averageScore && stats.averageScore >= 75 ? 'bg-success/10' : stats?.averageScore && stats.averageScore >= 50 ? 'bg-warning/10' : 'bg-destructive/10'}`}>
              <TrendingUp className={`w-6 h-6 ${stats?.averageScore && stats.averageScore >= 75 ? 'text-success' : stats?.averageScore && stats.averageScore >= 50 ? 'text-warning' : 'text-destructive'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Score Médio</p>
              <p className={`text-2xl font-bold ${getScoreColor(stats?.averageScore || 0)}`}>
                {stats?.averageScore || 0}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-warning/10">
              <AlertTriangle className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Alertas Críticos</p>
              <p className="text-2xl font-bold text-warning">{stats?.criticalAlerts || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-destructive/10">
              <Shield className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Falhas Críticas</p>
              <p className="text-2xl font-bold text-destructive">{stats?.criticalFailures || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
