import React, { useState, useMemo, useEffect } from 'react';
import { 
  Globe, 
  Server, 
  Mail, 
  FileText, 
  Shield, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ComplianceCategory, ComplianceReport, SubdomainSummary } from '@/types/compliance';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DNSMapSectionProps {
  domain: string;
  dnsSummary?: ComplianceReport['dnsSummary'];
  subdomainSummary?: SubdomainSummary;
  categories: ComplianceCategory[];
  emailAuth: { spf: boolean; dkim: boolean; dmarc: boolean };
  className?: string;
}

interface NsRecord {
  host: string;
  resolvedIps: string[];
}

interface MxRecord {
  exchange: string;
  priority: number;
  ips: string[];
}

interface DkimKey {
  selector: string;
  keySize: number | null;
}

interface DmarcPolicy {
  p: string | null;
  sp: string | null;
}

type SubdomainFilter = 'all' | 'active' | 'inactive';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const extractNsRecords = (categories: ComplianceCategory[]): NsRecord[] => {
  const allChecks = categories.flatMap(c => c.checks);
  const nsCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'ns_records');
  const records = (nsCheck?.rawData as any)?.data?.records || [];
  
  return records.map((r: any) => ({
    host: r.host || r.name || r.value || 'Unknown',
    resolvedIps: Array.isArray(r.resolved_ips) ? r.resolved_ips : [],
  })).filter((ns: NsRecord) => ns.host && ns.host !== 'Unknown');
};

const extractMxRecords = (categories: ComplianceCategory[]): MxRecord[] => {
  const allChecks = categories.flatMap(c => c.checks);
  const mxCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'mx_records');
  const records = (mxCheck?.rawData as any)?.data?.records || [];
  
  return records.map((r: any) => ({
    exchange: r.exchange || r.host || 'Unknown',
    priority: r.priority || 0,
    ips: r.resolved_ips || [],
  }));
};

const extractSpfRecord = (categories: ComplianceCategory[]): string | null => {
  const allChecks = categories.flatMap(c => c.checks);
  const spfCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'spf_record');
  return (spfCheck?.rawData as any)?.data?.raw || null;
};

const extractDkimKeys = (categories: ComplianceCategory[]): DkimKey[] => {
  const allChecks = categories.flatMap(c => c.checks);
  const dkimCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'dkim_records');
  const found = (dkimCheck?.rawData as any)?.data?.found || [];
  return found.map((f: any) => ({
    selector: f.selector,
    keySize: f.key_size_bits || null,
  })).filter((k: DkimKey) => k.selector);
};

const extractDmarcPolicy = (categories: ComplianceCategory[]): DmarcPolicy => {
  const allChecks = categories.flatMap(c => c.checks);
  const dmarcCheck = allChecks.find((ch: any) => ch.rawData?.step_id === 'dmarc_record');
  const parsed = (dmarcCheck?.rawData as any)?.data?.parsed || {};
  return {
    p: parsed.p || null,
    sp: parsed.sp || null,
  };
};

