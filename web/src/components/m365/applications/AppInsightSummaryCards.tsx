import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, Key, ShieldAlert, Package } from 'lucide-react';
import { AppInsightsSummary } from '@/types/applicationInsights';

interface AppInsightSummaryCardsProps {
  summary: AppInsightsSummary;
  loading?: boolean;
}

export function AppInsightSummaryCards({ summary, loading }: AppInsightSummaryCardsProps) {
  const cards = [
    {
      label: 'Vencidos',
      value: summary.expiredCredentials,
      sublabel: 'Credenciais',
      icon: Key,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
    },
    {
      label: 'A Vencer',
      value: summary.expiringIn30Days,
      sublabel: 'em 30 dias',
      icon: AlertTriangle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
    },
    {
      label: 'Privilegiados',
      value: summary.privilegedApps,
      sublabel: 'com Admin',
      icon: ShieldAlert,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
    },
    {
      label: 'Total de Insights',
      value: summary.total,
      sublabel: '',
      icon: Package,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card 
            key={card.label} 
            className={`glass-card border ${card.borderColor} ${loading ? 'animate-pulse' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>
                    {loading ? '-' : card.value}
                  </p>
                  {card.sublabel && (
                    <p className="text-xs text-muted-foreground">{card.sublabel}</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
