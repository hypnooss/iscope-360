import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Check } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { 
  useUpsertCategoryConfig, 
  AVAILABLE_ICONS, 
  AVAILABLE_COLORS 
} from '@/hooks/useCategoryConfig';
import { cn } from '@/lib/utils';

interface CreateCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceTypeId: string;
  existingCategories: string[];
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

export function CreateCategoryDialog({
  open,
  onOpenChange,
  deviceTypeId,
  existingCategories,
}: CreateCategoryDialogProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('shield');
  const [selectedColor, setSelectedColor] = useState('slate-500');
  
  const upsertConfig = useUpsertCategoryConfig();
  
  const handleSave = async () => {
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      toast.error('Nome da categoria é obrigatório');
      return;
    }
    
    if (existingCategories.includes(trimmedName)) {
      toast.error('Já existe uma categoria com esse nome');
      return;
    }
    
    try {
      await upsertConfig.mutateAsync({
        device_type_id: deviceTypeId,
        name: trimmedName,
        display_name: displayName.trim() || null,
        icon: selectedIcon,
        color: selectedColor,
      });
      
      toast.success('Categoria criada com sucesso!');
      onOpenChange(false);
      resetForm();
    } catch (error) {
      // Error already handled by hook
    }
  };
  
  const resetForm = () => {
    setName('');
    setDisplayName('');
    setSelectedIcon('shield');
    setSelectedColor('slate-500');
  };
  
  const selectedColorHex = AVAILABLE_COLORS.find(c => c.name === selectedColor)?.hex || '#64748b';
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Preview */}
          <div 
            className="p-4 rounded-lg border-l-4 flex items-center gap-3"
            style={{ 
              borderLeftColor: selectedColorHex,
              backgroundColor: `${selectedColorHex}10`
            }}
          >
            <DynamicIcon 
              name={selectedIcon} 
              className="w-5 h-5"
              style={{ color: selectedColorHex }}
            />
            <span 
              className="font-semibold"
              style={{ color: selectedColorHex }}
            >
              {displayName || name || 'Nome da Categoria'}
            </span>
          </div>
          
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="category-name">Nome Interno *</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Segurança de Rede"
            />
            <p className="text-xs text-muted-foreground">
              Identificador usado nas regras de compliance
            </p>
          </div>
          
          {/* Display Name Input */}
          <div className="space-y-2">
            <Label htmlFor="display-name">Nome de Exibição</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Opcional - será exibido no relatório"
            />
          </div>
          
          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>Ícone</Label>
            <ScrollArea className="h-24 w-full rounded border">
              <div className="grid grid-cols-9 gap-1 p-2">
                {AVAILABLE_ICONS.map((icon) => (
                  <button
                    key={icon.name}
                    type="button"
                    onClick={() => setSelectedIcon(icon.name)}
                    className={cn(
                      "p-2 rounded hover:bg-muted transition-colors relative",
                      selectedIcon === icon.name && "bg-primary/10 ring-1 ring-primary"
                    )}
                    title={icon.label}
                  >
                    <DynamicIcon name={icon.name} className="w-4 h-4" />
                    {selectedIcon === icon.name && (
                      <Check className="w-3 h-3 absolute -top-1 -right-1 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          
          {/* Color Selection */}
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="grid grid-cols-7 gap-2">
              {AVAILABLE_COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => setSelectedColor(color.name)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all relative",
                    selectedColor === color.name 
                      ? "border-foreground scale-110" 
                      : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: color.hex }}
                  title={color.label}
                >
                  {selectedColor === color.name && (
                    <Check className="w-4 h-4 absolute inset-0 m-auto text-white drop-shadow-md" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={upsertConfig.isPending}>
            {upsertConfig.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar Categoria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
