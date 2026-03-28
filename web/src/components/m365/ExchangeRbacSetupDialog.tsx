import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, AlertTriangle, CheckCircle, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExchangeRbacSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantRecordId: string;
  tenantDomain: string;
  onSuccess?: () => void;
}

type Phase = 'info' | 'verifying' | 'polling' | 'success' | 'error';

export function ExchangeRbacSetupDialog({
  open,
  onOpenChange,
  tenantRecordId,
  tenantDomain,
  onSuccess,
}: ExchangeRbacSetupDialogProps) {
  const [phase, setPhase] = useState<Phase>('info');
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pollingCount, setPollingCount] = useState(0);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('info');
      setError(null);
      setTaskId(null);
      setPollingCount(0);
    }
  }, [open]);

  // Poll for task completion
  useEffect(() => {
    if (phase !== 'polling' || !taskId) return;

    const interval = setInterval(async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('agent_tasks')
          .select('status, result, error_message')
          .eq('id', taskId)
          .single();

        if (fetchError) {
          console.error('Error polling task:', fetchError);
          return;
        }

        if (data.status === 'completed') {
          clearInterval(interval);
          
          // Update tenant flags
          await supabase
            .from('m365_tenants')
            .update({
              exchange_sp_registered: true,
              exchange_rbac_assigned: true,
            })
            .eq('id', tenantRecordId);

          setPhase('success');
          toast.success('Conexão Exchange verificada!', {
            description: 'A autenticação via certificado está funcionando.',
          });

          setTimeout(() => {
            onOpenChange(false);
            onSuccess?.();
          }, 2000);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setError(data.error_message || 'Falha na verificação. Verifique se a permissão Exchange.ManageAsApp foi concedida.');
          setPhase('error');
        } else if (data.status === 'timeout' || data.status === 'cancelled') {
          clearInterval(interval);
          setError('A tarefa expirou ou foi cancelada. Tente novamente.');
          setPhase('error');
        }

        setPollingCount(prev => prev + 1);
        
        // Stop polling after 60 attempts (2 minutes)
        if (pollingCount >= 60) {
          clearInterval(interval);
          setError('Tempo limite excedido. O agent pode estar offline.');
          setPhase('error');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [phase, taskId, tenantRecordId, pollingCount, onOpenChange, onSuccess]);

  const handleVerify = async () => {
    setPhase('verifying');
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('setup-exchange-rbac', {
        body: { tenant_record_id: tenantRecordId },
      });

      if (invokeError) {
        throw invokeError;
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro ao iniciar verificação');
      }

      setTaskId(data.task_id);
      setPhase('polling');
      toast.info('Verificação iniciada', {
        description: 'Aguardando resposta do agent...',
      });

    } catch (err: any) {
      console.error('Error verifying Exchange connection:', err);
      setError(err.message || 'Erro ao verificar conexão Exchange');
      setPhase('error');
    }
  };

  const handleRetry = () => {
    setPhase('info');
    setError(null);
    setTaskId(null);
    setPollingCount(0);
  };

  const handleClose = () => {
    if (phase !== 'verifying' && phase !== 'polling') {
      onOpenChange(false);
    }
  };

  const handleCopyInstructions = () => {
    const instructions = `# Adicionar permissão Exchange.ManageAsApp no Azure Portal

1. Acesse Azure Portal → App Registrations → iScope Security
2. API Permissions → Add a permission
3. Selecione "APIs my organization uses"
4. Procure por "Office 365 Exchange Online"
5. Selecione "Application permissions"
6. Marque "Exchange.ManageAsApp"
7. Clique em "Add permissions"
8. Clique em "Grant admin consent for [Tenant]"

Após isso, o admin do tenant cliente (${tenantDomain}) precisa re-consentir:
- Reconecte o tenant via Device Code Flow`;

    navigator.clipboard.writeText(instructions);
    toast.success('Instruções copiadas!');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            Verificar Conexão Exchange Online
          </DialogTitle>
          <DialogDescription>
            Verifique se a permissão Exchange.ManageAsApp foi concedida corretamente.
          </DialogDescription>
        </DialogHeader>

        {phase === 'success' ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Conexão verificada!</p>
            <p className="text-sm text-muted-foreground mt-2">
              A autenticação CBA está funcionando corretamente.
            </p>
          </div>
        ) : phase === 'verifying' || phase === 'polling' ? (
          <div className="py-8 text-center">
            <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <p className="text-lg font-medium">
              {phase === 'verifying' ? 'Iniciando verificação...' : 'Aguardando resposta do agent...'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              O agent está testando a conexão via certificado.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert className="bg-blue-500/10 border-blue-500/30">
              <AlertTriangle className="w-4 h-4 text-blue-500" />
              <AlertDescription className="text-sm">
                <strong>Pré-requisito:</strong> A permissão <code className="bg-muted px-1 rounded">Exchange.ManageAsApp</code> deve estar configurada no App Registration e consentida pelo admin do tenant.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <p className="text-sm font-medium">O que este teste faz:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Conecta ao Exchange Online usando o certificado do agent (CBA)</li>
                <li>Executa um comando de teste (<code className="bg-muted px-1 rounded">Get-OrganizationConfig</code>)</li>
                <li>Confirma se a autenticação foi bem-sucedida</li>
              </ul>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInstructions}
                className="text-muted-foreground"
              >
                <Copy className="w-3 h-3 mr-1" />
                Copiar instruções
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="text-muted-foreground"
              >
                <a
                  href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Azure Portal
                </a>
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {phase === 'error' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Fechar
              </Button>
              <Button onClick={handleRetry}>
                Tentar novamente
              </Button>
            </>
          ) : phase === 'info' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleVerify}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Verificar Conexão
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
