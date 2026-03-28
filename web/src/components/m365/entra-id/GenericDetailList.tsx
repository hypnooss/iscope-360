import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

export interface DetailColumn<T> {
  label: string;
  accessor: (item: T) => string | number;
  badge?: boolean;
  badgeColor?: string;
}

interface GenericDetailListProps<T> {
  items: T[];
  columns: DetailColumn<T>[];
  searchKeys: ((item: T) => string)[];
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  emptyMessage?: string;
}

export function GenericDetailList<T>({ items, columns, searchKeys, icon: Icon, iconColor, emptyMessage }: GenericDetailListProps<T>) {
  const [search, setSearch] = useState('');
  const LIMIT = 10;

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => searchKeys.some((fn) => fn(item).toLowerCase().includes(q)));
  }, [items, search, searchKeys]);

  const visible = filtered.slice(0, search.trim() ? filtered.length : LIMIT);
  const hiddenCount = search.trim() ? 0 : Math.max(0, filtered.length - LIMIT);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          {emptyMessage || 'Nenhum registro encontrado.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/30 border border-border/40">
              {Icon && (
                <div className="mt-0.5 shrink-0">
                  <Icon className={`w-4 h-4 ${iconColor || 'text-muted-foreground'}`} />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                {columns.map((col, ci) => {
                  const val = col.accessor(item);
                  if (ci === 0) {
                    return <div key={ci} className="font-medium text-sm truncate">{val}</div>;
                  }
                  if (col.badge) {
                    return (
                      <Badge key={ci} variant="outline" className="text-[10px] px-1.5 py-0" style={col.badgeColor ? { backgroundColor: `${col.badgeColor}20`, color: col.badgeColor, borderColor: `${col.badgeColor}40` } : undefined}>
                        {val}
                      </Badge>
                    );
                  }
                  return <div key={ci} className="text-xs text-muted-foreground truncate">{val}</div>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div className="text-xs text-center text-muted-foreground">
          + {hiddenCount} registro{hiddenCount !== 1 ? 's' : ''}. Use a busca para ver todos.
        </div>
      )}
    </div>
  );
}
