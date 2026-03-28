import { FileCode, CheckCircle, Code2, Workflow, Settings, ChevronRight } from 'lucide-react';

interface PipelineStep {
  icon: React.ElementType;
  title: string;
  description: string;
}

const pipelineSteps: PipelineStep[] = [
  {
    icon: FileCode,
    title: 'Blueprints',
    description: 'Define os steps de coleta de dados do dispositivo',
  },
  {
    icon: CheckCircle,
    title: 'Regras',
    description: 'Avalia os dados coletados contra critérios de conformidade',
  },
  {
    icon: Code2,
    title: 'Parses',
    description: 'Traduz termos técnicos para linguagem amigável',
  },
  {
    icon: Workflow,
    title: 'Fluxo de Análise',
    description: 'Organiza regras em categorias para o relatório',
  },
  {
    icon: Settings,
    title: 'Visualização',
    description: 'Define ordem e aparência das categorias no relatório',
  },
];

export function TemplatePipelineFlow() {
  return (
    <div className="relative rounded-lg border bg-gradient-to-br from-card via-card to-muted/30 p-6 mb-6 overflow-hidden">
      {/* Background grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      />
      
      <div className="relative">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">
          Pipeline de Processamento do Template
        </h3>
        
        <div className="flex flex-wrap items-stretch justify-center gap-2 md:gap-0">
          {pipelineSteps.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === pipelineSteps.length - 1;
            
            return (
              <div key={step.title} className="flex items-center">
                {/* Step Card */}
                <div className="group flex flex-col items-center p-4 rounded-lg bg-background/60 border border-border/50 hover:border-primary/30 hover:bg-background/80 transition-all duration-200 min-w-[140px] max-w-[160px]">
                  <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground text-center mb-1">
                    {step.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground text-center leading-tight">
                    {step.description}
                  </span>
                </div>
                
                {/* Arrow connector */}
                {!isLast && (
                  <div className="hidden md:flex items-center px-2">
                    <ChevronRight className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
