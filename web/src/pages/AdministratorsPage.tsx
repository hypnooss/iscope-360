import { useEffect, useState, useMemo } from "react";
import { formatDateOnlyBR } from '@/lib/dateUtils';
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageBreadcrumb } from "@/components/layout/PageBreadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit2, Trash2, ShieldCheck, HeadsetIcon, History, Search, Users, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AdminEditDialog } from "@/components/admin/AdminEditDialog";
import { AdminActivityDialog } from "@/components/admin/AdminActivityDialog";

type AdminRole = "super_admin" | "super_suporte";

interface Administrator {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AdminRole;
  created_at: string;
}

const ADMIN_ROLES: { value: AdminRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "super_suporte", label: "Super Suporte" },
];

export default function AdministratorsPage() {
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<Administrator | null>(null);

  // Form states
  const [formEmail, setFormEmail] = useState("");
  const [formFullName, setFormFullName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<AdminRole>("super_suporte");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (!authLoading && user && !isSuperAdmin()) {
      navigate("/dashboard");
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta página.",
        variant: "destructive",
      });
    }
  }, [user, authLoading, navigate, isSuperAdmin, toast]);

  useEffect(() => {
    if (user && isSuperAdmin()) {
      fetchAdministrators();
    }
  }, [user, isSuperAdmin]);

  const fetchAdministrators = async () => {
    try {
      setLoading(true);

      // Fetch users with super_admin or super_suporte roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .in("role", ["super_admin", "super_suporte"]);

      if (rolesError) throw rolesError;

      if (!rolesData || rolesData.length === 0) {
        setAdministrators([]);
        return;
      }

      const userIds = rolesData.map((r) => r.user_id);

      // Fetch profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      // Merge data
      const admins: Administrator[] = rolesData.map((roleRecord) => {
        const profile = profilesData?.find((p) => p.id === roleRecord.user_id);
        return {
          id: roleRecord.user_id,
          email: profile?.email || "",
          full_name: profile?.full_name || null,
          avatar_url: profile?.avatar_url || null,
          role: roleRecord.role as AdminRole,
          created_at: roleRecord.created_at,
        };
      });

      setAdministrators(admins);
    } catch (error) {
      console.error("Error fetching administrators:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os administradores.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormEmail("");
    setFormFullName("");
    setFormPassword("");
    setFormRole("super_suporte");
    setSelectedAdmin(null);
  };

  const handleCreateAdmin = async () => {
    if (!formEmail || !formFullName || !formPassword) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      // Call edge function to create admin user
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: formEmail,
          password: formPassword,
          fullName: formFullName,
          role: formRole,
          moduleIds: [], // Admins don't need specific modules
          clientIds: [], // Admins have access to all
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Log activity
      await supabase.from("admin_activity_logs").insert({
        admin_id: user?.id,
        action: `Criou o administrador ${formFullName} (${formEmail})`,
        action_type: "admin_management",
        target_type: "admin",
        target_id: data?.userId || null,
        target_name: formFullName,
        details: { email: formEmail, role: formRole },
      });

      toast({
        title: "Sucesso",
        description: "Administrador criado com sucesso.",
      });

      setIsCreateDialogOpen(false);
      resetForm();
      fetchAdministrators();
    } catch (error: any) {
      console.error("Error creating administrator:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar o administrador.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditAdmin = async () => {
    if (!selectedAdmin) return;

    try {
      setSaving(true);

      // Update role
      const { error } = await supabase
        .from("user_roles")
        .update({ role: formRole })
        .eq("user_id", selectedAdmin.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Role do administrador atualizada com sucesso.",
      });

      setIsEditDialogOpen(false);
      resetForm();
      fetchAdministrators();
    } catch (error: any) {
      console.error("Error updating administrator:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar o administrador.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!selectedAdmin) return;

    // Prevent deleting yourself
    if (selectedAdmin.id === user?.id) {
      toast({
        title: "Operação não permitida",
        description: "Você não pode remover a si mesmo.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      // Change role to 'user' instead of deleting
      const { error } = await supabase
        .from("user_roles")
        .update({ role: "user" })
        .eq("user_id", selectedAdmin.id);

      if (error) throw error;

      // Log activity
      await supabase.from("admin_activity_logs").insert({
        admin_id: user?.id,
        action: `Removeu as permissões administrativas de ${selectedAdmin.full_name || selectedAdmin.email}`,
        action_type: "admin_management",
        target_type: "admin",
        target_id: selectedAdmin.id,
        target_name: selectedAdmin.full_name || selectedAdmin.email,
        details: { old_role: selectedAdmin.role, new_role: "user" },
      });

      toast({
        title: "Sucesso",
        description: "Administrador removido. O usuário agora tem role 'user'.",
      });

      setIsDeleteDialogOpen(false);
      resetForm();
      fetchAdministrators();
    } catch (error: any) {
      console.error("Error removing administrator:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível remover o administrador.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (admin: Administrator) => {
    setSelectedAdmin(admin);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (admin: Administrator) => {
    setSelectedAdmin(admin);
    setIsDeleteDialogOpen(true);
  };

  const openActivityDialog = (admin: Administrator) => {
    setSelectedAdmin(admin);
    setIsActivityDialogOpen(true);
  };

  const getRoleBadge = (role: AdminRole) => {
    if (role === "super_admin") {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
          <ShieldCheck className="w-3 h-3 mr-1" />
          Super Admin
        </Badge>
      );
    }
    return (
      <Badge className="bg-purple-500 hover:bg-purple-600 text-white">
        <HeadsetIcon className="w-3 h-3 mr-1" />
        Super Suporte
      </Badge>
    );
  };

  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      total: administrators.length,
      superAdmin: administrators.filter((a) => a.role === "super_admin").length,
      superSuporte: administrators.filter((a) => a.role === "super_suporte").length,
      thisMonth: administrators.filter((a) => new Date(a.created_at) >= startOfMonth).length,
    };
  }, [administrators]);

  const filtered = useMemo(() => {
    if (!search) return administrators;
    const q = search.toLowerCase();
    return administrators.filter(
      (a) =>
        (a.full_name || "").toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q)
    );
  }, [administrators, search]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isSuperAdmin()) {
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Administração' }, { label: 'Gerenciamento de Administradores' }]} />
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Administradores</h1>
            <p className="text-muted-foreground">
              Gerencie usuários com acesso administrativo ao sistema
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Administrador
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Super Admin</p>
                  <p className="text-2xl font-bold">{stats.superAdmin}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <HeadsetIcon className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Super Suporte</p>
                  <p className="text-2xl font-bold">{stats.superSuporte}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Criados este mês</p>
                  <p className="text-2xl font-bold">{stats.thisMonth}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar administrador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 max-w-sm"
          />
        </div>

        {/* Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum administrador encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      {admin.full_name || "-"}
                    </TableCell>
                    <TableCell>{admin.email}</TableCell>
                    <TableCell>{getRoleBadge(admin.role)}</TableCell>
                    <TableCell>
                      {formatDateOnlyBR(admin.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openActivityDialog(admin)}
                          title="Atividades recentes"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(admin)}
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(admin)}
                          disabled={admin.id === user?.id}
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Administrador</DialogTitle>
            <DialogDescription>
              Crie um novo usuário com permissões administrativas
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 py-2 px-6">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
                placeholder="Nome do administrador"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as AdminRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAdmin} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog - Using new robust component */}
      <AdminEditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        admin={selectedAdmin}
        onSaved={fetchAdministrators}
        currentUserId={user?.id}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Administrador</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover as permissões administrativas de{" "}
              <strong>{selectedAdmin?.full_name || selectedAdmin?.email}</strong>?
              <br />
              <br />
              O usuário será rebaixado para a role "user".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteAdmin} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Dialog */}
      <AdminActivityDialog
        open={isActivityDialogOpen}
        onOpenChange={setIsActivityDialogOpen}
        admin={selectedAdmin}
      />
    </AppLayout>
  );
}
