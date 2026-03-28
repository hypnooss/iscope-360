import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Server, Shield, ShieldAlert, Lock, Bug, Globe, Network,
  ChevronDown, ChevronRight, ExternalLink, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SurfaceFindingCard } from './SurfaceFindingCard';
import type { SurfaceFinding } from '@/lib/surfaceFindings';
import type { AttackSurfaceService, AttackSurfaceWebService, AttackSurfaceCVE } from '@/hooks/useAttackSurfaceData';
import { useState } from 'react';

// ─── Types ──────────────────────────────────────────────────

interface TLSCertInfo {
  subject_cn: string;
  issuer: string;
  not_after: string | null;
  daysRemaining: number | null;
}

interface AssetDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostname: string;
  ip: string;
  ports: number[];
  services: AttackSurfaceService[];
  webServices: AttackSurfaceWebService[];
  tlsCerts: TLSCertInfo[];
  cves: AttackSurfaceCVE[];
  allTechs: string[];
  findings: SurfaceFinding[];
}


// ─── Services Tab ───────────────────────────────────────────

function ServicesTab({ services, webServices }: {
  services: AttackSurfaceService[];
  webServices: AttackSurfaceWebService[];
}) {
  return (
    <div className="space-y-4">
      {services.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Network className="w-3 h-3" /> Serviços de Rede ({services.length})
          </h4>
          <div className="space-y-2">
            {services.map((svc, i) => (
              <ServiceRow key={i} svc={svc} />
            ))}
          </div>
        </div>
      )}

      {webServices.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Globe className="w-3 h-3" /> Serviços Web ({webServices.length})
          </h4>
          <div className="space-y-2">
            {webServices.map((ws, i) => (
              <WebServiceRow key={i} ws={ws} />
            ))}
          </div>
        </div>
      )}

      {services.length === 0 && webServices.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum serviço detectado.</p>
      )}
    </div>
  );
}