const truncateHostname = (hostname: string, maxLen = 25): string => {
  if (hostname.length <= maxLen) return hostname;
  return hostname.substring(0, maxLen - 2) + '…';
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

interface DNSNodeProps {
  label: string;
  value?: string;
  sublabel?: string;
  isActive?: boolean;
  showCopy?: boolean;
  showExternalLink?: boolean;
  className?: string;
}

function DNSNode({ label, value, sublabel, isActive, showCopy, showExternalLink, className }: DNSNodeProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    const textToCopy = value || label;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  return (
    <div className={cn(
      "group relative flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all",
      "bg-[hsl(220_18%_8%)] border-border/40 hover:border-border/60",
      className
    )}>
      {isActive !== undefined && (
        <span 
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            isActive 
              ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" 
              : "bg-muted-foreground/30"
          )}
          title={isActive ? "Ativo" : "Inativo"}
        />
      )}
      
      <div className="flex-1 min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-mono text-foreground truncate block cursor-default">
                {truncateHostname(label)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="font-mono text-xs break-all">{label}</p>
              {value && <p className="text-xs text-muted-foreground mt-1">{value}</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {sublabel && (
          <span className="text-[13px] text-muted-foreground truncate block">{sublabel}</span>
        )}
      </div>
      
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 flex-shrink-0">
        {showCopy && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="w-3 h-3 text-primary" />
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground" />
            )}
          </Button>
        )}
        {showExternalLink && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            asChild
          >
            <a
              href={`https://${label}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

interface DNSGroupProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function DNSGroup({ title, count, icon, color, children, defaultExpanded = true }: DNSGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="flex flex-col">
      {/* Group Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
          "hover:bg-muted/30",
          color
        )}
      >
        <div className="p-1.5 rounded-md bg-background/50">
          {icon}
        </div>
        <span className="font-medium text-sm text-foreground">{title}</span>
        <Badge variant="secondary" className="ml-auto text-xs bg-background/50">
          {count}
        </Badge>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Connector Line */}
      <div className="flex justify-center h-3">
        <div className="w-px bg-border/50" />
      </div>

      {/* Items - No scrollbar, variable height */}
      {isExpanded && (
        <div className="space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function DNSMapSection({ 
  domain, 
  dnsSummary, 
  subdomainSummary, 
  categories, 
  emailAuth,
  className 
}: DNSMapSectionProps) {
  const [subdomainFilter, setSubdomainFilter] = useState<SubdomainFilter>('active');
  const [subdomainVisibleCount, setSubdomainVisibleCount] = useState(10);
  
  const nsRecords = useMemo(() => extractNsRecords(categories), [categories]);
  const mxRecords = useMemo(() => extractMxRecords(categories), [categories]);
  const spfRecord = useMemo(() => extractSpfRecord(categories), [categories]);
  const dkimKeys = useMemo(() => extractDkimKeys(categories), [categories]);
  const dmarcPolicy = useMemo(() => extractDmarcPolicy(categories), [categories]);
  
  // Filter subdomains by active/inactive filter
  const filteredSubdomains = useMemo(() => {
    if (!subdomainSummary?.subdomains) return [];
    
    switch (subdomainFilter) {
      case 'active':
        return subdomainSummary.subdomains.filter(s => s.is_alive);
      case 'inactive':
        return subdomainSummary.subdomains.filter(s => s.is_alive === false);
      default:
        return subdomainSummary.subdomains;
    }
  }, [subdomainSummary?.subdomains, subdomainFilter]);

  // Paginated subdomains
  const visibleSubdomains = filteredSubdomains.slice(0, subdomainVisibleCount);
  const hasMoreSubdomains = subdomainVisibleCount < filteredSubdomains.length;

  // Reset pagination when filter changes
  useEffect(() => {
    setSubdomainVisibleCount(10);
  }, [subdomainFilter]);

  const activeCount = subdomainSummary?.subdomains.filter(s => s.is_alive).length ?? 0;
  const inactiveCount = subdomainSummary?.subdomains.filter(s => s.is_alive === false).length ?? 0;

  // Fallback to dnsSummary.ns if rawData extraction returned empty
  const nsRecordsFromRawData = nsRecords;
  const nsRecordsFallback = (dnsSummary?.ns || []).map(host => ({ host, resolvedIps: [] as string[] }));
  const finalNsRecords = nsRecordsFromRawData.length > 0 ? nsRecordsFromRawData : nsRecordsFallback;
  
  const dnssecActive = dnsSummary?.dnssecHasDnskey || dnsSummary?.dnssecHasDs;

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-card",
        className
      )}
    >

      {/* Header */}
      <div className="relative px-6 py-4 border-b border-border/20">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <span className="text-foreground">Mapa de Infraestrutura DNS</span>
        </div>
      </div>

      {/* Content */}
      <div className="relative p-6">
      {/* Root Domain Node - globe icon only */}
      <div className="flex justify-center mb-4">
        <div className="p-4 rounded-full border border-primary/30 bg-primary/5">
          <Globe className="w-12 h-12 text-primary/40" />
        </div>
      </div>

        {/* Connector Lines - L-shaped drops */}
        <div className="relative h-12 mx-8 mb-2 hidden md:block">
          {/* Vertical line from domain center */}
          <div className="absolute left-1/2 top-0 w-px h-6 bg-border -translate-x-1/2" />
          
          {/* Horizontal connector bar */}
          <div className="absolute left-[16.67%] right-[16.67%] top-6 h-px bg-border" />
          
          {/* Vertical drops to each column */}
          <div className="absolute left-[16.67%] top-6 w-px h-6 bg-border" />
          <div className="absolute left-1/2 top-6 w-px h-6 bg-border -translate-x-1/2" />
          <div className="absolute left-[83.33%] top-6 w-px h-6 bg-border" />
        </div>

        {/* DNS Groups Grid - 3 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Column 1: NS + MX */}
          <div className="space-y-6">
            {/* NS Records */}
            <DNSGroup
              title="NS"
              count={finalNsRecords.length}
              icon={<Server className="w-4 h-4 text-sky-400" />}
              color="border-sky-500/30 bg-sky-500/5"
              defaultExpanded={true}
            >
              {finalNsRecords.length > 0 ? (
                finalNsRecords.map((ns, idx) => (
                  <DNSNode 
                    key={idx} 
                    label={ns.host}
                    sublabel={ns.resolvedIps.length > 0 ? ns.resolvedIps.join(', ') : undefined}
                    showCopy 
                  />
                ))
              ) : (
                <div className="text-[13px] text-muted-foreground text-center py-2">
                  Nenhum NS encontrado
                </div>
              )}
            </DNSGroup>

            {/* MX Records */}
            <DNSGroup
              title="MX"
              count={mxRecords.length}
              icon={<Mail className="w-4 h-4 text-purple-400" />}
              color="border-purple-500/30 bg-purple-500/5"
              defaultExpanded={true}
            >
              {mxRecords.length > 0 ? (
                mxRecords.map((mx, idx) => (
                  <DNSNode 
                    key={idx} 
                    label={mx.exchange}
                    sublabel={`Prioridade: ${mx.priority}${mx.ips.length ? ` • ${mx.ips.slice(0, 2).join(', ')}` : ''}`}
                    showCopy 
                  />
                ))
              ) : (
                <div className="text-[13px] text-muted-foreground text-center py-2">
                  Nenhum MX encontrado
                </div>
              )}
            </DNSGroup>
          </div>

          {/* Column 2: SOA + TXT */}
          <div className="space-y-6">
            {/* SOA / DNSSEC */}
            <DNSGroup
              title="SOA"
              count={1}
              icon={<Shield className="w-4 h-4 text-amber-400" />}
              color="border-amber-500/30 bg-amber-500/5"
              defaultExpanded={true}
            >
              <div className="space-y-2.5 px-1 py-1">
                <div className="text-sm">
                  <span className="text-muted-foreground">Primary:</span>
                  <span className="ml-2 font-mono text-foreground text-[13px] truncate block">
                    {dnsSummary?.soaMname || 'N/A'}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Contact:</span>
                  <span className="ml-2 font-mono text-foreground text-[13px] truncate block">
                    {dnsSummary?.soaContact || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm pt-2 border-t border-border/30">
                  <span 
                    className={cn(
                      "w-2 h-2 rounded-full",
                      dnssecActive 
                        ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" 
                        : "bg-muted-foreground/30"
                    )}
                  />
                  <span className="text-muted-foreground">DNSSEC:</span>
                  <span className={cn(
                    "font-medium text-[13px]",
                    dnssecActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {dnssecActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
            </DNSGroup>

            {/* TXT (Email Auth) - Detailed */}
            <DNSGroup
              title="TXT"
              count={3}
              icon={<FileText className="w-4 h-4 text-pink-400" />}
              color="border-pink-500/30 bg-pink-500/5"
              defaultExpanded={true}
            >
              <div className="space-y-3.5 px-1 py-1">
                {/* SPF */}
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span 
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        emailAuth.spf 
                          ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" 
                          : "bg-rose-400 shadow-[0_0_6px_hsl(0_72%_60%/0.5)]"
                      )}
                    />
                    <span className="font-medium text-foreground">SPF</span>
                  </div>
                  {spfRecord ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[13px] text-muted-foreground font-mono block pl-4 truncate cursor-default">
                            {spfRecord}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md">
                          <p className="font-mono text-xs break-all">{spfRecord}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/60 italic block pl-4">
                      Registro não encontrado
                    </span>
                  )}
                </div>
                
                {/* DKIM */}
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span 
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        emailAuth.dkim 
                          ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" 
                          : "bg-rose-400 shadow-[0_0_6px_hsl(0_72%_60%/0.5)]"
                      )}
                    />
                    <span className="font-medium text-foreground">DKIM</span>
                  </div>
                  {dkimKeys.length > 0 ? (
                    dkimKeys.map((key, i) => (
                      <span key={i} className="text-[13px] text-muted-foreground font-mono block pl-4">
                        {key.selector}{key.keySize ? ` - ${key.keySize} bits` : ''}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-muted-foreground/60 italic block pl-4">
                      Nenhum seletor encontrado
                    </span>
                  )}
                </div>
                
                {/* DMARC */}
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span 
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        emailAuth.dmarc 
                          ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" 
                          : "bg-rose-400 shadow-[0_0_6px_hsl(0_72%_60%/0.5)]"
                      )}
                    />
                    <span className="font-medium text-foreground">DMARC</span>
                  </div>
                  {dmarcPolicy.p || dmarcPolicy.sp ? (
                    <>
                      {dmarcPolicy.p && (
                        <span className="text-[13px] text-muted-foreground font-mono block pl-4">
                          Política: {dmarcPolicy.p}
                        </span>
                      )}
                      {dmarcPolicy.sp && (
                        <span className="text-[13px] text-muted-foreground font-mono block pl-4">
                          Política Subdomínios: {dmarcPolicy.sp}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/60 italic block pl-4">
                      Registro não encontrado
                    </span>
                  )}
                </div>
              </div>
            </DNSGroup>
          </div>

          {/* Column 3: Subdomains */}
          <DNSGroup
            title="Subdomínios"
            count={subdomainSummary?.total_found ?? 0}
            icon={<Globe className="w-4 h-4 text-indigo-400" />}
            color="border-indigo-500/30 bg-indigo-500/5"
            defaultExpanded={true}
          >
            {/* Filter Buttons */}
            {subdomainSummary && subdomainSummary.total_found > 0 && (
              <div className="flex gap-1.5 mb-2 px-1">
                <button
                  onClick={() => setSubdomainFilter(f => f === 'active' ? 'all' : 'active')}
                  className={cn(
                    "text-[13px] px-2.5 py-1 rounded-md border transition-all",
                    subdomainFilter === 'active' 
                      ? "bg-primary/20 text-primary border-primary/40" 
                      : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted"
                  )}
                >
                  {activeCount} ativos
                </button>
                <button
                  onClick={() => setSubdomainFilter(f => f === 'inactive' ? 'all' : 'inactive')}
                  className={cn(
                    "text-[13px] px-2.5 py-1 rounded-md border transition-all",
                    subdomainFilter === 'inactive' 
                      ? "bg-muted text-muted-foreground border-muted-foreground/40" 
                      : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted"
                  )}
                >
                  {inactiveCount} inativos
                </button>
              </div>
            )}
            
            {filteredSubdomains.length > 0 ? (
              <>
                {visibleSubdomains.map((sub, idx) => (
                  <DNSNode 
                    key={idx} 
                    label={sub.subdomain}
                    sublabel={sub.addresses.length > 0 
                      ? sub.addresses.slice(0, 2).map(a => a.ip).join(', ')
                      : undefined
                    }
                    isActive={sub.is_alive}
                    showCopy 
                    showExternalLink={sub.is_alive}
                  />
                ))}
                
                {/* Botão Exibir Mais */}
                {hasMoreSubdomains && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSubdomainVisibleCount(prev => prev + 10)}
                  >
                    Exibir mais ({subdomainVisibleCount} de {filteredSubdomains.length})
                  </Button>
                )}
              </>
            ) : (
              <div className="text-[13px] text-muted-foreground text-center py-2">
                Nenhum subdomínio encontrado
              </div>
            )}
          </DNSGroup>
        </div>

        {/* Sources Footer */}
        {subdomainSummary && subdomainSummary.sources.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border/30">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Fontes de enumeração:</span>{' '}
              {subdomainSummary.sources.slice(0, 6).join(', ')}
              {subdomainSummary.sources.length > 6 && ` (+${subdomainSummary.sources.length - 6})`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
