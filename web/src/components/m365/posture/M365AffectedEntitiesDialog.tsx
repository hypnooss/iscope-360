import { useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Users, Info, Download, FileText, Loader2 } from 'lucide-react';
import { M365Insight, SEVERITY_LABELS } from '@/types/m365Insights';
import { cn } from '@/lib/utils';
import { usePDFDownload, sanitizePDFFilename, getPDFDateString } from '@/hooks/usePDFDownload';
import { M365AffectedEntitiesPDF } from '@/components/pdf/M365AffectedEntitiesPDF';
import { useAffectedEntities } from '@/hooks/useAffectedEntities';

interface M365AffectedEntitiesDialogProps {
  insight: M365Insight;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historyId?: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  info: 'bg-muted/50 text-muted-foreground border-muted',
};

function exportCSV(insight: M365Insight, entities: any[], detailKeys: string[]) {
  const headers = ['Nome', 'Identificador', ...detailKeys];
  const rows = entities.map(e => [
    e.displayName || e.name || '',
    e.userPrincipalName || e.email || '',
    ...detailKeys.map(k => String(e.details?.[k] ?? ''))
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizePDFFilename(insight.code)}-entidades-${getPDFDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function M365AffectedEntitiesDialog({ insight, open, onOpenChange, historyId }: M365AffectedEntitiesDialogProps) {
  const { entities: loadedEntities, loading: entitiesLoading, loaded, loadEntities, reset } = useAffectedEntities();
  const { downloadPDF, isGenerating } = usePDFDownload();

  // Load entities on demand when dialog opens
  useEffect(() => {
    if (open && !loaded && historyId) {
      loadEntities(historyId, insight.code || insight.id);
    }
    if (!open) {
      reset();
    }
  }, [open, loaded, historyId, insight.code, insight.id, loadEntities, reset]);

  // Use loaded entities if available, otherwise fall back to what's in the insight
  const displayEntities = loaded ? loadedEntities : insight.affectedEntities;
  const remaining = insight.affectedCount - displayEntities.length;

  const detailKeys = useMemo(() => {
    const keys = new Set<string>();
    displayEntities.forEach(e => {
      if (e.details) Object.keys(e.details).forEach(k => keys.add(k));
    });
    return Array.from(keys);
  }, [displayEntities]);

  const handleExportCSV = useCallback(() => {
    exportCSV(insight, displayEntities, detailKeys);
  }, [insight, displayEntities, detailKeys]);

  const handleExportPDF = useCallback(async () => {
    // For PDF, we need the full insight with entities
    const insightWithEntities = { ...insight, affectedEntities: displayEntities };
    const doc = <M365AffectedEntitiesPDF insight={insightWithEntities} detailKeys={detailKeys} />;
    const filename = `${sanitizePDFFilename(insight.code)}-entidades-${getPDFDateString()}`;
    await downloadPDF(doc, filename);
  }, [insight, displayEntities, detailKeys, downloadPDF]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs font-mono">{insight.code}</Badge>
                <Badge className={cn('text-xs border', SEVERITY_BADGE[insight.severity])}>
                  {SEVERITY_LABELS[insight.severity]}
                </Badge>
              </div>
              <DialogTitle className="text-base">{insight.titulo}</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={entitiesLoading}>
                <Download className="w-4 h-4 mr-1.5" />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isGenerating || entitiesLoading}>
                <FileText className="w-4 h-4 mr-1.5" />
                {isGenerating ? 'Gerando...' : 'PDF'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Users className="w-4 h-4" />
          <span>{insight.affectedCount} {insight.affectedCount === 1 ? 'item afetado' : 'itens afetados'}</span>
        </div>

        {entitiesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando entidades...</span>
          </div>
        ) : (
          <ScrollArea className="max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Identificador</TableHead>
                  {detailKeys.map(key => (
                    <TableHead key={key} className="capitalize">{key}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayEntities.map((entity, idx) => (
                  <TableRow key={entity.id || idx}>
                    <TableCell className="font-medium">{entity.displayName || entity.name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {entity.userPrincipalName || entity.email || '—'}
                    </TableCell>
                    {detailKeys.map(key => (
                      <TableCell key={key} className="text-xs">
                        {entity.details?.[key] != null ? String(entity.details[key]) : '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        {remaining > 0 && !entitiesLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
            <Info className="w-3.5 h-3.5" />
            <span>e mais {remaining} {remaining === 1 ? 'entidade' : 'entidades'} não listadas</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
