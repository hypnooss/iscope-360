import { Shield, ExternalLink } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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

interface CategoryOverviewGridProps {
  findings: SurfaceFinding[];
  leakedCount?: number;
  onCategoryClick: (category: SurfaceFindingCategory) => void;
}

const CATEGORY_ORDER: SurfaceFindingCategory[] = [
  'risky_services', 'vulnerabilities', 'tls_certificates',
  'web_security', 'crypto_weaknesses', 'obsolete_tech', 'leaked_credentials',
];

const SEV_COLORS = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
};

export function CategoryOverviewGrid({ findings, leakedCount = 0, onCategoryClick }: CategoryOverviewGridProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {CATEGORY_ORDER.map(catKey => {
        const info = CATEGORY_INFO[catKey];
        const catFindings = findings.filter(f => f.category === catKey);
        const isLeaked = catKey === 'leaked_credentials';

        const counts = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const f of catFindings) counts[f.severity]++;
        const total = catFindings.length + (isLeaked ? leakedCount : 0);
        const totalBar = counts.critical + counts.high + counts.medium + counts.low;

        return (
          <Card
            key={catKey}
            className={cn(
              'border cursor-pointer transition-all duration-200 hover:shadow-md group',
              total === 0 ? 'opacity-50 border-border/30' : 'border-border/50 hover:border-border'
            )}
            onClick={() => onCategoryClick(catKey)}
          >
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${info.colorHex}15` }}>
                  <DynamicIcon name={info.icon} className="w-4.5 h-4.5" style={{ color: info.colorHex }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{info.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {isLeaked
                      ? `${leakedCount} email${leakedCount !== 1 ? 's' : ''} vazado${leakedCount !== 1 ? 's' : ''}`
                      : `${catFindings.length} achado${catFindings.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              {/* Segmented severity bar */}
              {!isLeaked && totalBar > 0 && (
                <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden flex">
                  {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                    const pct = (counts[sev] / totalBar) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={sev}
                        className={cn('h-full first:rounded-l-full last:rounded-r-full', SEV_COLORS[sev])}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
              )}
              {isLeaked && leakedCount > 0 && (
                <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: '100%' }} />
                </div>
              )}
              {total === 0 && (
                <div className="w-full h-2 rounded-full bg-muted/30" />
              )}

              {/* Severity badges */}
              {!isLeaked && totalBar > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {counts.critical > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-500 border-red-500/30">{counts.critical} Critical</Badge>}
                  {counts.high > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-500/20 text-orange-500 border-orange-500/30">{counts.high} High</Badge>}
                  {counts.medium > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-yellow-500/20 text-yellow-500 border-yellow-500/30">{counts.medium} Medium</Badge>}
                  {counts.low > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-400/20 text-blue-400 border-blue-400/30">{counts.low} Low</Badge>}
                </div>
              )}

              {/* Click indicator */}
              <div className="flex justify-end mt-1">
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
