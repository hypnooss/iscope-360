import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  MailX, ShieldAlert, Bug, Search, Layers,
  Users, Globe, FileText, Wrench, Mail,
  AlertTriangle, ShieldOff, RotateCcw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThreatItemType = 'spam' | 'phishing' | 'malware';

export interface ThreatDetailItem {
  type: ThreatItemType;
  label: string;
  count: number;
  recipients?: string[];
  senders?: string[];
  sampleSubjects?: string[];
}

// ─── Config ──────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ThreatItemType, {
  icon: typeof MailX;
  label: string;
  color: string;
  bgClass: string;
  borderClass: string;
  description: (label: string, count: number) => string;
  recommendation: (label: string) => string;
}> = {
  spam: {
    icon: MailX,
    label: 'SPAM',
    color: 'text-orange-400',
    bgClass: 'bg-orange-500/10',
    borderClass: 'border-orange-500/30',
    description: (l, c) => `O domínio ${l} enviou ${c} email(s) de SPAM para sua organização no período analisado. Estes emails foram bloqueados pelo filtro anti-spam.`,
    recommendation: (l) => `Considere bloquear o domínio ${l} nas regras de transporte do Exchange Online para impedir futuras tentativas. Verifique se os filtros anti-spam estão configurados adequadamente.`,
  },
  phishing: {
    icon: ShieldAlert,
    label: 'Phishing',
    color: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/30',
    description: (l, c) => `O usuário ${l} foi alvo de ${c} tentativa(s) de phishing no período analisado. Os emails foram movidos para quarentena.`,
    recommendation: (l) => `Aplique treinamento de conscientização de segurança para ${l}. Verifique se o MFA está ativo e considere reforçar as políticas de Safe Links e Anti-Phishing.`,
  },
  malware: {
    icon: Bug,
    label: 'Malware',
    color: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/30',
    description: (l, c) => `O domínio ${l} foi fonte de ${c} email(s) contendo malware bloqueados no período analisado.`,
    recommendation: (l) => `Bloqueie o domínio ${l} imediatamente nas regras de transporte. Investigue se algum anexo foi aberto e execute varredura nos endpoints afetados.`,
  },
};

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, variant = 'default', children }: {
  title: string; icon: typeof FileText; variant?: 'default' | 'warning'; children: React.ReactNode;
}) {
  const styles = variant === 'warning'
    ? { bg: 'bg-warning/10 border-warning/30', icon: 'text-warning' }
    : { bg: 'bg-muted/30 border-border/30', icon: 'text-muted-foreground' };
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Icon className={cn('w-3 h-3', styles.icon)} />
        {title}
      </h5>
      <div className={cn('rounded-md p-3 border', styles.bg)}>
        <p className="text-sm text-foreground whitespace-pre-line">{children}</p>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ThreatDetailSheetProps {
  item: ThreatDetailItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDismissed?: boolean;
  onDismiss?: (type: string, label: string, reason?: string) => void;
  onRestore?: (type: string, label: string) => void;
  isDismissing?: boolean;
  isRestoring?: boolean;
}

export function ThreatDetailSheet({ item, open, onOpenChange, isDismissed, onDismiss, onRestore, isDismissing, isRestoring }: ThreatDetailSheetProps) {
  const [reason, setReason] = useState('');
  const [showDismissForm, setShowDismissForm] = useState(false);

  if (!item) return null;

  const cfg = TYPE_CONFIG[item.type];
  const Icon = cfg.icon;
  const contacts = item.type === 'phishing' ? item.senders : item.recipients;
  const contactLabel = item.type === 'phishing' ? 'Domínios de Origem' : 'Usuários Afetados';
  const contactIcon = item.type === 'phishing' ? Globe : Users;
  const ContactIcon = contactIcon;
  const hasEvidence = (contacts && contacts.length > 0) || (item.sampleSubjects && item.sampleSubjects.length > 0);

  const handleDismiss = () => {
    onDismiss?.(item.type, item.label, reason || undefined);
    setShowDismissForm(false);
    setReason('');
  };

  const handleRestore = () => {
    onRestore?.(item.type, item.label);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setShowDismissForm(false); setReason(''); } }}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] overflow-y-auto p-0">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-start gap-3">
            <div className={cn('p-2.5 rounded-lg border flex-shrink-0', cfg.bgClass, cfg.borderClass)}>
              <Icon className={cn('w-5 h-5', cfg.color)} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <SheetTitle className="text-base font-semibold text-foreground leading-tight">
                {item.label}
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn('text-xs', cfg.bgClass, cfg.color, cfg.borderClass)}>
                  {cfg.label}
                </Badge>
                <Badge variant="secondary" className="text-xs font-mono">
                  {item.count} ocorrências
                </Badge>
                {isDismissed && (
                  <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground border-muted-foreground/30">
                    <ShieldOff className="w-3 h-3 mr-1" />
                    Falso Positivo
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="analise" className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-6 h-auto py-0">
            <TabsTrigger value="analise" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
              <Search className="w-3.5 h-3.5 mr-1.5" />
              Análise
            </TabsTrigger>
            {hasEvidence && (
              <TabsTrigger value="evidencias" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                Evidências
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab: Análise */}
          <TabsContent value="analise" className="p-6 space-y-4 mt-0">
            <Section title="DESCRIÇÃO" icon={FileText}>
              {cfg.description(item.label, item.count)}
            </Section>
            <Section title="IMPACTO" icon={FileText} variant="warning">
              {item.type === 'spam' && `${item.count} email(s) de SPAM foram direcionados a ${contacts?.length || 0} usuário(s) da organização. Embora bloqueados, indicam que o domínio da organização pode estar em listas de distribuição de spammers.`}
              {item.type === 'phishing' && `Este usuário é um alvo recorrente de phishing, com ${item.count} tentativa(s) detectada(s). Caso alguma tentativa seja bem-sucedida, pode resultar em comprometimento de credenciais e acesso não autorizado.`}
              {item.type === 'malware' && `${item.count} email(s) com malware foram enviados deste domínio, afetando ${contacts?.length || 0} usuário(s). Se algum anexo foi executado, pode haver comprometimento de endpoints.`}
            </Section>
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-primary" />
                RECOMENDAÇÃO
              </h5>
              <div className="rounded-md p-3 border bg-primary/5 border-primary/20">
                <p className="text-sm text-foreground">{cfg.recommendation(item.label)}</p>
              </div>
            </div>

            {/* False positive action */}
            {(onDismiss || onRestore) && (
              <div className="pt-2 border-t border-border/50 space-y-3">
                <Alert className="border-warning/30 bg-warning/5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-xs text-muted-foreground">
                    Esta ação é apenas na plataforma iScope e <strong>não altera configurações no Microsoft 365</strong>.
                  </AlertDescription>
                </Alert>

                {isDismissed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleRestore}
                    disabled={isRestoring}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar Item
                  </Button>
                ) : showDismissForm ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Motivo (opcional)..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="text-sm h-20 resize-none"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowDismissForm(false)}>
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={handleDismiss}
                        disabled={isDismissing}
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        Confirmar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowDismissForm(true)}
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Marcar como Falso Positivo
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          {/* Tab: Evidências */}
          {hasEvidence && (
            <TabsContent value="evidencias" className="p-6 space-y-4 mt-0">
              {contacts && contacts.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ContactIcon className="w-3 h-3 text-muted-foreground" />
                    {contactLabel.toUpperCase()}
                  </h5>
                  <div className="rounded-md border border-border/50 divide-y divide-border/30">
                    {contacts.map((c, i) => (
                      <div key={i} className="px-3 py-2 text-sm text-foreground flex items-center gap-2">
                        <ContactIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {item.sampleSubjects && item.sampleSubjects.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    ASSUNTOS DOS EMAILS
                  </h5>
                  <div className="rounded-md border border-border/50 divide-y divide-border/30">
                    {item.sampleSubjects.map((s, i) => (
                      <div key={i} className="px-3 py-2 text-sm text-foreground truncate">
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
