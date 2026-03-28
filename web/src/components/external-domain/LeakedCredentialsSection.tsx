import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  KeyRound,
  Search,
  Loader2,
  AlertTriangle,
  Database,
  Mail,
  ShieldAlert,
  Settings,
  RefreshCw,
  Globe,
  Bug,
  List,
  HelpCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

type BreachType = "credential_leak" | "stealer_logs" | "scraping" | "combo_list";

interface HIBPEntry {
  email: string;
  username: string;
  database_name: string;
  breach_type?: BreachType;
}

const breachTypeConfig: Record<BreachType | "unknown", { label: string; icon: React.ElementType; className: string; tooltip: string }> = {
  credential_leak: { label: "Credential Leak", icon: KeyRound, className: "bg-destructive/15 text-destructive border-destructive/30", tooltip: "Vazamento real de credenciais (email + senha) obtidas em invasões a sistemas e bancos de dados." },
  stealer_logs: { label: "Stealer Logs", icon: Bug, className: "bg-rose-900/20 text-rose-300 border-rose-500/30", tooltip: "Credenciais capturadas por malware (info-stealer) instalado no dispositivo da vítima." },
  scraping: { label: "Scraping", icon: Globe, className: "bg-warning/15 text-warning border-warning/30", tooltip: "Dados públicos coletados automaticamente de sites, redes sociais ou registros WHOIS. Não envolve senhas." },
  combo_list: { label: "Combo List", icon: List, className: "bg-orange-500/15 text-orange-400 border-orange-500/30", tooltip: "Lista compilada a partir de múltiplos vazamentos ou dados fabricados. Origem não verificada." },
  unknown: { label: "Desconhecido", icon: HelpCircle, className: "bg-muted text-muted-foreground border-border", tooltip: "Tipo de vazamento não classificado. Execute uma nova consulta para atualizar." },
};

interface HIBPCacheData {
  client_id: string;
  domain: string;
  total_entries: number;
  entries: HIBPEntry[];
  databases: string[];
  queried_at: string;
}

