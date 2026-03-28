import type { DataSourceType } from './DataSourceDot';

const ITEMS: { source: DataSourceType; color: string; label: string }[] = [
  { source: 'snapshot',   color: 'bg-green-500',  label: 'Última coleta' },
  { source: 'aggregated', color: 'bg-blue-500',   label: 'Agregado' },
  { source: 'analyzed',   color: 'bg-purple-500', label: 'Analisado' },
];

export function DataSourceLegend() {
  return (
    <div className="flex items-center gap-4">
      {ITEMS.map(item => (
        <div key={item.source} className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${item.color}`} />
          <span className="text-[11px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
