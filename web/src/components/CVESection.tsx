import { useState, useEffect } from 'react';
import { Shield, ExternalLink, AlertTriangle, Loader2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { CVEInfo } from '@/types/compliance';

interface CVESectionProps {
  firmwareVersion: string;
  onCVEsLoaded?: (cves: CVEInfo[]) => void;
}

export function CVESection({ firmwareVersion, onCVEsLoaded }: CVESectionProps) {
  const [cves, setCves] = useState<CVEInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchCVEs = async () => {
    if (!firmwareVersion) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: dbError } = await supabase
        .from('cve_cache')
        .select('*')
        .eq('module_code', 'firewall')
        .order('score', { ascending: false, nullsFirst: false });

      if (dbError) {
        throw new Error(dbError.message);
      }

      const filtered = (data || []).filter((row) => {
        const products = Array.isArray(row.products) ? row.products : [];
        return products.some((p: unknown) =>
          typeof p === 'string' && p.toLowerCase().includes(firmwareVersion.toLowerCase())
        );
      });

      const mapped: CVEInfo[] = filtered.map((row) => ({
        id: row.cve_id,
        severity: (row.severity || 'MEDIUM').toUpperCase(),
        score: Number(row.score) || 0,
        description: row.description || '',
        publishedDate: row.published_date || '',
        lastModifiedDate: row.updated_at || row.published_date || '',
        references: row.advisory_url ? [row.advisory_url] : [],
        affectedVersions: row.title || undefined,
      }));

      setCves(mapped);
      onCVEsLoaded?.(mapped);
    } catch (err) {
      console.error('Error fetching CVEs from cache:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar CVEs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && cves.length === 0 && !loading && !error) {
      fetchCVEs();
    }
  }, [expanded, firmwareVersion]);

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'LOW':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const displayedCVEs = showAll ? cves : cves.slice(0, 5);
  const criticalCount = cves.filter(c => c.severity === 'CRITICAL').length;
  const highCount = cves.filter(c => c.severity === 'HIGH').length;

  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Shield className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-foreground">
              CVEs Conhecidos - FortiOS {firmwareVersion}
            </h3>
            <p className="text-sm text-muted-foreground">
              Vulnerabilidades públicas registradas no NIST NVD
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cves.length > 0 && (
            <div className="flex gap-2">
              {criticalCount > 0 && (
                <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                  {criticalCount} Críticos
                </Badge>
              )}
              {highCount > 0 && (
                <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                  {highCount} Altos
                </Badge>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 p-4">
          {/* Disclaimer */}
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-300">
              Esta é uma lista informativa de CVEs conhecidos baseada em busca no NIST NVD. 
              Verifique os <a href="https://www.fortiguard.com/psirt" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">advisories oficiais da Fortinet</a> para informações precisas sobre versões afetadas e correções.
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Buscando CVEs no NIST NVD...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <span className="text-destructive">{error}</span>
              <Button variant="outline" size="sm" onClick={fetchCVEs} className="ml-auto">
                Tentar novamente
              </Button>
            </div>
          )}

          {!loading && !error && cves.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum CVE encontrado para esta versão</p>
            </div>
          )}

          {!loading && !error && cves.length > 0 && (
            <>
              <div className="space-y-3">
                {displayedCVEs.map((cve) => (
                  <div
                    key={cve.id}
                    className="p-4 rounded-lg bg-card/50 border border-border/50 hover:border-border transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <a
                            href={`https://nvd.nist.gov/vuln/detail/${cve.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-semibold text-primary hover:underline flex items-center gap-1"
                          >
                            {cve.id}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <Badge variant="outline" className={getSeverityColor(cve.severity)}>
                            {cve.severity} ({cve.score})
                          </Badge>
                        </div>
                        {cve.affectedVersions && (
                          <div className="text-xs text-amber-400 mb-1">
                            Versões FortiOS afetadas: {cve.affectedVersions}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {cve.description}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Publicado: {formatDate(cve.publishedDate)}</span>
                          {cve.references.length > 0 && (
                            <a
                              href={cve.references[0]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              Ver referência
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {cves.length > 5 && (
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? 'Mostrar menos' : `Ver todos os ${cves.length} CVEs`}
                  </Button>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border/50 text-center">
                <p className="text-xs text-muted-foreground">
                  Dados obtidos do <a href="https://nvd.nist.gov/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">NIST National Vulnerability Database</a>
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
