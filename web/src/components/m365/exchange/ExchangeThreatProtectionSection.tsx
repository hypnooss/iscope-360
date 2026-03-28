import { useState } from 'react';
import { DataSourceDot } from '@/components/m365/shared/DataSourceDot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  ShieldX, AlertTriangle, CheckCircle2,
  Globe, Users, Bug, Shield, Info, Lightbulb, ExternalLink, FileKey, Check,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { M365AnalyzerMetrics } from '@/types/m365AnalyzerInsights';

type ThreatProtection = M365AnalyzerMetrics['threatProtection'];

type PolicyKey = 'antiSpam' | 'antiPhish' | 'safeLinks' | 'safeAttach' | 'malwareFilter';
type PolicyStatus = 'enabled' | 'weak' | 'disabled';

// ─── Policy Detail Data ──────────────────────────────────────────────────────
type LicensingInfo = {
  text: string;
  plans: { name: string; included: boolean }[];
  note: string;
  url: string;
};

const POLICY_DETAILS: Record<PolicyKey, {
  label: string;
  description: string;
  diagnostics: Record<PolicyStatus, string>;
  recommendation: Record<PolicyStatus, string>;
  microsoftUrl: string;
  licensing?: LicensingInfo;
}> = {
  antiSpam: {
    label: 'Anti-Spam',
    description: 'A política Anti-Spam filtra mensagens de email indesejadas e maliciosas antes que cheguem às caixas de entrada dos usuários. Ela classifica emails em categorias como Spam, High Confidence Spam, Phishing e High Confidence Phishing, aplicando ações específicas para cada nível de ameaça. Nota: High Confidence Phishing é sempre colocado em quarentena pela Microsoft ("Secure by Default"), independente da configuração exibida.',
    diagnostics: {
      enabled: 'Todas as políticas Anti-Spam estão configuradas com ações adequadas. As ações de Spam e High Confidence Spam estão definidas como "Quarentena". High Confidence Phishing é automaticamente protegido pela política "Secure by Default" da Microsoft.',
      weak: 'As ações de Spam ou High Confidence Spam estão configuradas como "Mover para Junk" ou "Adicionar X-Header" em vez de "Quarentena". Embora High Confidence Phishing seja automaticamente colocado em quarentena pela Microsoft (Secure by Default), as demais categorias de spam ainda seguem a ação configurada, permitindo que mensagens maliciosas cheguem à pasta de lixo eletrônico.',
      disabled: 'Nenhuma política Anti-Spam personalizada está configurada ou todas as políticas existentes estão desabilitadas. O tenant está usando apenas a política padrão sem customizações de segurança.',
    },
    recommendation: {
      enabled: 'Política configurada corretamente. Continue monitorando os relatórios de falsos positivos e ajuste os thresholds conforme necessário.',
      weak: 'Configure as ações de Spam (SpamAction) e High Confidence Spam (HighConfidenceSpamAction) para "Quarentena" em todas as políticas Anti-Spam. High Confidence Phishing já está protegido automaticamente pelo "Secure by Default" da Microsoft. Acesse Microsoft Defender > Políticas de Ameaças > Anti-spam.',
      disabled: 'Crie pelo menos uma política Anti-Spam personalizada com ações de quarentena para Spam e High Confidence Spam. A política padrão do Microsoft 365 não oferece proteção adequada contra ameaças avançadas.',
    },
    microsoftUrl: 'https://learn.microsoft.com/pt-br/defender-office-365/secure-by-default',
  },
  antiPhish: {
    label: 'Anti-Phishing',
    description: 'A política Anti-Phishing protege contra tentativas de falsificação de identidade (impersonation) e spoofing de domínio. Ela detecta quando atacantes tentam se passar por usuários internos, executivos ou domínios confiáveis para enganar funcionários.',
    diagnostics: {
      enabled: 'Spoof Intelligence está habilitado e as proteções contra impersonation de usuários e domínios estão ativas em todas as políticas.',
      weak: 'Spoof Intelligence está desabilitado em uma ou mais políticas Anti-Phishing. Sem essa proteção, emails com remetentes falsificados (spoofed) podem passar despercebidos pelos filtros de segurança.',
      disabled: 'Nenhuma política Anti-Phishing personalizada está configurada ou todas estão desabilitadas. O tenant está vulnerável a ataques de spoofing e impersonation.',
    },
    recommendation: {
      enabled: 'Política configurada corretamente. Considere revisar periodicamente a lista de remetentes e domínios confiáveis para evitar exceções desnecessárias.',
      weak: 'Habilite o Spoof Intelligence em todas as políticas Anti-Phishing. Acesse Microsoft Defender > Políticas de Ameaças > Anti-phishing e ative a opção "Spoof Intelligence" em cada política.',
      disabled: 'Crie uma política Anti-Phishing com Spoof Intelligence habilitado, proteção contra impersonation de usuários VIP e domínios corporativos. Configure ações de quarentena para detecções de alta confiança.',
    },
    microsoftUrl: 'https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about',
  },
  safeLinks: {
    label: 'Safe Links',
    description: 'Safe Links fornece verificação de URLs em tempo real no momento do clique. Quando um usuário clica em um link em um email, o Safe Links verifica se a URL é maliciosa antes de permitir o acesso, protegendo contra ataques que usam redirecionamentos ou páginas que se tornam maliciosas após a entrega do email.',
    diagnostics: {
      enabled: 'Políticas de Safe Links estão ativas e configuradas para verificar URLs em emails e aplicações Office. A proteção em tempo de clique está funcionando corretamente.',
      weak: 'Safe Links está habilitado, mas a configuração não inclui verificação em aplicações Office ou a opção "Não rastrear cliques do usuário" está ativada, reduzindo a visibilidade de segurança.',
      disabled: 'Nenhuma política Safe Links está configurada ou todas as políticas existentes estão desabilitadas para verificação de email. Os usuários não têm proteção contra URLs maliciosas no momento do clique.',
    },
    recommendation: {
      enabled: 'Política configurada corretamente. Revise periodicamente os relatórios de URLs bloqueadas para identificar tendências de ataques direcionados.',
      weak: 'Habilite a verificação de Safe Links em aplicações Office (Word, Excel, PowerPoint, Teams) e ative o rastreamento de cliques para visibilidade completa. Acesse Microsoft Defender > Políticas de Ameaças > Safe Links.',
      disabled: 'Crie uma política Safe Links abrangente que cubra emails e aplicações Office. Configure para verificar URLs no momento do clique e registrar eventos para auditoria. Isso requer licença Microsoft Defender for Office 365 Plan 1 ou superior.',
    },
    microsoftUrl: 'https://learn.microsoft.com/en-us/defender-office-365/safe-links-policies-configure',
    licensing: {
      text: 'Safe Links faz parte do Microsoft Defender for Office 365 e requer licenciamento específico para funcionar.',
      plans: [
        { name: 'Defender for Office 365 Plan 1', included: true },
        { name: 'Defender for Office 365 Plan 2', included: true },
        { name: 'Microsoft 365 E5', included: true },
        { name: 'Microsoft 365 E5 Security', included: true },
        { name: 'Microsoft 365 Business Premium', included: true },
      ],
      note: 'O Plan 2 adiciona recursos avançados como Threat Explorer, Automated Investigation and Response, Campaign View e Attack Simulation. Mas Safe Links já está disponível no Plan 1.',
      url: 'https://learn.microsoft.com/pt-br/defender-office-365/mdo-about',
    },
  },
  safeAttach: {
    label: 'Safe Attachments',
    description: 'Safe Attachments analisa anexos de email em um ambiente sandbox (detonação) antes da entrega ao usuário. Isso detecta malware zero-day e ameaças desconhecidas que não são identificadas por assinaturas tradicionais de antivírus.',
    diagnostics: {
      enabled: 'Safe Attachments está configurado com ação de "Bloquear" ou "Substituir" para anexos maliciosos. A detonação em sandbox está ativa e funcionando.',
      weak: 'Safe Attachments está habilitado, mas a ação está definida como "Monitor", o que permite que anexos suspeitos sejam entregues antes da conclusão da análise.',
      disabled: 'A ação do Safe Attachments está definida como "Allow" (desabilitado) ou nenhuma política está configurada. Anexos maliciosos podem ser entregues sem análise em sandbox. Isso requer licença Microsoft Defender for Office 365 Plan 1 ou superior.',
    },
    recommendation: {
      enabled: 'Política configurada corretamente. Considere habilitar o Safe Attachments para SharePoint, OneDrive e Teams para proteção completa.',
      weak: 'Altere a ação de Safe Attachments de "Monitor" para "Bloquear" ou "Dynamic Delivery". A opção Dynamic Delivery entrega o email imediatamente sem o anexo e o anexa após a conclusão da análise.',
      disabled: 'Crie uma política Safe Attachments com ação "Bloquear" ou "Dynamic Delivery". Configure para todos os domínios do tenant e habilite o redirecionamento de anexos maliciosos para uma caixa de segurança para análise.',
    },
    microsoftUrl: 'https://learn.microsoft.com/en-us/defender-office-365/safe-attachments-policies-configure',
    licensing: {
      text: 'Safe Attachments faz parte do Microsoft Defender for Office 365 e requer licenciamento específico para funcionar.',
      plans: [
        { name: 'Defender for Office 365 Plan 1', included: true },
        { name: 'Defender for Office 365 Plan 2', included: true },
        { name: 'Microsoft 365 E5', included: true },
        { name: 'Microsoft 365 E5 Security', included: true },
        { name: 'Microsoft 365 Business Premium', included: true },
      ],
      note: 'O Plan 2 adiciona recursos avançados como Threat Explorer, Automated Investigation and Response, Campaign View e Attack Simulation. Mas Safe Attachments já está disponível no Plan 1.',
      url: 'https://learn.microsoft.com/pt-br/defender-office-365/mdo-about',
    },
  },
  malwareFilter: {
    label: 'Malware Filter',
    description: 'O Malware Filter é a primeira linha de defesa contra anexos maliciosos no Exchange Online. Ele verifica todos os emails com anexos usando múltiplos engines de antimalware e pode bloquear tipos de arquivo comumente usados em ataques (como .exe, .js, .vbs).',
    diagnostics: {
      enabled: 'O Malware Filter está configurado com o Common Attachment Types Filter (File Filter) habilitado, bloqueando tipos de arquivo perigosos antes da entrega.',
      weak: 'O File Filter (Common Attachment Types Filter) está desabilitado. Isso permite que tipos de arquivo potencialmente perigosos (como .exe, .scr, .js, .vbs) sejam entregues aos usuários, dependendo apenas da detecção de assinatura de malware.',
      disabled: 'A política de Malware Filter está desabilitada ou não configurada. O tenant está sem proteção básica contra malware em anexos de email.',
    },
    recommendation: {
      enabled: 'Política configurada corretamente. Revise periodicamente a lista de extensões bloqueadas e adicione novos tipos conforme surgem novas ameaças.',
      weak: 'Habilite o Common Attachment Types Filter (File Filter) na política de Malware. Acesse Microsoft Defender > Políticas de Ameaças > Anti-malware e ative a opção "Ativar o filtro de anexos comuns". Adicione extensões adicionais como .iso, .img, .vhd se necessário.',
      disabled: 'Ative a política de Malware Filter padrão e habilite o Common Attachment Types Filter. Configure notificações para administradores quando malware for detectado.',
    },
    microsoftUrl: 'https://learn.microsoft.com/en-us/defender-office-365/anti-malware-policies-configure',
  },
};

