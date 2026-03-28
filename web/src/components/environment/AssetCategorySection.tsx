import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Monitor, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface AssetItem {
  id: string;
  name: string;
  type?: string;
  agentName: string | null;
  workspaceName: string;
  score: number | null;
  status: string;
  navigationUrl: string;
  scheduleFrequency?: string | null;
  scheduleHour?: number;
  scheduleDayOfWeek?: number;
  scheduleDayOfMonth?: number;
}

interface AssetCategorySectionProps {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  items: AssetItem[];
  totalCount: number;
  isLoading: boolean;
  renderActions?: (asset: AssetItem) => React.ReactNode;
}

const FREQUENCY_BADGE_STYLES: Record<string, string> = {
  daily:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
  weekly:  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  monthly: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  manual:  'bg-muted text-muted-foreground border-border',
};
const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', manual: 'Manual',
};
const DAYS_OF_WEEK_SHORT: Record<number, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
};

const translateStatus = (status: string): string => {
  const map: Record<string, string> = {
    analyzed: 'Analisado',
    pending: 'Pendente',
    partial: 'Parcial',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    error: 'Erro',
    active: 'Ativo',
  };
  return map[status.toLowerCase()] || status;
};

const getScoreColor = (score: number | null) => {
  if (score === null) return 'bg-muted text-muted-foreground';
  if (score >= 75) return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
  if (score >= 50) return 'bg-warning/20 text-warning border-warning/30';
  return 'bg-destructive/20 text-destructive border-destructive/30';
};

type SortKey = 'name' | 'agentName' | 'workspaceName' | 'scheduleFrequency' | 'score' | 'status';
type SortDir = 'asc' | 'desc' | null;

function SortableHead({ label, sortKey: colKey, activeSortKey, sortDir, onSort }: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeSortKey === colKey;
  const Icon = isActive && sortDir === 'asc' ? ArrowUp : isActive && sortDir === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors -my-1"
        onClick={() => onSort(colKey)}
      >
        {label}
        <Icon className={`w-3 h-3 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  );
}

export function AssetCategorySection({ title, icon: Icon, iconColor, items, totalCount, isLoading, renderActions }: AssetCategorySectionProps) {
  const navigate = useNavigate();
  const storageKey = `env-sort-${title}`;

  const [sortKey, setSortKey] = useState<SortKey | null>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s).key : null; } catch { return null; }
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s).dir : null; } catch { return null; }
  });

  const handleSort = (key: SortKey) => {
    let newKey: SortKey | null, newDir: SortDir;
    if (sortKey !== key) { newKey = key; newDir = 'asc'; }
    else if (sortDir === 'asc') { newKey = key; newDir = 'desc'; }
    else { newKey = null; newDir = null; }
    setSortKey(newKey); setSortDir(newDir);
    if (newKey && newDir) localStorage.setItem(storageKey, JSON.stringify({ key: newKey, dir: newDir }));
    else localStorage.removeItem(storageKey);
  };

  const sortedItems = useMemo(() => {
    if (!sortKey || !sortDir) return items;
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sortKey === 'score') {
        const sa = a.score ?? (sortDir === 'asc' ? Infinity : -Infinity);
        const sb = b.score ?? (sortDir === 'asc' ? Infinity : -Infinity);
        return (sa - sb) * mul;
      }
      const va = (a[sortKey] ?? '') as string;
      const vb = (b[sortKey] ?? '') as string;
      return va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' }) * mul;
    });
  }, [items, sortKey, sortDir]);

  if (!isLoading && totalCount === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Badge variant="secondary" className="text-xs">{isLoading ? '…' : totalCount}</Badge>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum ativo encontrado</p>
            </div>
          ) : (
            <Table className="table-fixed w-full">
              <colgroup>
                <col />
                <col style={{ width: '180px' }} />
                <col style={{ width: '240px' }} />
                <col style={{ width: '240px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Nome" sortKey="name" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead label="Agent" sortKey="agentName" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead label="Workspace" sortKey="workspaceName" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead label="Frequência" sortKey="scheduleFrequency" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead label="Score" sortKey="score" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableHead label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map(asset => {
                  const freq = asset.scheduleFrequency || null;
                  return (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium text-foreground max-w-0 truncate">{asset.name}</TableCell>
                      <TableCell className={asset.agentName ? 'text-foreground truncate' : 'text-muted-foreground truncate'}>
                        {asset.agentName || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate">{asset.workspaceName}</TableCell>
                      <TableCell>
                        {freq ? (
                          <div className="flex flex-row flex-wrap items-center gap-1">
                            <Badge variant="outline" className={`text-xs ${FREQUENCY_BADGE_STYLES[freq] || FREQUENCY_BADGE_STYLES.manual}`}>
                              {FREQUENCY_LABELS[freq] || freq}
                            </Badge>
                            {freq === 'daily' && (
                              <Badge variant="outline" className={`text-xs ${FREQUENCY_BADGE_STYLES.daily}`}>
                                {String(asset.scheduleHour ?? 0).padStart(2, '0')}:00
                              </Badge>
                            )}
                            {freq === 'weekly' && (
                              <Badge variant="outline" className={`text-xs ${FREQUENCY_BADGE_STYLES.weekly}`}>
                                {DAYS_OF_WEEK_SHORT[asset.scheduleDayOfWeek ?? 1]} · {String(asset.scheduleHour ?? 0).padStart(2, '0')}:00
                              </Badge>
                            )}
                            {freq === 'monthly' && (
                              <Badge variant="outline" className={`text-xs ${FREQUENCY_BADGE_STYLES.monthly}`}>
                                Dia {asset.scheduleDayOfMonth ?? 1} · {String(asset.scheduleHour ?? 0).padStart(2, '0')}:00
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {asset.score !== null ? (
                          <Badge variant="outline" className={getScoreColor(asset.score)}>
                            {asset.score}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{translateStatus(asset.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {renderActions ? renderActions(asset) : (
                          <Button variant="ghost" size="sm" onClick={() => navigate(asset.navigationUrl)}>
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Abrir
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
