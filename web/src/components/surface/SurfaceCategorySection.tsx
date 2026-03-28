import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Shield } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { SurfaceFindingCard } from './SurfaceFindingCard';
import {
  type SurfaceFinding,
  type SurfaceFindingCategoryInfo,
} from '@/lib/surfaceFindings';

// Dynamic icon component
function DynamicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const iconName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') as keyof typeof LucideIcons;

  const IconComponent = LucideIcons[iconName] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

  if (!IconComponent) {
    return <Shield className={className} style={style} />;
  }

  return <IconComponent className={className} style={style} />;
}

interface SurfaceCategorySectionProps {
  categoryInfo: SurfaceFindingCategoryInfo;
  findings: SurfaceFinding[];
  index: number;
  defaultOpen?: boolean;
}

export function SurfaceCategorySection({
  categoryInfo,
  findings,
  index,
  defaultOpen = true,
}: SurfaceCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  if (findings.length === 0) return null;

  return (
    <div
      className="animate-slide-in"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between h-auto py-4 px-4 rounded-lg"
            style={{
              backgroundColor: `${categoryInfo.colorHex}10`,
              borderColor: `${categoryInfo.colorHex}30`,
              borderWidth: '1px',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${categoryInfo.colorHex}15` }}
              >
                <DynamicIcon
                  name={categoryInfo.icon}
                  className="w-5 h-5"
                  style={{ color: categoryInfo.colorHex }}
                />
              </div>
              <div className="text-left">
                <span className="text-base font-semibold text-foreground">{categoryInfo.label}</span>
                <p className="text-xs text-muted-foreground">{categoryInfo.description}</p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {findings.length} achado{findings.length !== 1 ? 's' : ''}
              </Badge>
              {criticalCount > 0 && (
                <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">
                  {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {highCount > 0 && (
                <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">
                  {highCount} alto{highCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {mediumCount > 0 && (
                <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs">
                  {mediumCount} médio{mediumCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {lowCount > 0 && (
                <Badge className="bg-blue-400/10 text-blue-400 border-blue-400/20 text-xs">
                  {lowCount} baixo{lowCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <div className="flex items-center">
              {isOpen ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent
          className="pt-4 space-y-3 pl-4 ml-6 mb-6"
          style={{
            borderLeftWidth: '2px',
            borderLeftColor: `${categoryInfo.colorHex}30`,
          }}
        >
          {findings.map(finding => (
            <SurfaceFindingCard
              key={finding.id}
              finding={finding}
              categoryColorKey={categoryInfo.color}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