const STATUS_CONFIG = {
  enabled: { icon: CheckCircle2, label: 'Ativo', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  weak: { icon: AlertTriangle, label: 'Fraco', color: 'text-warning', bg: 'bg-warning/10 border-warning/30', badgeBg: 'bg-warning/10 text-warning border-warning/30' },
  disabled: { icon: ShieldX, label: 'Desativado', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30', badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
};

// ─── Policy Status Card ──────────────────────────────────────────────────────
function PolicyCard({ name, status, onClick }: { name: string; status: PolicyStatus; onClick: () => void }) {
  const cfg = STATUS_CONFIG[status];

  return (
    <Card
      className={cn('glass-card border cursor-pointer transition-all hover:ring-1 hover:ring-primary/30 relative', cfg.bg)}
      onClick={onClick}
    >
      <DataSourceDot source="snapshot" className="absolute top-2 right-2" />
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

// ─── Policy Detail Sheet ─────────────────────────────────────────────────────
function PolicyDetailSheet({
  open,
  onOpenChange,
  policyKey,
  status,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyKey: PolicyKey | null;
  status: PolicyStatus;
}) {
  if (!policyKey) return null;

  const detail = POLICY_DETAILS[policyKey];
  const cfg = STATUS_CONFIG[status];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', cfg.bg)}>
              <cfg.icon className={cn('w-5 h-5', cfg.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg">{detail.label}</SheetTitle>
              <Badge variant="outline" className={cn('text-xs mt-1', cfg.badgeBg)}>
                {cfg.label}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="px-6 py-5 space-y-5">
            {/* O que é */}
            <Card className="glass-card border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  O que é
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{detail.description}</p>
              </CardContent>
            </Card>

            {/* Diagnóstico */}
            <Card className={cn('border-l-4', status === 'enabled' ? 'border-l-emerald-500' : status === 'weak' ? 'border-l-warning' : 'border-l-rose-500', 'glass-card border')}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  Diagnóstico
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm text-foreground leading-relaxed">{detail.diagnostics[status]}</p>
              </CardContent>
            </Card>

            {/* Recomendação */}
            <Card className="glass-card border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-warning" />
                  Recomendação
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm text-foreground leading-relaxed">{detail.recommendation[status]}</p>
              </CardContent>
            </Card>

            {/* Licenciamento */}
            {detail.licensing && (
              <Card className="glass-card border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileKey className="w-4 h-4 text-muted-foreground" />
                    Licenciamento Necessário
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">{detail.licensing.text}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs h-8">Plano</TableHead>
                        <TableHead className="text-xs h-8 text-center w-20">Incluso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.licensing.plans.map((plan) => (
                        <TableRow key={plan.name}>
                          <TableCell className="text-sm py-2">{plan.name}</TableCell>
                          <TableCell className="text-center py-2">
                            {plan.included && <Check className="w-4 h-4 text-emerald-400 mx-auto" />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground leading-relaxed">{detail.licensing.note}</p>
                  <a
                    href={detail.licensing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Comparativo de licenciamento Microsoft
                  </a>
                </CardContent>
              </Card>
            )}

            <a
              href={detail.microsoftUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors px-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Documentação oficial Microsoft
            </a>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Ranking List ────────────────────────────────────────────────────────────
function RankingList({ title, icon: Icon, items, labelKey }: {
  title: string; icon: React.ElementType;
  items: { [key: string]: any; count: number }[];
  labelKey: string;
}) {
  if (!items?.length) return null;
  const maxCount = Math.max(...items.map(i => i.count), 1);

  return (
    <Card className="glass-card border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {title}
          <DataSourceDot source="aggregated" />
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1">
        {items.slice(0, 8).map((item, i) => (
          <div key={i} className="py-2 px-2 rounded-md hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 flex items-center justify-center rounded bg-secondary text-[10px] font-bold text-muted-foreground shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{item[labelKey]}</span>
              <Badge variant="secondary" className="font-mono text-xs shrink-0">{item.count}</Badge>
            </div>
            <div className="mt-1.5 ml-8 h-1 bg-secondary/60 rounded-full overflow-hidden">
              <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Main Section ────────────────────────────────────────────────────────────
interface ExchangeThreatProtectionSectionProps {
  data: ThreatProtection | null;
  loading?: boolean;
}

export function ExchangeThreatProtectionSection({ data, loading }: ExchangeThreatProtectionSectionProps) {
  const [selectedPolicy, setSelectedPolicy] = useState<{ key: PolicyKey; status: PolicyStatus } | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasRankings = data.topSpamSenderDomains?.length > 0 ||
    data.topPhishingTargets?.length > 0 ||
    data.topMalwareSenders?.length > 0;

  const policies: { key: PolicyKey; name: string; statusField: keyof typeof data.policyStatus }[] = [
    { key: 'antiSpam', name: 'Anti-Spam', statusField: 'antiSpam' },
    { key: 'antiPhish', name: 'Anti-Phishing', statusField: 'antiPhish' },
    { key: 'safeLinks', name: 'Safe Links', statusField: 'safeLinks' },
    { key: 'safeAttach', name: 'Safe Attachments', statusField: 'safeAttach' },
    { key: 'malwareFilter', name: 'Malware Filter', statusField: 'malwareFilter' },
  ];

  return (
    <div className="space-y-4">
      {/* Policy Status */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Status das Políticas de Proteção</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {policies.map(p => (
            <PolicyCard
              key={p.key}
              name={p.name}
              status={data.policyStatus[p.statusField]}
              onClick={() => setSelectedPolicy({ key: p.key, status: data.policyStatus[p.statusField] })}
            />
          ))}
        </div>
      </div>

      {/* Rankings */}
      {hasRankings && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <RankingList title="Top Origem de SPAM" icon={Globe} items={data.topSpamSenderDomains} labelKey="domain" />
          <RankingList title="Top Alvos de Phishing" icon={Users} items={data.topPhishingTargets} labelKey="user" />
          <RankingList title="Top Origem de Malware" icon={Bug} items={data.topMalwareSenders} labelKey="domain" />
        </div>
      )}

      {/* Policy Detail Sheet */}
      <PolicyDetailSheet
        open={!!selectedPolicy}
        onOpenChange={(open) => { if (!open) setSelectedPolicy(null); }}
        policyKey={selectedPolicy?.key ?? null}
        status={selectedPolicy?.status ?? 'enabled'}
      />
    </div>
  );
}
