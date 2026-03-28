import React, { useState, useMemo } from 'react';
import { Globe, ChevronDown, ChevronUp, Search, Copy, Check, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { SubdomainSummary } from '@/types/compliance';

interface SubdomainSectionProps {
  summary: SubdomainSummary;
  className?: string;
}

const ITEMS_PER_PAGE = 20;

export function SubdomainSection({ summary, className }: SubdomainSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Filter subdomains by search term
  const filteredSubdomains = useMemo(() => {
    if (!searchTerm.trim()) return summary.subdomains;
    const term = searchTerm.toLowerCase();
    return summary.subdomains.filter(
      (sub) =>
        sub.subdomain.toLowerCase().includes(term) ||
        sub.addresses.some((addr) => addr.ip.includes(term)) ||
        sub.sources.some((src) => src.toLowerCase().includes(term))
    );
  }, [summary.subdomains, searchTerm]);

  const visibleSubdomains = filteredSubdomains.slice(0, visibleCount);
  const hasMore = visibleCount < filteredSubdomains.length;

  const handleCopy = async (subdomain: string, index: number) => {
    try {
      await navigator.clipboard.writeText(subdomain);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const loadMore = () => {
    setVisibleCount((prev) => Math.min(prev + ITEMS_PER_PAGE, filteredSubdomains.length));
  };

  if (summary.total_found === 0) {
    return null;
  }

  return (
    <Card className={cn("glass-card border-border/50", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                  <Globe className="w-5 h-5 text-sky-400" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-foreground">Subdomínios Descobertos</span>
                  <Badge variant="secondary" className="bg-sky-500/10 text-sky-400 border-sky-500/20">
                    {summary.total_found}
                  </Badge>
                  {summary.subdomains.some(s => s.is_alive !== undefined) && (
                    <>
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                        {summary.subdomains.filter(s => s.is_alive).length} ativos
                      </Badge>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted-foreground/20">
                        {summary.subdomains.filter(s => s.is_alive === false).length} inativos
                      </Badge>
                    </>
                  )}
                </div>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Modo: {summary.mode}
                </Badge>
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </div>
            {summary.sources.length > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                Fontes: {summary.sources.slice(0, 5).join(', ')}
                {summary.sources.length > 5 && ` (+${summary.sources.length - 5})`}
              </p>
            )}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar subdomínio, IP ou fonte..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setVisibleCount(ITEMS_PER_PAGE);
                }}
                className="pl-9 bg-background/50"
              />
            </div>

            {/* Results count */}
            {searchTerm && (
              <p className="text-sm text-muted-foreground mb-3">
                {filteredSubdomains.length} resultado(s) encontrado(s)
              </p>
            )}

            {/* Table */}
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-[45%]">Subdomínio</TableHead>
                    <TableHead className="w-[30%]">Endereços IP</TableHead>
                    <TableHead className="w-[25%]">Fontes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSubdomains.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? 'Nenhum subdomínio encontrado' : 'Nenhum subdomínio disponível'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleSubdomains.map((sub, idx) => (
                      <TableRow key={idx} className="group hover:bg-muted/20">
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-2">
                            {sub.is_alive !== undefined && (
                              <span 
                                className={cn(
                                  "w-2 h-2 rounded-full flex-shrink-0",
                                  sub.is_alive 
                                    ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" 
                                    : "bg-muted-foreground/30"
                                )}
                                title={sub.is_alive ? "Ativo" : "Inativo"}
                              />
                            )}
                            <span className={cn(
                              "break-all",
                              sub.is_alive === false ? "text-muted-foreground" : "text-foreground"
                            )}>
                              {sub.subdomain}
                            </span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCopy(sub.subdomain, idx)}
                              >
                                {copiedIndex === idx ? (
                                  <Check className="w-3 h-3 text-primary" />
                                ) : (
                                  <Copy className="w-3 h-3 text-muted-foreground" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                asChild
                              >
                                <a
                                  href={`https://${sub.subdomain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sub.addresses.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sub.addresses.slice(0, 3).map((addr, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="font-mono text-xs bg-muted/30"
                                >
                                  {addr.ip}
                                </Badge>
                              ))}
                              {sub.addresses.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{sub.addresses.length - 3}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">
                              {sub.is_alive === false ? 'Não resolvido' : '—'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {sub.sources.length > 0 ? (
                            <span className="truncate max-w-[200px] block" title={sub.sources.join(', ')}>
                              {sub.sources.slice(0, 2).join(', ')}
                              {sub.sources.length > 2 && ` +${sub.sources.length - 2}`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={loadMore} className="w-full max-w-xs">
                  Carregar mais ({visibleCount} de {filteredSubdomains.length})
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
