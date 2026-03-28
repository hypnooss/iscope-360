import { Building2, ChevronDown, Check, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Tenant {
  id: string;
  displayName: string;
  domain: string;
}

interface TenantSelectorProps {
  tenants: Tenant[];
  selectedId: string | null;
  onSelect: (tenantId: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

export function TenantSelector({
  tenants,
  selectedId,
  onSelect,
  loading = false,
  disabled = false,
}: TenantSelectorProps) {
  const selectedTenant = tenants.find((t) => t.id === selectedId);

  if (tenants.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Building2 className="w-4 h-4" />
        <span>Nenhum tenant conectado</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || loading}>
        <Button
          variant="outline"
          className="flex items-center gap-2 h-auto py-2 px-3"
          disabled={disabled || loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Building2 className="w-4 h-4" />
          )}
          <span className="font-medium">
            {selectedTenant?.domain || 'Selecionar Tenant'}
          </span>
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px]">
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => onSelect(tenant.id)}
            className={cn(
              'flex items-center justify-between cursor-pointer',
              tenant.id === selectedId && 'bg-accent/30'
            )}
          >
            <div className="flex flex-col">
              <span className="font-medium">{tenant.domain}</span>
              {tenant.displayName && (
                <span className={cn(
                  "text-xs",
                  tenant.id === selectedId ? "text-foreground/80" : "text-foreground/60"
                )}>
                  {tenant.displayName}
                </span>
              )}
            </div>
            {tenant.id === selectedId && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
