import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DeleteEnvironmentDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domainName: string;
  onConfirm: () => Promise<void>;
  loading?: boolean;
}

export function DeleteEnvironmentDomainDialog({
  open,
  onOpenChange,
  domainName,
  onConfirm,
  loading,
}: DeleteEnvironmentDomainDialogProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  useEffect(() => {
    if (open) {
      setConfirmInput('');
      setVerificationCode(Math.random().toString(36).substring(2, 8).toUpperCase());
    }
  }, [open]);

  const isConfirmed = confirmInput === verificationCode;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir domínio externo?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                O domínio <strong className="text-foreground">{domainName}</strong> será removido permanentemente,
                junto com todos os dados relacionados:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Histórico de análises</li>
                <li>Agendamentos</li>
                <li>Tarefas de agente</li>
              </ul>
              <p>
                Para confirmar, digite o código abaixo:
              </p>
              <p className="text-center">
                <span className="font-mono font-bold text-lg bg-muted px-3 py-1 rounded border">
                  {verificationCode}
                </span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-code">Código de confirmação</Label>
          <Input
            id="confirm-code"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
            placeholder="Digite o código acima"
            disabled={loading}
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!isConfirmed || loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              await onConfirm();
            }}
          >
            {loading ? 'Excluindo...' : 'Excluir'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
