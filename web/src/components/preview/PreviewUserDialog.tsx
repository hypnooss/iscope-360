import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, AlertTriangle, Loader2, Building } from 'lucide-react';
import { usePreview } from '@/contexts/PreviewContext';
import { supabase } from '@/integrations/supabase/client';

interface UserToPreview {
  id: string;
  email: string;
  full_name: string | null;
}

interface Workspace {
  id: string;
  name: string;
}

interface PreviewUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserToPreview | null;
  onSuccess?: () => void;
}

export function PreviewUserDialog({ 
  open, 
  onOpenChange, 
  user,
  onSuccess,
}: PreviewUserDialogProps) {
  const { startPreview, loading } = usePreview();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  // Fetch user's workspaces when dialog opens
  useEffect(() => {
    if (open && user) {
      fetchUserWorkspaces();
    }
  }, [open, user]);

  const fetchUserWorkspaces = async () => {
    if (!user) return;
    
    setLoadingWorkspaces(true);
    try {
      const { data } = await supabase
        .from('user_clients')
        .select('client_id, clients(id, name)')
        .eq('user_id', user.id);

      const ws: Workspace[] = (data || [])
        .filter((d: any) => d.clients)
        .map((d: any) => ({
          id: d.clients.id,
          name: d.clients.name,
        }));

      setWorkspaces(ws);
      
      // Auto-select if only one workspace
      if (ws.length === 1) {
        setSelectedWorkspace(ws[0].id);
      } else {
        setSelectedWorkspace('');
      }
    } catch (error) {
      console.error('Error fetching workspaces:', error);
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const handleStartPreview = async () => {
    if (!user) return;

    const success = await startPreview(
      user.id,
      selectedWorkspace || undefined,
      reason || undefined
    );

    if (success) {
      onOpenChange(false);
      setReason('');
      setSelectedWorkspace('');
      onSuccess?.();
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setReason('');
    setSelectedWorkspace('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Visualizar Como Usuário
          </DialogTitle>
          <DialogDescription>
            Veja o sistema exatamente como este usuário vê.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* User info */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Usuário selecionado</Label>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="font-medium">{user?.full_name || 'Sem nome'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {/* Workspace selection */}
          {loadingWorkspaces ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando workspaces...
            </div>
          ) : workspaces.length > 0 ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building className="w-4 h-4" />
                Workspace
              </Label>
              <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O contexto será filtrado para este workspace
              </p>
            </div>
          ) : workspaces.length === 0 && !loadingWorkspaces ? (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-700">
                Este usuário não está associado a nenhum workspace.
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Reason (optional) */}
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (opcional)</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Suporte técnico - ticket #12345"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              O motivo será registrado para fins de auditoria
            </p>
          </div>

          {/* Warning */}
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-700">
              <strong>Modo somente leitura:</strong> Você verá o sistema como este usuário, 
              mas todas as ações estarão bloqueadas.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleStartPreview} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Carregando...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Iniciar Visualização
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
