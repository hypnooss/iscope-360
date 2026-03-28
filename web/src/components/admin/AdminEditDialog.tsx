import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  User,
  Shield,
  AlertCircle,
} from "lucide-react";

type AdminRole = "super_admin" | "super_suporte";

interface Administrator {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AdminRole;
  created_at: string;
}

interface AdminEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: Administrator | null;
  onSaved: () => void;
  currentUserId?: string;
}

const ADMIN_ROLES: { value: AdminRole; label: string; description: string }[] = [
  { 
    value: "super_admin", 
    label: "Super Admin",
    description: "Acesso total ao sistema, incluindo gerenciamento de outros administradores"
  },
  { 
    value: "super_suporte", 
    label: "Super Suporte",
    description: "Acesso de visualização e suporte, sem permissões de gerenciamento"
  },
];

export function AdminEditDialog({
  open,
  onOpenChange,
  admin,
  onSaved,
  currentUserId,
}: AdminEditDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  
  // Form states
  const [formFullName, setFormFullName] = useState("");
  const [formRole, setFormRole] = useState<AdminRole>("super_suporte");

  const isEditingSelf = admin?.id === currentUserId;

  useEffect(() => {
    if (admin && open) {
      setFormFullName(admin.full_name || "");
      setFormRole(admin.role);
    }
  }, [admin, open]);

  const handleSave = async () => {
    if (!admin) return;

    try {
      setSaving(true);

      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: formFullName })
        .eq("id", admin.id);

      if (profileError) throw profileError;

      // Update role if changed and not editing self
      if (formRole !== admin.role && !isEditingSelf) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .update({ role: formRole })
          .eq("user_id", admin.id);

        if (roleError) throw roleError;

        // Log the role change
        await supabase.from("admin_activity_logs").insert({
          admin_id: currentUserId,
          action: `Alterou a role de ${admin.full_name || admin.email} para ${formRole === "super_admin" ? "Super Admin" : "Super Suporte"}`,
          action_type: "admin_management",
          target_type: "admin",
          target_id: admin.id,
          target_name: admin.full_name || admin.email,
          details: { old_role: admin.role, new_role: formRole },
        });
      }

      toast({
        title: "Sucesso",
        description: "Administrador atualizado com sucesso.",
      });

      onSaved();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error updating administrator:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o administrador.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!admin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Editar Administrador
          </DialogTitle>
          <DialogDescription>
            {admin.email}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 py-2 px-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Informações Pessoais
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="Nome do administrador"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={admin.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    O email não pode ser alterado
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Role Management */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Role e Permissões
              </h3>

              {isEditingSelf ? (
                <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-600">
                        Você não pode alterar sua própria role
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Por segurança, outro Super Admin deve fazer essa alteração.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select 
                      value={formRole} 
                      onValueChange={(v) => setFormRole(v as AdminRole)}
                    >
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

                  {/* Role Description */}
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-sm text-muted-foreground">
                      {ADMIN_ROLES.find(r => r.value === formRole)?.description}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
