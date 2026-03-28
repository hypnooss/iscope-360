import { Mail, ShieldAlert, Bug, Forward } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { DataSourceDot } from '@/components/m365/shared/DataSourceDot';
import type { ExchangeDashboardData } from '@/hooks/useExchangeDashboard';

interface ExchangeAnalyzerStatsCardsProps {
  data: ExchangeDashboardData;
}

export function ExchangeAnalyzerStatsCards({ data }: ExchangeAnalyzerStatsCardsProps) {
  const { mailboxes, security, traffic } = data;

  const totalInbound = traffic.received || 1;
  const phishingRate = totalInbound > 0 ? ((security.phishing / totalInbound) * 100).toFixed(1) : '0.0';
  const malwareRate = totalInbound > 0 ? ((security.malware / totalInbound) * 100).toFixed(1) : '0.0';
  const forwardingPct = mailboxes.total > 0 ? ((mailboxes.forwardingEnabled / mailboxes.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total de Mailboxes */}
      <Card className="glass-card border-border/50 relative">
        <div className="absolute top-3 right-3"><DataSourceDot source="snapshot" /></div>
        <CardContent className="p-4 flex items-center gap-3">
          <Mail className="w-8 h-8 text-teal-400" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{mailboxes.total.toLocaleString()}</p>
              {mailboxes.newLast30d > 0 && (
                <p className="text-xs text-muted-foreground">(+{mailboxes.newLast30d} 30d)</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Total de Mailboxes</p>
          </div>
        </CardContent>
      </Card>

      {/* Proteção Phishing */}
      <Card className="glass-card border-border/50 relative">
        <div className="absolute top-3 right-3"><DataSourceDot source="aggregated" /></div>
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{security.phishing.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">({phishingRate}%)</p>
            </div>
            <p className="text-xs text-muted-foreground">Proteção Phishing</p>
          </div>
        </CardContent>
      </Card>

      {/* Detecção Malware */}
      <Card className="glass-card border-border/50 relative">
        <div className="absolute top-3 right-3"><DataSourceDot source="aggregated" /></div>
        <CardContent className="p-4 flex items-center gap-3">
          <Bug className="w-8 h-8 text-amber-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{security.malware.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">({malwareRate}%)</p>
            </div>
            <p className="text-xs text-muted-foreground">Detecção Malware</p>
          </div>
        </CardContent>
      </Card>

      {/* Exposição Forwarding */}
      <Card className="glass-card border-border/50 relative">
        <div className="absolute top-3 right-3"><DataSourceDot source="snapshot" /></div>
        <CardContent className="p-4 flex items-center gap-3">
          <Forward className="w-8 h-8 text-orange-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{forwardingPct}%</p>
              <p className="text-xs text-muted-foreground">({mailboxes.forwardingEnabled})</p>
            </div>
            <p className="text-xs text-muted-foreground">Exposição Forwarding</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
