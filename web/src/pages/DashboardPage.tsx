import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePreview } from '@/contexts/PreviewContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Server, AlertTriangle, CheckCircle, Clock, Plus, TrendingUp, Shield } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardStats {
  totalClients: number;
  totalFirewalls: number;
  recentAnalyses: number;
  averageScore: number;
  criticalIssues: number;
  pendingSchedules: number;
}

interface RecentAnalysis {
  id: string;
  firewall_name: string;
  client_name: string;
  score: number;
  created_at: string;
}

export default function DashboardPage() {
  const { user, loading: authLoading, hasPermission } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user, isPreviewMode, previewTarget]);

  const fetchDashboardData = async () => {
    try {
      const workspaceIds = isPreviewMode && previewTarget?.workspaces
        ? previewTarget.workspaces.map(w => w.id)
        : null;

      // Build all queries
      let clientsQuery = supabase.from('clients').select('id, name');
      let firewallsQuery = supabase.from('firewalls').select('id, name, client_id, last_score');
      let recentQuery = supabase
        .from('analysis_history')
        .select('id, score, created_at, firewall_id')
        .order('created_at', { ascending: false })
        .limit(5);

      if (workspaceIds && workspaceIds.length > 0) {
        clientsQuery = clientsQuery.in('id', workspaceIds);
        firewallsQuery = firewallsQuery.in('client_id', workspaceIds);
      }

      // Execute ALL queries in parallel (single round-trip)
      const [clientsRes, firewallsRes, recentRes] = await Promise.all([
        clientsQuery,
        firewallsQuery,
        recentQuery,
      ]);

      const clientsData = clientsRes.data || [];
      const firewallsData = firewallsRes.data || [];
      const recentData = recentRes.data || [];

      // Build lookup maps from already-fetched data
      const firewallMap = new Map(firewallsData.map(f => [f.id, f]));
      const clientMap = new Map(clientsData.map(c => [c.id, c]));

      // Calculate stats from firewalls.last_score (no extra queries)
      const firewallsWithScore = firewallsData.filter(f => f.last_score != null);
      const averageScore = firewallsWithScore.length > 0
        ? Math.round(firewallsWithScore.reduce((sum, f) => sum + (f.last_score || 0), 0) / firewallsWithScore.length)
        : 0;

      // Filter recent analyses by accessible firewalls in preview mode
      let filteredRecent = recentData;
      if (workspaceIds && workspaceIds.length > 0) {
        const firewallIds = new Set(firewallsData.map(f => f.id));
        filteredRecent = recentData.filter(a => firewallIds.has(a.firewall_id));
      }

      // Resolve names using Maps (no additional queries)
      const formattedRecent: RecentAnalysis[] = filteredRecent.map(item => {
        const firewall = firewallMap.get(item.firewall_id);
        const client = firewall ? clientMap.get(firewall.client_id) : null;
        return {
          id: item.id,
          firewall_name: firewall?.name || 'N/A',
          client_name: client?.name || 'N/A',
          score: item.score,
          created_at: item.created_at,
        };
      });

      setStats({
        totalClients: clientsData.length,
        totalFirewalls: firewallsData.length,
        recentAnalyses: firewallsWithScore.length,
        averageScore,
        criticalIssues: firewallsData.filter(f => f.last_score != null && f.last_score < 50).length,
        pendingSchedules: 0,
      });

      setRecentAnalyses(formattedRecent);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-success'; // Excelente
    if (score >= 75) return 'text-success'; // Bom
    if (score >= 60) return 'text-warning'; // Atenção
    return 'text-destructive'; // Risco Alto
  };

  if (authLoading) {
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Visão geral do ambiente FortiGate</p>
          </div>
          {hasPermission('firewall', 'edit') && (
            <Button onClick={() => navigate('/firewalls')}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Firewall
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {loading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i} className="glass-card">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
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
                    <div className="p-3 rounded-lg bg-success/10">
                      <TrendingUp className="w-6 h-6 text-success" />
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
                      <p className="text-sm text-muted-foreground">Críticos</p>
                      <p className="text-2xl font-bold text-foreground">{stats?.criticalIssues || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-secondary">
                      <Shield className="w-6 h-6 text-secondary-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Clientes</p>
                      <p className="text-2xl font-bold text-foreground">{stats?.totalClients || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Recent Analyses */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Análises Recentes
            </CardTitle>
            <CardDescription>Últimas verificações de compliance realizadas</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array(3).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-12" />
                  </div>
                ))}
              </div>
            ) : recentAnalyses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma análise realizada ainda</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate('/firewalls')}
                >
                  Adicionar Firewall
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentAnalyses.map((analysis) => (
                  <div
                    key={analysis.id}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Server className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{analysis.firewall_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{analysis.client_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {analysis.score >= 80 ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : analysis.score >= 60 ? (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      )}
                      <span className={`font-bold ${getScoreColor(analysis.score)}`}>
                        {analysis.score}%
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(analysis.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
