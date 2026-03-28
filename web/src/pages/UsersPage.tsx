import { useEffect, useState, useMemo } from "react";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePreview } from "@/contexts/PreviewContext";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageBreadcrumb } from "@/components/layout/PageBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Users, Edit, Shield, Loader2, Building, Building2, Layers, Trash2, Eye, Search, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { InviteUserDialog } from "@/components/InviteUserDialog";
import { PreviewUserDialog } from "@/components/preview/PreviewUserDialog";
import { Skeleton } from "@/components/ui/skeleton";

type UserSortKey = 'full_name' | 'role' | 'moduleCount' | 'clientCount' | 'created_at';
type SortDir = 'asc' | 'desc' | null;

function SortableHead({ label, sortKey: colKey, activeSortKey, sortDir, onSort }: {
  label: string; sortKey: UserSortKey; activeSortKey: UserSortKey | null; sortDir: SortDir; onSort: (key: UserSortKey) => void;
}) {
  const isActive = activeSortKey === colKey;
  const Icon = isActive && sortDir === 'asc' ? ArrowUp : isActive && sortDir === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead>
      <button type="button" className="flex items-center gap-1 hover:text-foreground transition-colors -my-1" onClick={() => onSort(colKey)}>
        {label}
        <Icon className={`w-3 h-3 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  );
}

type AppRole = "super_admin" | "super_suporte" | "workspace_admin" | "user";
type ModulePermissionLevel = "none" | "view" | "edit";

interface UserModulePermission {
  module_id: string;
  permission: ModulePermissionLevel;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  role?: AppRole;
  client_ids?: string[];
  module_permissions?: UserModulePermission[];
}

interface Client {
  id: string;
  name: string;
}

interface Module {
  id: string;
  code: string;
  name: string;
}

export default function UsersPage() {
  const { user, loading: authLoading, isSuperAdmin, isAdmin } = useAuth();
  const { canStartPreview, isPreviewMode, previewTarget } = usePreview();
  const { effectiveRole } = useEffectiveAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [myClientIds, setMyClientIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<AppRole>("user");
  const [editModulePermissions, setEditModulePermissions] = useState<Record<string, ModulePermissionLevel>>({});
  const [editClientIds, setEditClientIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUser, setPreviewUser] = useState<UserProfile | null>(null);
  const [search, setSearch] = useState('');
  const isSuperRole = effectiveRole === 'super_admin' || effectiveRole === 'super_suporte';
  const canAccessPage = isSuperAdmin() || isAdmin();

  const { data: allWorkspaces } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuperRole && !isPreviewMode,
    staleTime: 1000 * 60 * 5,
  });

  const { selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspaceSelector(allWorkspaces, isSuperRole);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (!authLoading && !canAccessPage) {
      navigate("/dashboard");
      toast.error("Acesso não autorizado");
    }
  }, [user, authLoading, navigate, canAccessPage]);

  useEffect(() => {
    if (user && canAccessPage) {
      if (isSuperRole && !isPreviewMode && !selectedWorkspaceId) return;
      fetchData();
    }
  }, [user, canAccessPage, isPreviewMode, previewTarget, selectedWorkspaceId, isSuperRole]);

  const fetchData = async () => {
    try {
      // Get workspace filter
      let workspaceIds: string[] | null = null;
      if (isPreviewMode && previewTarget?.workspaces) {
        workspaceIds = previewTarget.workspaces.map(w => w.id);
      } else if (isSuperRole && selectedWorkspaceId) {
        workspaceIds = [selectedWorkspaceId];
      }

      // First, get my client associations if I'm an admin (not super admin)
      let adminClientIds: string[] = [];
      if (!isSuperAdmin()) {
        const { data: myClients } = await supabase.from("user_clients").select("client_id").eq("user_id", user!.id);

        adminClientIds = (myClients || []).map((c) => c.client_id);
        setMyClientIds(adminClientIds);
      }

      // Fetch profiles - RLS will filter based on permissions
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });

      // Fetch roles - RLS will filter
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");

      // Fetch user-client associations - RLS will filter
      let userClientsQuery = supabase.from("user_clients").select("user_id, client_id");
      // Filter by workspace
      if (workspaceIds && workspaceIds.length > 0) {
        userClientsQuery = userClientsQuery.in("client_id", workspaceIds);
      }
      const { data: userClients } = await userClientsQuery;

      // Fetch user-module associations with permissions
      const { data: userModules } = await supabase.from("user_modules").select("user_id, module_id, permission");

      // Fetch clients - filter by workspace
      let clientsQuery = supabase.from("clients").select("id, name").order("name");
      if (workspaceIds && workspaceIds.length > 0) {
        clientsQuery = clientsQuery.in("id", workspaceIds);
      }
      const { data: clientsData } = await clientsQuery;

      // Fetch available modules
      const { data: modulesData } = await supabase.from("modules").select("id, code, name").eq("is_active", true).order("name");

      // Get user IDs that belong to the filtered workspaces
      const userIdsInWorkspace = workspaceIds && workspaceIds.length > 0
        ? new Set((userClients || []).map(uc => uc.user_id))
        : null;

      // Merge data
      const mergedUsers: UserProfile[] = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.id);
        const userClientAssocs = userClients?.filter((uc) => uc.user_id === profile.id) || [];
        const userModuleAssocs = userModules?.filter((um) => um.user_id === profile.id) || [];

        return {
          ...profile,
          role: (userRole?.role as AppRole) || "user",
          client_ids: userClientAssocs.map((uc) => uc.client_id),
          module_permissions: userModuleAssocs.map((um) => ({
            module_id: um.module_id,
            permission: (um.permission as ModulePermissionLevel) || 'view',
          })),
        };
      });

      // Filter out super_admin and super_suporte users - they are managed in Administrators page
      let filteredUsers = mergedUsers.filter(
        (u) => u.role !== "super_admin" && u.role !== "super_suporte"
      );

      // Only show users that belong to the filtered workspaces
      if (userIdsInWorkspace) {
        filteredUsers = filteredUsers.filter(u => userIdsInWorkspace.has(u.id));
      }

      setUsers(filteredUsers);
      setClients(clientsData || []);
      setModules((modulesData || []) as Module[]);
    } catch (error: any) {
      toast.error("Erro ao carregar usuários: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (userProfile: UserProfile) => {
    setEditingUser(userProfile);
    setEditRole(userProfile.role || "user");
    setEditClientIds(userProfile.client_ids || []);
    
    // Initialize module permissions
    const modulePerms: Record<string, ModulePermissionLevel> = {};
    modules.forEach(mod => {
      const userPerm = userProfile.module_permissions?.find(p => p.module_id === mod.id);
      modulePerms[mod.id] = userPerm?.permission || 'none';
    });
    setEditModulePermissions(modulePerms);
  };

  const handleSave = async () => {
    if (!editingUser) return;

    setSaving(true);
    try {
      // Use upsert to handle case where role doesn't exist
      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: editingUser.id, role: editRole },
          { onConflict: "user_id" }
        );

      if (roleError) {
        throw new Error("Erro ao atualizar role: " + roleError.message);
      }

      // Update client associations
      await supabase.from("user_clients").delete().eq("user_id", editingUser.id);
      if (editClientIds.length > 0) {
        await supabase
          .from("user_clients")
          .insert(editClientIds.map((clientId) => ({ user_id: editingUser.id, client_id: clientId })));
      }

      // Update module associations with permissions
      await supabase.from("user_modules").delete().eq("user_id", editingUser.id);
      
      const modulesToInsert = Object.entries(editModulePermissions)
        .filter(([_, perm]) => perm !== 'none')
        .map(([moduleId, permission]) => ({
          user_id: editingUser.id,
          module_id: moduleId,
          permission: permission,
        }));
      
      if (modulesToInsert.length > 0) {
        await supabase.from("user_modules").insert(modulesToInsert);
      }

      // Log activity
      await supabase.from("admin_activity_logs").insert({
        admin_id: user?.id,
        action: `Editou as permissões do usuário ${editingUser.full_name || editingUser.email}`,
        action_type: "user_management",
        target_type: "user",
        target_id: editingUser.id,
        target_name: editingUser.full_name || editingUser.email,
        details: { role: editRole },
      });

      toast.success("Usuário atualizado com sucesso!");
      setEditingUser(null);
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    setIsDeleting(true);
    try {
      // Delete user-related data in order
      await supabase.from("user_module_permissions").delete().eq("user_id", deletingUser.id);
      await supabase.from("user_modules").delete().eq("user_id", deletingUser.id);
      await supabase.from("user_clients").delete().eq("user_id", deletingUser.id);
      await supabase.from("user_roles").delete().eq("user_id", deletingUser.id);
      await supabase.from("profiles").delete().eq("id", deletingUser.id);

      // Log activity
      await supabase.from("admin_activity_logs").insert({
        admin_id: user?.id,
        action: `Excluiu o usuário ${deletingUser.full_name || deletingUser.email}`,
        action_type: "user_management",
        target_type: "user",
        target_id: deletingUser.id,
        target_name: deletingUser.full_name || deletingUser.email,
        details: { email: deletingUser.email },
      });

      toast.success("Usuário excluído com sucesso!");
      setDeletingUser(null);
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao excluir usuário: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case "super_admin":
        return <Badge className="bg-primary/10 text-primary">Super Admin</Badge>;
      case "super_suporte":
        return <Badge className="bg-primary/10 text-primary">Super Suporte</Badge>;
      case "workspace_admin":
        return <Badge className="bg-warning/10 text-warning">Workspace Admin</Badge>;
      default:
        return <Badge variant="outline">Usuário</Badge>;
    }
  };

  const toggleClient = (clientId: string) => {
    if (editClientIds.includes(clientId)) {
      setEditClientIds(editClientIds.filter((id) => id !== clientId));
    } else {
      setEditClientIds([...editClientIds, clientId]);
    }
  };

  const setModulePermission = (moduleId: string, permission: ModulePermissionLevel) => {
    setEditModulePermissions(prev => ({
      ...prev,
      [moduleId]: permission,
    }));
  };

  // Get client names for a user
  const getClientNames = (clientIds: string[] | undefined) => {
    if (!clientIds || clientIds.length === 0) return [];
    return clients.filter((c) => clientIds.includes(c.id)).map((c) => c.name);
  };

  // Get module names for a user (only those with access)
  const getModuleNames = (modulePerms: UserModulePermission[] | undefined) => {
    if (!modulePerms || modulePerms.length === 0) return [];
    return modulePerms
      .filter(mp => mp.permission !== 'none')
      .map(mp => {
        const mod = modules.find(m => m.id === mp.module_id);
        return mod?.name || '';
      })
      .filter(Boolean);
  };

  // Check if current user can edit this user
  const canEditUser = (targetUser: UserProfile): boolean => {
    // Can't edit yourself
    if (targetUser.id === user?.id) return false;

    // Super admin can edit anyone except other super admins
    if (isSuperAdmin()) {
      return targetUser.role !== "super_admin";
    }

    // Admin can edit users but not super admins or other admins
    if (isAdmin()) {
      return targetUser.role === "user";
    }

    return false;
  };

  // Get available roles for dropdown based on current user's role
  const getAvailableRoles = (): { value: AppRole; label: string }[] => {
    return [
      { value: "user", label: "Usuário" },
      { value: "workspace_admin", label: "Workspace Admin" },
    ];
  };

  // Check if current user can delete a specific user
  const canDeleteUser = (targetUser: UserProfile): boolean => {
    // Can't delete yourself
    if (targetUser.id === user?.id) return false;

    // Only Super Admin can delete Workspace Admins
    if (targetUser.role === "workspace_admin") {
      return isSuperAdmin();
    }

    // For regular users, both Super Admin and Workspace Admin can delete
    return canEditUser(targetUser);
  };

  // Get clients that current user can assign to others
  const getAssignableClients = (): Client[] => {
    if (isSuperAdmin()) {
      return clients;
    }
    // Admin can only assign their own clients
    return clients.filter((c) => myClientIds.includes(c.id));
  };

  // Stats
  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === 'workspace_admin').length,
    withModules: users.filter(u => (u.module_permissions?.filter(p => p.permission !== 'none').length || 0) > 0).length,
    noWorkspace: users.filter(u => !u.client_ids?.length).length,
  }), [users]);

  // Persistent sorting
  const SORT_STORAGE_KEY = 'users-sort';
  const [sortKey, setSortKey] = useState<UserSortKey | null>(() => {
    try { const s = localStorage.getItem(SORT_STORAGE_KEY); return s ? JSON.parse(s).key : null; } catch { return null; }
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try { const s = localStorage.getItem(SORT_STORAGE_KEY); return s ? JSON.parse(s).dir : null; } catch { return null; }
  });
  const handleSort = (key: UserSortKey) => {
    let nk: UserSortKey | null, nd: SortDir;
    if (sortKey !== key) { nk = key; nd = 'asc'; }
    else if (sortDir === 'asc') { nk = key; nd = 'desc'; }
    else { nk = null; nd = null; }
    setSortKey(nk); setSortDir(nd);
    if (nk && nd) localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key: nk, dir: nd }));
    else localStorage.removeItem(SORT_STORAGE_KEY);
  };

  // Search filter
  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.full_name?.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      getClientNames(u.client_ids).some(n => n.toLowerCase().includes(q))
    );
  }, [users, search, clients]);

  const sortedUsers = useMemo(() => {
    if (!sortKey || !sortDir) return filteredUsers;
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...filteredUsers].sort((a, b) => {
      if (sortKey === 'moduleCount') {
        const ma = a.module_permissions?.filter(p => p.permission !== 'none').length ?? 0;
        const mb = b.module_permissions?.filter(p => p.permission !== 'none').length ?? 0;
        return (ma - mb) * mul;
      }
      if (sortKey === 'clientCount') {
        const ca = a.client_ids?.length ?? 0;
        const cb = b.client_ids?.length ?? 0;
        return (ca - cb) * mul;
      }
      if (sortKey === 'created_at') {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * mul;
      }
      if (sortKey === 'role') {
        const va = a.role ?? '';
        const vb = b.role ?? '';
        return va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' }) * mul;
      }
      // full_name
      const va = (a.full_name ?? '').toLowerCase();
      const vb = (b.full_name ?? '').toLowerCase();
      return va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' }) * mul;
    });
  }, [filteredUsers, sortKey, sortDir]);

  if (authLoading || !canAccessPage) return null;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Gerenciamento de Usuários' }]} />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Usuários</h1>
            <p className="text-muted-foreground">
              {isSuperAdmin()
                ? "Gerencie todos os usuários e permissões do sistema"
                : "Gerencie usuários dos seus clientes"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isSuperRole && !isPreviewMode && allWorkspaces && allWorkspaces.length > 0 && (
              <Select value={selectedWorkspaceId || ''} onValueChange={setSelectedWorkspaceId}>
                <SelectTrigger className="w-[220px]">
                  <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Selecionar workspace" />
                </SelectTrigger>
                <SelectContent>
                  {allWorkspaces.map(ws => (
                    <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <InviteUserDialog clients={clients} myClientIds={myClientIds} onUserCreated={fetchData} />
          </div>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total de Usuários</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Shield className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.admins}</p>
                  <p className="text-xs text-muted-foreground">Workspace Admins</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Layers className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.withModules}</p>
                  <p className="text-xs text-muted-foreground">Com Módulos</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10">
                  <Building className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.noWorkspace}</p>
                  <p className="text-xs text-muted-foreground">Sem Workspace</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Users Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{search ? 'Nenhum usuário encontrado para a busca' : 'Nenhum usuário encontrado'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                   <SortableHead label="Usuário" sortKey="full_name" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Role" sortKey="role" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Módulos" sortKey="moduleCount" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Clientes" sortKey="clientCount" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead label="Cadastro" sortKey="created_at" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{u.full_name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(u.role || "user")}</TableCell>
                      <TableCell>
                        {u.role === "super_admin" ? (
                          <span className="text-xs text-muted-foreground">Todos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {getModuleNames(u.module_permissions)
                              .slice(0, 2)
                              .map((name, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  <Layers className="w-3 h-3 mr-1" />
                                  {name}
                                </Badge>
                              ))}
                            {(u.module_permissions?.filter(p => p.permission !== 'none').length || 0) > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{(u.module_permissions?.filter(p => p.permission !== 'none').length || 0) - 2}
                              </Badge>
                            )}
                            {(u.module_permissions?.filter(p => p.permission !== 'none').length || 0) === 0 && (
                              <span className="text-xs text-muted-foreground">Nenhum</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.role === "super_admin" ? (
                          <span className="text-xs text-muted-foreground">Todos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {getClientNames(u.client_ids)
                              .slice(0, 2)
                              .map((name, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  <Building className="w-3 h-3 mr-1" />
                                  {name}
                                </Badge>
                              ))}
                            {(u.client_ids?.length || 0) > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{(u.client_ids?.length || 0) - 2}
                              </Badge>
                            )}
                            {(u.client_ids?.length || 0) === 0 && (
                              <span className="text-xs text-muted-foreground">Nenhum</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canStartPreview() && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPreviewUser(u)}
                              title="Visualizar como este usuário"
                            >
                              <Eye className="w-4 h-4 text-primary" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(u)}
                            disabled={!canEditUser(u)}
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingUser(u)}
                            disabled={!canDeleteUser(u)}
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Editar Permissões
              </DialogTitle>
              <DialogDescription>{editingUser?.full_name || editingUser?.email}</DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 py-2 px-6">
                {/* Role */}
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableRoles().map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isSuperAdmin() && (
                    <p className="text-xs text-muted-foreground">Como Admin, você só pode atribuir o role de Usuário</p>
                  )}
                </div>

                {/* Module Permissions */}
                {editRole !== "super_admin" && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Módulos com Acesso
                    </Label>
                    <div className="space-y-3 border rounded-lg p-3">
                      {modules.map((mod) => (
                        <div key={mod.id} className="flex items-center justify-between">
                          <span className="text-sm">{mod.name}</span>
                          <Select
                            value={editModulePermissions[mod.id] || 'none'}
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
                      {modules.length === 0 && <p className="text-xs text-muted-foreground">Nenhum módulo disponível</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Defina o nível de acesso do usuário para cada módulo
                    </p>
                  </div>
                )}

                {/* Client Access */}
                {editRole !== "super_admin" && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Building className="w-4 h-4" />
                      Acesso a Clientes
                    </Label>
                    <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-3">
                      {getAssignableClients().map((client) => (
                        <div key={client.id} className="flex items-center gap-2">
                          <Checkbox
                            id={client.id}
                            checked={editClientIds.includes(client.id)}
                            onCheckedChange={() => toggleClient(client.id)}
                          />
                          <label htmlFor={client.id} className="text-sm cursor-pointer">
                            {client.name}
                          </label>
                        </div>
                      ))}
                      {getAssignableClients().length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {isSuperAdmin() ? "Nenhum cliente cadastrado" : "Você não possui clientes atribuídos"}
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
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o usuário{" "}
                <strong>{deletingUser?.full_name || deletingUser?.email}</strong>? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Preview User Dialog */}
        <PreviewUserDialog
          open={!!previewUser}
          onOpenChange={(open) => !open && setPreviewUser(null)}
          user={previewUser}
          onSuccess={() => navigate('/dashboard')}
        />
      </div>
    </AppLayout>
  );
}