function ServiceRow({ svc }: { svc: AttackSurfaceService }) {
  const hasScripts = svc.scripts && Object.keys(svc.scripts).length > 0;
  const [open, setOpen] = useState(false);

  const content = (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[11px] font-mono px-1.5 py-0 bg-orange-500/10 text-orange-400 border-orange-500/30">
          {svc.port}/{svc.transport || 'tcp'}
        </Badge>
        <span className="text-sm font-medium">{svc.product || svc.name || 'Desconhecido'}</span>
        {svc.version && (
          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">{svc.version}</Badge>
        )}
      </div>
      {svc.extra_info && (
        <p className="text-xs text-muted-foreground mt-1 font-mono">{svc.extra_info}</p>
      )}
    </div>
  );

  if (!hasScripts) return content;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border/50 bg-card/50 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[11px] font-mono px-1.5 py-0 bg-orange-500/10 text-orange-400 border-orange-500/30">
            {svc.port}/{svc.transport || 'tcp'}
          </Badge>
          <span className="text-sm font-medium">{svc.product || svc.name || 'Desconhecido'}</span>
          {svc.version && (
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">{svc.version}</Badge>
          )}
          <CollapsibleTrigger asChild>
            <button className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              NSE Scripts
            </button>
          </CollapsibleTrigger>
        </div>
        {svc.extra_info && (
          <p className="text-xs text-muted-foreground mt-1 font-mono">{svc.extra_info}</p>
        )}
        <CollapsibleContent>
          <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
            {Object.entries(svc.scripts!).map(([key, val]) => (
              <div key={key} className="text-xs bg-muted/30 rounded px-2.5 py-1.5 border border-border/30">
                <span className="text-muted-foreground font-mono">{key}:</span>
                <pre className="text-foreground whitespace-pre-wrap mt-0.5 break-all">{val}</pre>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function WebServiceRow({ ws }: { ws: AttackSurfaceWebService }) {
  const statusColor = ws.status_code >= 200 && ws.status_code < 300
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : ws.status_code >= 300 && ws.status_code < 400
      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      : 'bg-red-500/10 text-red-400 border-red-500/30';

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('text-[11px] font-mono px-1.5 py-0', statusColor)}>
          {ws.status_code}
        </Badge>
        <span className="text-sm font-medium font-mono truncate">{ws.url}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {ws.server && (
          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">{ws.server}</Badge>
        )}
        {(ws.technologies || []).map((t, i) => (
          <Badge key={i} variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/30">{t}</Badge>
        ))}
      </div>
      {ws.title && <p className="text-xs text-muted-foreground">{ws.title}</p>}
    </div>
  );
}

// ─── CVEs Tab ───────────────────────────────────────────────

const CVE_SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-500 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
};

function CVEsTab({ cves }: { cves: AttackSurfaceCVE[] }) {
  const sorted = [...cves].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma CVE vinculada a este host.</p>;
  }

  return (
    <div className="space-y-2">
      {sorted.map(cve => {
        const sev = (cve.severity || 'medium').toLowerCase();
        const colorClass = CVE_SEVERITY_COLORS[sev] || CVE_SEVERITY_COLORS.medium;
        return (
          <div key={cve.cve_id} className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {cve.advisory_url ? (
                <a href={cve.advisory_url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-mono font-medium text-primary hover:underline flex items-center gap-1">
                  {cve.cve_id} <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-sm font-mono font-medium">{cve.cve_id}</span>
              )}
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', colorClass)}>
                {sev.charAt(0).toUpperCase() + sev.slice(1)}
              </Badge>
              {cve.score != null && (
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 ml-auto">
                  CVSS {cve.score.toFixed(1)}
                </Badge>
              )}
            </div>
            {cve.title && <p className="text-xs text-muted-foreground line-clamp-2">{cve.title}</p>}
            {cve.products && cve.products.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {cve.products.map((p: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px] font-mono px-1.5 py-0">{p}</Badge>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Certificates Tab ───────────────────────────────────────

function CertificatesTab({ certs }: { certs: TLSCertInfo[] }) {
  if (certs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhum certificado TLS encontrado.</p>;
  }

  return (
    <div className="space-y-2">
      {certs.map((cert, i) => {
        const isExpired = cert.daysRemaining !== null && cert.daysRemaining < 0;
        const isExpiring = cert.daysRemaining !== null && cert.daysRemaining >= 0 && cert.daysRemaining <= 30;
        const statusColor = isExpired
          ? 'border-l-red-500'
          : isExpiring
            ? 'border-l-yellow-500'
            : 'border-l-emerald-500';
        const statusLabel = isExpired
          ? `Expirado há ${Math.abs(cert.daysRemaining!)} dias`
          : isExpiring
            ? `Expira em ${cert.daysRemaining} dias`
            : cert.daysRemaining !== null
              ? `Válido — ${cert.daysRemaining} dias restantes`
              : 'Validade desconhecida';
        const statusBadgeClass = isExpired
          ? 'bg-red-500/20 text-red-500 border-red-500/30'
          : isExpiring
            ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30'
            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

        return (
          <div key={i} className={cn('rounded-lg border border-border/50 bg-card/50 p-3 border-l-4 space-y-1.5', statusColor)}>
            <div className="flex items-center gap-2 flex-wrap">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium font-mono">{cert.subject_cn}</span>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 ml-auto', statusBadgeClass)}>
                {statusLabel}
              </Badge>
            </div>
            <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">Emissor:</span>
              <span className="truncate">{cert.issuer}</span>
              <span className="text-muted-foreground">Expira em:</span>
              <span className="font-mono">{cert.not_after ? new Date(cert.not_after).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function AssetDetailSheet({
  open, onOpenChange,
  hostname, ip, ports, services, webServices, tlsCerts, cves, allTechs, findings,
}: AssetDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-lg">{hostname}</SheetTitle>
              <p className="text-sm text-muted-foreground font-mono">{ip}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-400 border-orange-500/30">
              {ports.length} porta{ports.length !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
              {services.length + webServices.length} serviço{services.length + webServices.length !== 1 ? 's' : ''}
            </Badge>
            {cves.length > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-500/10 text-red-500 border-red-500/30">
                {cves.length} CVE{cves.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {tlsCerts.length > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                {tlsCerts.length} cert{tlsCerts.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="analise" className="flex flex-col h-[calc(100vh-140px)]">
          <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-6 h-auto py-0">
            <TabsTrigger value="analise" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
              <Search className="w-3.5 h-3.5 mr-1.5" />
              Análise
            </TabsTrigger>
            <TabsTrigger value="servicos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
              <Network className="w-3.5 h-3.5 mr-1.5" />
              Serviços
            </TabsTrigger>
            <TabsTrigger value="cves" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
              <Bug className="w-3.5 h-3.5 mr-1.5" />
              CVEs ({cves.length})
            </TabsTrigger>
            <TabsTrigger value="certificados" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Certificados ({tlsCerts.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="analise" className="p-6 space-y-4 mt-0">
              {findings.length > 0 ? (
                <div className="space-y-2">
                  {findings.map(f => (
                    <SurfaceFindingCard key={f.id} finding={f} hideAffectedAssets />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum achado para este ativo.</p>
              )}
            </TabsContent>

            <TabsContent value="servicos" className="p-6 mt-0">
              <ServicesTab services={services} webServices={webServices} />
            </TabsContent>

            <TabsContent value="cves" className="p-6 mt-0">
              <CVEsTab cves={cves} />
            </TabsContent>

            <TabsContent value="certificados" className="p-6 mt-0">
              <CertificatesTab certs={tlsCerts} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
