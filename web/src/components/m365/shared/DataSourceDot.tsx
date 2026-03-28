import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type DataSourceType = 'snapshot' | 'aggregated' | 'analyzed';

const SOURCE_CONFIG: Record<DataSourceType, { color: string; label: string }> = {
  snapshot:   { color: 'bg-green-500',  label: 'Dados da última coleta' },
  aggregated: { color: 'bg-blue-500',   label: 'Dados agregados do período' },
  analyzed:   { color: 'bg-purple-500', label: 'Dados analisados pelo agente' },
};

interface DataSourceDotProps {
  source: DataSourceType;
  className?: string;
}

export function DataSourceDot({ source, className = '' }: DataSourceDotProps) {
  const cfg = SOURCE_CONFIG[source];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cfg.color} ${className}`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {cfg.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
