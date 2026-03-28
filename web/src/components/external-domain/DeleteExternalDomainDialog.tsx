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

import type { ExternalDomainRow } from '@/components/external-domain/ExternalDomainTable';

interface DeleteExternalDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: ExternalDomainRow | null;
  onConfirm: (domain: ExternalDomainRow) => Promise<void>;
  loading?: boolean;
}

export function DeleteExternalDomainDialog({
  open,
  onOpenChange,
  domain,
  onConfirm,
  loading,
}: DeleteExternalDomainDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir domínio?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. O domínio <strong>{domain?.domain}</strong> será removido e as tarefas
            pendentes/rodando deste domínio também serão excluídas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!domain || loading}
            onClick={async (e) => {
              e.preventDefault();
              if (!domain) return;
              await onConfirm(domain);
            }}
          >
            {loading ? 'Excluindo...' : 'Excluir'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
