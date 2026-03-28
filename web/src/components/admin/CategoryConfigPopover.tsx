import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Loader2, Trash2 } from 'lucide-react';
import { 
  AVAILABLE_ICONS, 
  AVAILABLE_COLORS, 
  useUpsertCategoryConfig,
  getCategoryConfig,
  type CategoryConfig,
} from '@/hooks/useCategoryConfig';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface CategoryConfigPopoverProps {
  categoryName: string;
  deviceTypeId: string;
  configs: CategoryConfig[] | undefined;
  rulesCount?: number;
  onSaved?: () => void;
  onDeleted?: () => void;
}

// Dynamic icon component
function DynamicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const iconName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') as keyof typeof LucideIcons;
  
  const IconComponent = LucideIcons[iconName] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  
  if (!IconComponent) {
    return <LucideIcons.Shield className={className} style={style} />;
  }
  
  return <IconComponent className={className} style={style} />;
}

export function CategoryConfigPopover({ 
  categoryName, 
  deviceTypeId,
  configs,
  rulesCount = 0,
  onSaved,
  onDeleted
}: CategoryConfigPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  
  const currentConfig = getCategoryConfig(configs, categoryName);
  const existingConfig = configs?.find(c => c.name === categoryName);
  
  const [displayName, setDisplayName] = useState(currentConfig.displayName);
  const [icon, setIcon] = useState(currentConfig.icon);
  const [color, setColor] = useState(currentConfig.color);
  const [displayOrder, setDisplayOrder] = useState(existingConfig?.display_order ?? 0);

  const upsertMutation = useUpsertCategoryConfig();

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingConfig?.id) {
        throw new Error('Categoria não existe no banco de dados');
      }
      
      const { error } = await supabase
        .from('rule_categories')
        .delete()
        .eq('id', existingConfig.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Categoria excluída com sucesso');
      queryClient.invalidateQueries({ queryKey: ['category-configs', deviceTypeId] });
      setShowDeleteConfirm(false);
      setIsOpen(false);
      onDeleted?.();
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir categoria: ' + error.message);
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      const config = getCategoryConfig(configs, categoryName);
      const existing = configs?.find(c => c.name === categoryName);
      setDisplayName(config.displayName);
      setIcon(config.icon);
      setColor(config.color);
      setDisplayOrder(existing?.display_order ?? 0);
    }
  }, [isOpen, configs, categoryName]);

  const handleSave = async () => {
    await upsertMutation.mutateAsync({
      device_type_id: deviceTypeId,
      name: categoryName,
      display_name: displayName !== categoryName ? displayName : null,
      icon,
      color,
      display_order: displayOrder,
    });
    setIsOpen(false);
    onSaved?.();
  };

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const canDelete = rulesCount === 0 && existingConfig?.id;
  const selectedColor = AVAILABLE_COLORS.find(c => c.name === color);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-50 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
      >
        <Settings className="h-4 w-4" />
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent 
          className="max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Configurar Categoria</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Personalize a aparência e ordem de exibição desta categoria nos relatórios.
            </p>
            
            <div className="grid gap-3">
              {/* Display Name */}
              <div className="grid gap-1.5">
                <Label htmlFor="displayName">Nome de Exibição</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={categoryName}
                />
              </div>

              {/* Display Order */}
              <div className="grid gap-1.5">
                <Label htmlFor="displayOrder">Ordem de Exibição</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                  min={0}
                  max={999}
                />
                <p className="text-xs text-muted-foreground">
                  Categorias com menor número aparecem primeiro
                </p>
              </div>

              {/* Icon Selection */}
              <div className="grid gap-1.5">
                <Label>Ícone</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger>
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <DynamicIcon name={icon} className="h-4 w-4" />
                        <span>{AVAILABLE_ICONS.find(i => i.name === icon)?.label || icon}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_ICONS.map((iconOption) => (
                      <SelectItem key={iconOption.name} value={iconOption.name}>
                        <div className="flex items-center gap-2">
                          <DynamicIcon name={iconOption.name} className="h-4 w-4" />
                          <span>{iconOption.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Color Selection */}
              <div className="grid gap-1.5">
                <Label>Cor</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger>
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: selectedColor?.hex }}
                        />
                        <span>{selectedColor?.label || color}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_COLORS.map((colorOption) => (
                      <SelectItem key={colorOption.name} value={colorOption.name}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-4 w-4 rounded-full border border-border"
                            style={{ backgroundColor: colorOption.hex }}
                          />
                          <span>{colorOption.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-lg border p-3">
              <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
              <div 
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md border-l-4"
                )}
                style={{ 
                  borderLeftColor: selectedColor?.hex,
                  backgroundColor: `${selectedColor?.hex}10`
                }}
              >
                <DynamicIcon 
                  name={icon} 
                  className="h-5 w-5" 
                  style={{ color: selectedColor?.hex }}
                />
                <span 
                  className="font-semibold"
                  style={{ color: selectedColor?.hex }}
                >
                  {displayName}
                </span>
              </div>
            </div>

            {/* Delete Section - only for empty categories */}
            {canDelete && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-destructive">Excluir Categoria</p>
                    <p className="text-xs text-muted-foreground">
                      Esta categoria está vazia e pode ser excluída
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A categoria "{currentConfig.displayName}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
