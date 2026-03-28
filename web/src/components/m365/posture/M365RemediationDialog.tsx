import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Copy, 
  Check, 
  ExternalLink, 
  Terminal,
  MousePointer,
  BookOpen,
  ChevronRight
} from 'lucide-react';
import { M365Insight, PRODUCT_LABELS } from '@/types/m365Insights';
import { useToast } from '@/hooks/use-toast';

interface M365RemediationDialogProps {
  insight: M365Insight;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function M365RemediationDialog({ 
  insight, 
  open, 
  onOpenChange 
}: M365RemediationDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const remediacao = insight.remediacao;

  if (!remediacao) return null;

  const handleCopyCommand = async () => {
    if (!remediacao.comandoPowerShell) return;
    
    try {
      await navigator.clipboard.writeText(remediacao.comandoPowerShell);
      setCopied(true);
      toast({
        title: 'Copiado!',
        description: 'Comando PowerShell copiado para a área de transferência',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível copiar o comando',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="font-mono text-xs">
              {insight.code}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {PRODUCT_LABELS[remediacao.productAfetado]}
            </Badge>
          </div>
          <DialogTitle className="text-xl">{insight.titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Portal Path */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MousePointer className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">Via Portal</h3>
            </div>
            
            {remediacao.portalUrl && (
              <a 
                href={remediacao.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline mb-3"
              >
                <ExternalLink className="w-4 h-4" />
                {remediacao.portalUrl}
              </a>
            )}

            {remediacao.caminhoPortal && remediacao.caminhoPortal.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap text-sm bg-muted/30 rounded-lg p-3">
                {remediacao.caminhoPortal.map((step, index) => (
                  <span key={index} className="flex items-center gap-1">
                    <span className="text-foreground font-medium">{step}</span>
                    {index < remediacao.caminhoPortal!.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          <Separator className="bg-border/50" />

          {/* Steps */}
          {remediacao.passosDetalhados && remediacao.passosDetalhados.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground mb-3">Passos Detalhados</h3>
              <ol className="space-y-2">
                {remediacao.passosDetalhados.map((step, index) => (
                  <li key={index} className="flex gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center text-xs">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* PowerShell Command */}
          {remediacao.comandoPowerShell && (
            <>
              <Separator className="bg-border/50" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <h3 className="font-semibold text-foreground">Via PowerShell</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyCommand}
                    className="text-xs"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-1 text-primary" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
                <pre className="bg-background rounded-lg p-4 overflow-x-auto border border-border">
                  <code className="text-sm font-mono text-info">
                    {remediacao.comandoPowerShell}
                  </code>
                </pre>
              </div>
            </>
          )}

          {/* Documentation Link */}
          {remediacao.referenciaDocumentacao && (
            <>
              <Separator className="bg-border/50" />
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                <a 
                  href={remediacao.referenciaDocumentacao}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Documentação oficial da Microsoft
                </a>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
