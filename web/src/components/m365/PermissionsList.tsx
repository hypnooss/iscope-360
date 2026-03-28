import { CheckCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RequiredPermission } from '@/hooks/useTenantConnection';
import { Badge } from '@/components/ui/badge';

interface PermissionsListProps {
  permissions: RequiredPermission[];
  title?: string;
  showDescription?: boolean;
}

export function PermissionsList({ 
  permissions, 
  title = "Permissões que serão solicitadas",
  showDescription = true 
}: PermissionsListProps) {
  const requiredPerms = permissions.filter(p => p.is_required);
  const optionalPerms = permissions.filter(p => !p.is_required);

  return (
    <Card className="bg-muted/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="w-4 h-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requiredPerms.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Obrigatórias</p>
            {requiredPerms.map((perm) => (
              <div key={perm.id} className="flex items-start gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{perm.permission_name}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {perm.permission_type}
                    </Badge>
                  </div>
                  {showDescription && perm.description && (
                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {optionalPerms.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Opcionais</p>
            {optionalPerms.map((perm) => (
              <div key={perm.id} className="flex items-start gap-2 text-sm opacity-70">
                <CheckCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-mono text-xs">{perm.permission_name}</span>
                  {showDescription && perm.description && (
                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
