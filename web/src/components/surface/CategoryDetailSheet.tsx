import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { SurfaceFindingCard } from './SurfaceFindingCard';
import {
  CATEGORY_INFO,
  type SurfaceFinding,
  type SurfaceFindingCategory,
} from '@/lib/surfaceFindings';

function DynamicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const iconName = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('') as keyof typeof LucideIcons;
  const IconComponent = LucideIcons[iconName] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  if (!IconComponent) return <Shield className={className} style={style} />;
  return <IconComponent className={className} style={style} />;
}

interface CategoryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: SurfaceFindingCategory | null;
  findings: SurfaceFinding[];
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function CategoryDetailSheet({
  open,
  onOpenChange,
  category,
  findings,
  title,
  subtitle,
  children,
}: CategoryDetailSheetProps) {
  const info = category ? CATEGORY_INFO[category] : null;

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-center gap-3">
            {info && (
              <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${info.colorHex}15` }}>
                <DynamicIcon name={info.icon} className="w-5 h-5" style={{ color: info.colorHex }} />
              </div>
            )}
            <div className="min-w-0">
              <SheetTitle className="text-lg">{title || info?.label || 'Detalhes'}</SheetTitle>
              {(subtitle || info?.description) && (
                <p className="text-sm text-muted-foreground">{subtitle || info?.description}</p>
              )}
            </div>
          </div>
          {findings.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {findings.length} serviço{findings.length !== 1 ? 's' : ''} exposto{findings.length !== 1 ? 's' : ''}
              </Badge>
              {criticalCount > 0 && (
                <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-500 border-red-500/30">
                  {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {highCount > 0 && (
                <Badge variant="outline" className="text-[10px] bg-orange-500/20 text-orange-500 border-orange-500/30">
                  {highCount} alto{highCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="p-6 space-y-3">
            {children}
            {findings.map(finding => (
              <SurfaceFindingCard
                key={finding.id}
                finding={finding}
                categoryColorKey={info?.color}
              />
            ))}
            {findings.length === 0 && !children && (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhum achado nesta categoria.</p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
