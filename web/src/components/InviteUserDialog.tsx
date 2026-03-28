import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, UserPlus, Building, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

type AppRole = 'super_admin' | 'super_suporte' | 'workspace_admin' | 'user';
type ModulePermissionLevel = 'none' | 'view' | 'edit';

interface Client {
  id: string;
  name: string;
}

interface Module {
  id: string;
  code: string;
  name: string;
}

interface ModuleWithPermission {
  moduleId: string;
  permission: ModulePermissionLevel;
}

interface InviteUserDialogProps {
  clients: Client[];
  myClientIds?: string[];
  onUserCreated: () => void;
}

import { strongPasswordSchema } from '@/lib/passwordValidation';

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  fullName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  password: strongPasswordSchema,
});

export function InviteUserDialog({ clients, myClientIds = [], onUserCreated }: InviteUserDialogProps) {
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableModules, setAvailableModules] = useState<Module[]>([]);

  // Form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>('user');
  const [modulePermissions, setModulePermissions] = useState<Record<string, ModulePermissionLevel>>({});
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

  // Fetch available modules
  useEffect(() => {
    const fetchModules = async () => {
      const { data } = await supabase
        .from('modules')
        .select('id, code, name')
        .eq('is_active', true)
        .order('name');
      
      const modules = (data || []) as Module[];
      setAvailableModules(modules);
      
      // Initialize all modules with 'none' permission
      const initialPermissions: Record<string, ModulePermissionLevel> = {};
      modules.forEach(mod => {
        initialPermissions[mod.id] = 'none';
      });
      setModulePermissions(initialPermissions);
    };
    fetchModules();
  }, []);

  const resetForm = () => {
    setEmail('');
    setFullName('');
    setPassword('');
    setRole('user');
    // Reset all permissions to 'none'
    const resetPermissions: Record<string, ModulePermissionLevel> = {};
    availableModules.forEach(mod => {
      resetPermissions[mod.id] = 'none';
    });
    setModulePermissions(resetPermissions);
    setSelectedClientIds([]);
  };

  const handleSubmit = async () => {
    const validation = inviteSchema.safeParse({ email, fullName, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    if (role !== 'super_admin' && selectedClientIds.length === 0) {
      toast.error('Selecione pelo menos um cliente para o usuário');
      return;
    }

    // Get modules with access (view or edit)
    const modulesWithAccess = Object.entries(modulePermissions)
      .filter(([_, perm]) => perm !== 'none')
      .map(([moduleId, permission]) => ({ moduleId, permission }));

    if (role !== 'super_admin' && modulesWithAccess.length === 0) {
      toast.error('Selecione pelo menos um módulo com acesso para o usuário');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email,
          password,
          fullName,
          role,
          clientIds: role === 'super_admin' ? [] : selectedClientIds,
          modulePermissions: role === 'super_admin' ? [] : modulesWithAccess,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Log activity
      await supabase.from("admin_activity_logs").insert({
        admin_id: user?.id,
        action: `Criou o usuário ${fullName} (${email})`,
        action_type: "user_management",
        target_type: "user",
        target_id: data?.userId || null,
        target_name: fullName,
        details: { email, role },
      });

      toast.success('Usuário criado com sucesso!');
      setOpen(false);
      resetForm();
      onUserCreated();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error('Erro ao criar usuário: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const toggleClient = (clientId: string) => {
    if (selectedClientIds.includes(clientId)) {
      setSelectedClientIds(selectedClientIds.filter((id) => id !== clientId));
    } else {
      setSelectedClientIds([...selectedClientIds, clientId]);
    }
  };

  const setModulePermission = (moduleId: string, permission: ModulePermissionLevel) => {
    setModulePermissions(prev => ({
      ...prev,
      [moduleId]: permission,
    }));
  };

  const getAvailableRoles = (): { value: AppRole; label: string }[] => {
    if (isSuperAdmin()) {
      return [
        { value: 'user', label: 'Usuário' },
        { value: 'workspace_admin', label: 'Workspace Admin' },
      ];
    }
    return [{ value: 'user', label: 'Usuário' }];
  };

  const getAssignableClients = (): Client[] => {
    if (isSuperAdmin()) {
      return clients;
    }
    return clients.filter((c) => myClientIds.includes(c.id));
  };

  if (!isSuperAdmin() && !isAdmin()) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="w-4 h-4" />
          Novo Usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Criar Novo Usuário
          </DialogTitle>
          <DialogDescription>
            Preencha os dados para criar um novo usuário na plataforma
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 px-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome do usuário"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Senha Inicial</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mín. 12 chars, maiúsc., minúsc., número, especial"
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableRoles().map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSuperAdmin() && (
                <p className="text-xs text-muted-foreground">
                  Como Workspace Admin, você só pode criar usuários com role Usuário
                </p>
              )}
            </div>

            {/* Module Permissions */}
            {role !== 'super_admin' && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Módulos com Acesso
                </Label>
                <div className="space-y-3 border rounded-lg p-3">
                  {availableModules.map((mod) => (
                    <div key={mod.id} className="flex items-center justify-between">
                      <span className="text-sm">{mod.name}</span>
                      <Select
                        value={modulePermissions[mod.id] || 'none'}
                        onValueChange={(v) => setModulePermission(mod.id, v as ModulePermissionLevel)}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem Acesso</SelectItem>
                          <SelectItem value="view">Visualizar</SelectItem>
                          <SelectItem value="edit">Editar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {availableModules.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum módulo disponível</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Defina o nível de acesso do usuário para cada módulo
                </p>
              </div>
            )}

            {/* Client Access */}
            {role !== 'super_admin' && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  Acesso a Clientes
                </Label>
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-3">
                  {getAssignableClients().map((client) => (
                    <div key={client.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-${client.id}`}
                        checked={selectedClientIds.includes(client.id)}
                        onCheckedChange={() => toggleClient(client.id)}
                      />
                      <label htmlFor={`new-${client.id}`} className="text-sm cursor-pointer flex items-center gap-1">
                        <Building className="w-3 h-3 text-muted-foreground" />
                        {client.name}
                      </label>
                    </div>
                  ))}
                  {getAssignableClients().length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {isSuperAdmin() ? 'Nenhum cliente cadastrado' : 'Você não possui clientes atribuídos'}
                    </p>
                  )}
                </div>
                {!isSuperAdmin() && (
                  <p className="text-xs text-muted-foreground">
                    Você só pode atribuir clientes aos quais você tem acesso
                  </p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
