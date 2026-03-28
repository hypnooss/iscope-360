import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Globe, Server, Loader2, Play, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface DNSTarget {
  ip: string;
  label: string;
}

interface FirewallTarget {
  ip: string;
  label: string;
  subnet: string | null;
  expanded_ips: string[];
}

interface PreviewData {
  dns: DNSTarget[];
  firewall: FirewallTarget[];
}

interface AttackSurfaceScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onStartScan: (selectedIps: { ip: string; source: 'dns' | 'firewall'; label: string }[]) => void;
  isPending: boolean;
}

export function AttackSurfaceScanDialog({ open, onOpenChange, clientId, onStartScan, isPending }: AttackSurfaceScanDialogProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDNS, setSelectedDNS] = useState<Set<string>>(new Set());
  const [selectedFW, setSelectedFW] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    supabase.functions.invoke('attack-surface-preview', { body: { client_id: clientId } })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        const d = data as PreviewData;
        setPreview(d);
        // Select all by default
        setSelectedDNS(new Set(d.dns.map(t => t.ip)));
        setSelectedFW(new Set(d.firewall.map((_, i) => i)));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const totalTargets = (preview?.dns.length ?? 0) + (preview?.firewall.length ?? 0);
  const selectedCount = selectedDNS.size + selectedFW.size;

  const totalIPs = useMemo(() => {
    if (!preview) return 0;
    let count = selectedDNS.size;
    for (const idx of selectedFW) {
      count += preview.firewall[idx]?.expanded_ips.length ?? 0;
    }
    return count;
  }, [preview, selectedDNS, selectedFW]);

  const selectAll = () => {
    if (!preview) return;
    setSelectedDNS(new Set(preview.dns.map(t => t.ip)));
    setSelectedFW(new Set(preview.firewall.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedDNS(new Set());
    setSelectedFW(new Set());
  };

  const toggleDNS = (ip: string) => {
    setSelectedDNS(prev => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip); else next.add(ip);
      return next;
    });
  };

  const toggleFW = (idx: number) => {
    setSelectedFW(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleStart = () => {
    if (!preview) return;
    const ips: { ip: string; source: 'dns' | 'firewall'; label: string }[] = [];

    for (const t of preview.dns) {
      if (selectedDNS.has(t.ip)) {
        ips.push({ ip: t.ip, source: 'dns', label: t.label });
      }
    }

    for (let i = 0; i < preview.firewall.length; i++) {
      if (selectedFW.has(i)) {
        const fw = preview.firewall[i];
        for (const eip of fw.expanded_ips) {
          ips.push({ ip: eip, source: 'firewall', label: fw.label });
        }
      }
    }

    onStartScan(ips);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            Selecionar Alvos do Scan
          </DialogTitle>
        </DialogHeader>

        <Alert variant="default" className="border-warning/30 bg-warning/5">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <AlertDescription className="text-sm text-muted-foreground">
            Essas informações foram coletadas de forma automática, convém revisar manualmente, visto que o processo de Surface Analyzer é um processo lento e caro.
          </AlertDescription>
        </Alert>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Buscando alvos...</span>
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive py-4 text-center">{error}</div>
        )}

        {preview && !loading && (
          <>
            {/* Bulk actions + counter */}
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-sm text-muted-foreground">
                {selectedCount} de {totalTargets} alvos selecionados ({totalIPs} IPs)
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  <CheckSquare className="w-4 h-4 mr-1" /> Selecionar Todos
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  <Square className="w-4 h-4 mr-1" /> Deselecionar Todos
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* DNS Section */}
              {preview.dns.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 text-teal-400" />
                    <span className="text-sm font-semibold">DNS</span>
                    <Badge variant="outline" className="text-xs">{preview.dns.length}</Badge>
                  </div>
                  <div className="space-y-1">
                    {preview.dns.map(t => (
                      <label
                        key={t.ip}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                          "hover:bg-muted/50",
                          selectedDNS.has(t.ip) && "bg-muted/30"
                        )}
                      >
                        <Checkbox
                          checked={selectedDNS.has(t.ip)}
                          onCheckedChange={() => toggleDNS(t.ip)}
                        />
                        <span className="text-sm font-mono">{t.ip}</span>
                        <span className="text-xs text-muted-foreground truncate">{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Firewall Section */}
              {preview.firewall.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold">Firewall</span>
                    <Badge variant="outline" className="text-xs">{preview.firewall.length}</Badge>
                  </div>
                  <div className="space-y-1">
                    {preview.firewall.map((t, idx) => (
                      <label
                        key={idx}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                          "hover:bg-muted/50",
                          selectedFW.has(idx) && "bg-muted/30"
                        )}
                      >
                        <Checkbox
                          checked={selectedFW.has(idx)}
                          onCheckedChange={() => toggleFW(idx)}
                        />
                        <div className="flex items-center gap-2 min-w-0">
                          {t.subnet ? (
                            <span className="text-sm font-mono">{t.subnet}</span>
                          ) : (
                            <span className="text-sm font-mono">{t.ip}</span>
                          )}
                          {t.expanded_ips.length > 1 && (
                            <Badge variant="outline" className="text-[10px]">
                              {t.expanded_ips.length} IPs
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {preview.dns.length === 0 && preview.firewall.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Nenhum alvo encontrado. Certifique-se de ter domínios e firewalls analisados.
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleStart}
            disabled={isPending || selectedCount === 0 || loading}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
            Iniciar Scan ({totalIPs} IPs)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
