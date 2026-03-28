import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, Info, Shield } from 'lucide-react';
import { InsightsSummary } from '@/types/securityInsights';

interface InsightSummaryCardsProps {
  summary: InsightsSummary;
  loading?: boolean;
}

export function InsightSummaryCards({ summary, loading }: InsightSummaryCardsProps) {
  const cards = [
    {
      label: 'Críticos',
      value: summary.critical,
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
    },
    {
      label: 'Alta Prioridade',
      value: summary.high,
      icon: AlertTriangle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
    },
    {
      label: 'Média/Baixa',
      value: summary.medium + summary.low,
      icon: AlertCircle,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
    },
    {
      label: 'Total de Insights',
      value: summary.total,
      icon: Shield,
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