function StatCard({ icon: Icon, label, value, iconClass }: { icon: React.ElementType; label: string; value: number | string; iconClass?: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={cn("w-8 h-8", iconClass)} />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineSection({
  icon: Icon,
  iconColor,
  iconBorderClass = "border-primary/40 bg-primary/10",
  title,
  isLast,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBorderClass?: string;
  title: string;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {!isLast && <div className="absolute left-6 top-full w-1 h-4 bg-primary/50 z-0" />}
      <div className="rounded-xl border border-border/60 bg-card/30 mb-4">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/40">
          <div className={cn("w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0", iconBorderClass)}>
            <Icon className={cn("w-4 h-4", iconColor)} />
          </div>
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Domain Selection Modal ── */

function DomainSelectionModal({
  open,
  onOpenChange,
  domains,
  isPending,
  progressText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  domains: string[];
  isPending: boolean;
  progressText: string;
  onConfirm: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(domains));

  // Reset selection when modal opens
  React.useEffect(() => {
    if (open) setSelected(new Set(domains));
  }, [open, domains]);

  const toggleDomain = (d: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === domains.length) setSelected(new Set());
    else setSelected(new Set(domains));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-rose-400" />
            Selecionar Domínios para Consulta HIBP
          </DialogTitle>
          <DialogDescription>
            Selecione os domínios que deseja consultar no Have I Been Pwned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Select all */}
          <label className="flex items-center gap-2 cursor-pointer px-1">
            <Checkbox
              checked={selected.size === domains.length}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm font-medium">Selecionar todos</span>
            <span className="text-xs text-muted-foreground ml-auto">{domains.length} domínio(s)</span>
          </label>

          <div className="border-t border-border/50" />

          {/* Domain list */}
          <div className="max-h-60 overflow-y-auto space-y-2 px-1">
            {domains.map((d) => (
              <label key={d} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={selected.has(d)}
                  onCheckedChange={() => toggleDomain(d)}
                />
                <span className="text-sm font-mono">{d}</span>
              </label>
            ))}
          </div>

          {isPending && progressText && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {progressText}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0 || isPending}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Consultar ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Component ── */

export default function LeakedCredentialsSection({
  clientId,
  domains,
  isSuperRole,
}: {
  clientId: string;
  domains: string[];
  isSuperRole: boolean;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [progressText, setProgressText] = useState('');

  // Fetch cached data for ALL domains of this client
  const { data: allCacheData, isLoading } = useQuery({
    queryKey: ['dehashed-cache', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dehashed_cache' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('queried_at', { ascending: false });
      if (error) throw error;
      // Deduplicate: keep latest per domain
      const byDomain = new Map<string, HIBPCacheData>();
      for (const row of (data as any[]) || []) {
        if (!byDomain.has(row.domain)) {
          byDomain.set(row.domain, row as HIBPCacheData);
        }
      }
      return Array.from(byDomain.values());
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  // Check if API key is configured
  const { data: apiKeysStatus } = useQuery({
    queryKey: ['hibp-api-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'GET',
      });
      if (error) return { configured: false };
      const keys = data?.keys || [];
      const hibpKey = keys.find((k: any) => k.name === 'HIBP_API_KEY');
      return { configured: !!hibpKey?.configured };
    },
    staleTime: 1000 * 60 * 10,
  });

  // Query mutation for multiple domains
  const queryMutation = useMutation({
    mutationFn: async ({ selectedDomains, forceRefresh }: { selectedDomains: string[]; forceRefresh: boolean }) => {
      const results: HIBPCacheData[] = [];
      for (let i = 0; i < selectedDomains.length; i++) {
        const domain = selectedDomains[i];
        setProgressText(`Consultando ${domain} (${i + 1}/${selectedDomains.length})...`);
        const { data, error } = await supabase.functions.invoke('dehashed-search', {
          body: { domain, client_id: clientId, force_refresh: forceRefresh },
        });
        if (error) throw error;
        if (data?.error) throw new Error(`${domain}: ${data.error}`);
        results.push(data.data as HIBPCacheData);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dehashed-cache', clientId] });
      toast.success('Consulta HIBP concluída');
      setModalOpen(false);
      setProgressText('');
    },
    onError: (err: any) => {
      setProgressText('');
      if (err.message?.includes('NO_API_KEY')) {
        toast.error('API key do HIBP não configurada. Vá em Settings > API Keys.');
      } else {
        toast.error(`Erro ao consultar HIBP: ${err.message}`);
      }
    },
  });

  // Consolidated stats
  const stats = useMemo(() => {
    if (!allCacheData || allCacheData.length === 0) return { total: 0, uniqueBreaches: 0, uniqueEmails: 0 };
    let total = 0;
    const dbSet = new Set<string>();
    const emailSet = new Set<string>();
    for (const cache of allCacheData) {
      total += cache.total_entries;
      for (const db of cache.databases || []) dbSet.add(db);
      for (const e of cache.entries || []) if (e.email) emailSet.add(e.email);
    }
    return { total, uniqueBreaches: dbSet.size, uniqueEmails: emailSet.size };
  }, [allCacheData]);

  // All entries with domain info
  const allEntries = useMemo(() => {
    if (!allCacheData) return [];
    return allCacheData.flatMap((cache) =>
      (cache.entries || []).map((e) => ({ ...e, domain: cache.domain }))
    );
  }, [allCacheData]);

  // All unique databases
  const allDatabases = useMemo(() => {
    if (!allCacheData) return [];
    const dbSet = new Set<string>();
    for (const cache of allCacheData) {
      for (const db of cache.databases || []) dbSet.add(db);
    }
    return Array.from(dbSet);
  }, [allCacheData]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (!allEntries.length) return [];
    if (!searchTerm) return allEntries;
    const q = searchTerm.toLowerCase();
    return allEntries.filter(
      (e) =>
        e.email?.toLowerCase().includes(q) ||
        e.username?.toLowerCase().includes(q) ||
        e.database_name?.toLowerCase().includes(q) ||
        e.domain?.toLowerCase().includes(q)
    );
  }, [allEntries, searchTerm]);

  const hasData = allCacheData && allCacheData.length > 0;

  // Cache age (oldest)
  const cacheAgeText = useMemo(() => {
    if (!allCacheData || allCacheData.length === 0) return null;
    const oldest = allCacheData.reduce((a, b) =>
      new Date(a.queried_at) < new Date(b.queried_at) ? a : b
    );
    const days = Math.floor((Date.now() - new Date(oldest.queried_at).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'hoje';
    if (days === 1) return 'ontem';
    return `há ${days} dias`;
  }, [allCacheData]);

  const handleOpenModal = () => setModalOpen(true);

  const handleConfirmQuery = (selectedDomains: string[], forceRefresh = false) => {
    queryMutation.mutate({ selectedDomains, forceRefresh });
  };

  if (domains.length === 0) return null;

  return (
    <TimelineSection
      icon={KeyRound}
      iconColor="text-rose-400"
      iconBorderClass="border-rose-400/40 bg-rose-400/10"
      title="Credenciais Vazadas (HIBP)"
      isLast
    >
      {/* Domain Selection Modal */}
      <DomainSelectionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        domains={domains}
        isPending={queryMutation.isPending}
        progressText={progressText}
        onConfirm={(selected) => handleConfirmQuery(selected, hasData ? true : false)}
      />

      {/* No API key configured */}
      {apiKeysStatus && !apiKeysStatus.configured && !hasData && (
        <Card className="glass-card border-warning/30">
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Settings className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">API Key do HIBP não configurada</p>
              <p className="text-sm mt-1">
                Vá em <strong>Settings &gt; API Keys</strong> e cadastre{' '}
                <code className="text-xs bg-muted px-1 rounded">HIBP_API_KEY</code>
              </p>
              <p className="text-xs mt-2 text-muted-foreground/70">
                O domínio deve estar registrado no{' '}
                <a href="https://haveibeenpwned.com/DomainSearch" target="_blank" rel="noopener noreferrer" className="underline">
                  Domain Search Dashboard
                </a>{' '}
                do HIBP
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No data yet, but API key might be configured */}
      {!hasData && !isLoading && (apiKeysStatus?.configured || !apiKeysStatus) && (
        <Card className="glass-card">
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma consulta realizada</p>
              <p className="text-sm mt-1">Clique abaixo para consultar credenciais vazadas</p>
              {isSuperRole && (
                <Button className="mt-4" onClick={handleOpenModal} disabled={queryMutation.isPending}>
                  {queryMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  Consultar HIBP
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Has data */}
      {hasData && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={KeyRound} label="Total Vazamentos" value={stats.total} iconClass="text-rose-400" />
            <StatCard icon={Database} label="Breaches Únicos" value={stats.uniqueBreaches} iconClass="text-amber-400" />
            <StatCard icon={Mail} label="Emails Únicos" value={stats.uniqueEmails} iconClass="text-blue-400" />
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por email, username, breach ou domínio..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {isSuperRole && (
              <>
                <Button
                  size="sm"
                  onClick={handleOpenModal}
                  disabled={queryMutation.isPending}
                  className="gap-1.5"
                >
                  {queryMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  Consultar HIBP
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenModal}
                  disabled={queryMutation.isPending}
                  className="gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Atualizar
                </Button>
              </>
            )}

            {cacheAgeText && (
              <span className="text-xs text-muted-foreground ml-auto">
                Última consulta: {cacheAgeText}
              </span>
            )}
          </div>

          {/* Breaches list */}
          {allDatabases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allDatabases.map((db) => (
                <Badge key={db} variant="outline" className="text-[10px] px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/30">
                  {db}
                </Badge>
              ))}
            </div>
          )}

          {/* Entries table */}
          {filteredEntries.length > 0 && (
            <TooltipProvider delayDuration={200}>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Domínio</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Breach</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.slice(0, 100).map((entry, i) => {
                      const bt = entry.breach_type && breachTypeConfig[entry.breach_type]
                        ? breachTypeConfig[entry.breach_type]
                        : breachTypeConfig.unknown;
                      const BtIcon = bt.icon;
                      return (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs">{entry.email}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              {entry.domain}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {entry.database_name ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/30">
                                {entry.database_name}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
          <td className="px-3 py-2">
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <span className="inline-flex cursor-help">
                                   <Badge variant="outline" className={cn("text-[10px] px-1.5 gap-1", bt.className)}>
                                     <BtIcon className="w-3 h-3" />
                                     {bt.label}
                                   </Badge>
                                 </span>
                               </TooltipTrigger>
                               <TooltipContent side="top" className="max-w-xs text-xs">
                                 {bt.tooltip}
                               </TooltipContent>
                             </Tooltip>
                           </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredEntries.length > 100 && (
                <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t border-border/30">
                  Exibindo 100 de {filteredEntries.length} resultados
                </div>
              )}
            </div>
            </TooltipProvider>
          )}

          {filteredEntries.length === 0 && searchTerm && (
            <p className="text-center text-muted-foreground py-4 text-sm">
              Nenhum resultado para "{searchTerm}"
            </p>
          )}

          {stats.total === 0 && !searchTerm && (
            <Card className="glass-card">
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-teal-400 opacity-60" />
                  <p className="font-medium text-teal-400">Nenhuma credencial vazada encontrada</p>
                  <p className="text-sm mt-1">Nenhum dos domínios consultados possui registros no HIBP.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </TimelineSection>
  );
}
