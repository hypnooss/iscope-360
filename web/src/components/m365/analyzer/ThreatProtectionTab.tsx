import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ShieldCheck, ShieldAlert, ShieldX, Mail, MailX,
  Bug, FileWarning, AlertTriangle, CheckCircle2,
  Globe, Users, Ban, ShieldOff, Eye,
} from 'lucide-react';
import type { M365AnalyzerMetrics, M365AnalyzerInsight } from '@/types/m365AnalyzerInsights';
import { ThreatDetailSheet, type ThreatDetailItem, type ThreatItemType } from './ThreatDetailSheet';

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <Card className="glass-card border">
      <CardContent className="p-3 flex items-center gap-2.5">
        <Icon className={cn('w-4 h-4 shrink-0', color)} />
        <div className="min-w-0">
          <p className={cn('text-lg font-bold leading-none', color)}>{value.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Policy Status Card ──────────────────────────────────────────────────────
function PolicyCard({ name, status }: { name: string; status: 'enabled' | 'weak' | 'disabled' }) {
  const cfg = {
    enabled: { icon: CheckCircle2, label: 'Ativo', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
    weak: { icon: AlertTriangle, label: 'Fraco', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
    disabled: { icon: ShieldX, label: 'Desativado', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  }[status];

  return (
    <Card className={cn('glass-card border', cfg.bg)}>
      <CardContent className="p-3 flex items-center gap-2.5">
        <cfg.icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          <p className={cn('text-[10px] font-medium', cfg.color)}>{cfg.label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Ranking List ────────────────────────────────────────────────────────────
function RankingList({ title, icon: Icon, items, labelKey, onItemClick, dismissedKeys, showDismissed }: {
  title: string; icon: React.ElementType;
  items: { [key: string]: any; count: number }[];
  labelKey: string;
  onItemClick?: (item: any) => void;
  dismissedKeys?: Set<string>;
  showDismissed?: boolean;
}) {
  if (!items?.length) return null;

  const typeMap: Record<string, ThreatItemType> = {
    'Top Domínios de SPAM': 'spam',
    'Top Alvos de Phishing': 'phishing',
    'Top Fontes de Malware': 'malware',
  };
  const type = typeMap[title] || 'spam';

  const filteredItems = items.filter(item => {
    const key = `${type}::${item[labelKey]}`;
    const isDismissed = dismissedKeys?.has(key);
    return showDismissed ? true : !isDismissed;
  });

  if (!filteredItems.length) return null;
  const maxCount = Math.max(...filteredItems.map(i => i.count), 1);

  return (
    <Card className="glass-card border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1">
        {filteredItems.slice(0, 8).map((item, i) => {
          const key = `${type}::${item[labelKey]}`;
          const isDismissed = dismissedKeys?.has(key);
          return (
            <div
              key={i}
              className={cn(
                'py-2 px-2 rounded-md transition-colors',
                onItemClick ? 'cursor-pointer hover:bg-primary/10' : 'hover:bg-secondary/50',
                isDismissed && 'opacity-40',
              )}
              onClick={() => onItemClick?.(item)}
            >
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 flex items-center justify-center rounded bg-secondary text-[10px] font-bold text-muted-foreground shrink-0">
                  {i + 1}
                </span>
                <span className={cn('flex-1 min-w-0 text-sm font-medium text-foreground truncate', isDismissed && 'line-through')}>{item[labelKey]}</span>
                {isDismissed && <ShieldOff className="w-3 h-3 text-muted-foreground shrink-0" />}
                <Badge variant="secondary" className="font-mono text-xs shrink-0">{item.count}</Badge>
              </div>
              <div className="mt-1.5 ml-8 h-1 bg-secondary/60 rounded-full overflow-hidden">
                <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${(item.count / maxCount) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Incident Card ───────────────────────────────────────────────────────────
function ThreatInsightCard({ insight }: { insight: M365AnalyzerInsight }) {
  const sevConfig = {
    critical: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/40' },
    high: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/40' },
    medium: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/40' },
    low: { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
    info: { color: 'text-muted-foreground', bg: 'bg-muted/10', border: 'border-muted/30' },
  };
  const sev = sevConfig[insight.severity] ?? sevConfig.medium;

  return (
    <Card className={cn('glass-card border', sev.border)}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground truncate">{insight.name}</h4>
          <Badge variant="outline" className={cn('text-[10px] shrink-0', sev.bg, sev.color, sev.border)}>
            {insight.severity}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{insight.description}</p>
        {insight.count !== undefined && insight.count > 0 && (
          <Badge variant="secondary" className="text-[10px]">{insight.count} ocorrências</Badge>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
interface ThreatProtectionTabProps {
  metrics: M365AnalyzerMetrics;
  insights: M365AnalyzerInsight[];
  compact?: boolean;
  dismissedKeys?: Set<string>;
  onDismiss?: (type: string, label: string, reason?: string) => void;
  onRestore?: (type: string, label: string) => void;
  isDismissing?: boolean;
  isRestoring?: boolean;
}

export function ThreatProtectionTab({ metrics, insights, compact, dismissedKeys, onDismiss, onRestore, isDismissing, isRestoring }: ThreatProtectionTabProps) {
  const tp = metrics.threatProtection;
  const threatInsights = insights.filter(i => i.category === 'threat_protection');
  const totalThreats = tp.spamBlocked + tp.phishingDetected + tp.malwareBlocked;

  const [selectedItem, setSelectedItem] = useState<ThreatDetailItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  const hasDismissals = dismissedKeys && dismissedKeys.size > 0;

  const openDetail = (type: ThreatItemType, item: any) => {
    setSelectedItem({
      type,
      label: item.domain || item.user,
      count: item.count,
      recipients: item.recipients,
      senders: item.senders,
      sampleSubjects: item.sampleSubjects,
    });
    setSheetOpen(true);
  };

  const selectedIsDismissed = selectedItem
    ? dismissedKeys?.has(`${selectedItem.type}::${selectedItem.label}`) ?? false
    : false;

  return (
    <div className={cn('space-y-5', compact && 'space-y-3')}>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard label="SPAM Bloqueado" value={tp.spamBlocked} icon={MailX} color={tp.spamBlocked > 0 ? 'text-orange-400' : 'text-emerald-400'} />
        <KpiCard label="Phishing Detectado" value={tp.phishingDetected} icon={ShieldAlert} color={tp.phishingDetected > 0 ? 'text-rose-400' : 'text-emerald-400'} />
        <KpiCard label="Malware Bloqueado" value={tp.malwareBlocked} icon={Bug} color={tp.malwareBlocked > 0 ? 'text-rose-400' : 'text-emerald-400'} />
        <KpiCard label="Quarentena" value={tp.quarantined} icon={Ban} color={tp.quarantined > 0 ? 'text-warning' : 'text-emerald-400'} />
        <KpiCard label="Total Filtrado" value={tp.totalFiltered} icon={FileWarning} color={tp.totalFiltered > 0 ? 'text-orange-400' : 'text-muted-foreground'} />
        <KpiCard label="Total Entregue" value={tp.totalDelivered} icon={Mail} color="text-primary" />
      </div>

      {/* Policy Status */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          Status das Políticas de Proteção
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <PolicyCard name="Anti-Spam" status={tp.policyStatus.antiSpam} />
          <PolicyCard name="Anti-Phishing" status={tp.policyStatus.antiPhish} />
          <PolicyCard name="Safe Links" status={tp.policyStatus.safeLinks} />
          <PolicyCard name="Safe Attachments" status={tp.policyStatus.safeAttach} />
          <PolicyCard name="Malware Filter" status={tp.policyStatus.malwareFilter} />
        </div>
      </div>

      {/* Show dismissed toggle */}
      {hasDismissals && (
        <div className="flex items-center gap-2">
          <Switch
            id="show-dismissed"
            checked={showDismissed}
            onCheckedChange={setShowDismissed}
          />
          <Label htmlFor="show-dismissed" className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
            <Eye className="w-3.5 h-3.5" />
            Mostrar ocultos ({dismissedKeys.size})
          </Label>
        </div>
      )}

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <RankingList
          title="Top Domínios de SPAM"
          icon={Globe}
          items={tp.topSpamSenderDomains}
          labelKey="domain"
          onItemClick={(item) => openDetail('spam', item)}
          dismissedKeys={dismissedKeys}
          showDismissed={showDismissed}
        />
        <RankingList
          title="Top Alvos de Phishing"
          icon={Users}
          items={tp.topPhishingTargets}
          labelKey="user"
          onItemClick={(item) => openDetail('phishing', item)}
          dismissedKeys={dismissedKeys}
          showDismissed={showDismissed}
        />
        <RankingList
          title="Top Fontes de Malware"
          icon={Bug}
          items={tp.topMalwareSenders}
          labelKey="domain"
          onItemClick={(item) => openDetail('malware', item)}
          dismissedKeys={dismissedKeys}
          showDismissed={showDismissed}
        />
      </div>

      {/* Threat Insights */}
      {threatInsights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Insights de Proteção
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {threatInsights.map((ins, i) => (
              <ThreatInsightCard key={ins.id || i} insight={ins} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalThreats === 0 && threatInsights.length === 0 && (
        <Card className="glass-card border-emerald-500/20">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Nenhuma ameaça detectada</h3>
            <p className="text-xs text-muted-foreground">Nenhum SPAM, phishing ou malware identificado no período analisado.</p>
          </CardContent>
        </Card>
      )}

      {/* Detail Sheet */}
      <ThreatDetailSheet
        item={selectedItem}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isDismissed={selectedIsDismissed}
        onDismiss={onDismiss}
        onRestore={onRestore}
        isDismissing={isDismissing}
        isRestoring={isRestoring}
      />
    </div>
  );
}
