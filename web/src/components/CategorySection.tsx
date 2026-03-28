import { useState } from 'react';
import { ComplianceCategory } from '@/types/compliance';
import { ComplianceCard } from './ComplianceCard';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  getCategoryConfig, 
  AVAILABLE_COLORS,
  type CategoryConfig,
} from '@/hooks/useCategoryConfig';
import { ComplianceDetailSheet } from '@/components/compliance/ComplianceDetailSheet';
import { mapComplianceCheck } from '@/lib/complianceMappers';
import { ComplianceCheck } from '@/types/compliance';

interface CategorySectionProps {
  category: ComplianceCategory;
  index: number;
  variant?: 'default' | 'external_domain';
  categoryConfigs?: CategoryConfig[];
}

// Descritivos de cada categoria de análise
const categoryDescriptions: Record<string, string> = {
  'Segurança de Interfaces': 'Verifica configurações de acesso às interfaces de gerenciamento, incluindo protocolos inseguros como HTTP e Telnet, e exposição de serviços administrativos em interfaces externas.',
  'Regras de Entrada': 'Analisa políticas de firewall que permitem tráfego de entrada da internet, identificando exposições de serviços críticos como RDP e SMB, e regras sem restrição de origem.',
  'Configuração de Rede': 'Avalia configurações gerais de rede, incluindo regras permissivas (any-any), segmentação e políticas de acesso entre zonas.',
  'Políticas de Segurança': 'Examina configurações de autenticação administrativa, incluindo 2FA, políticas de senha, timeout de sessão e lockout de conta.',
  'Atualização de Firmware': 'Verifica a versão do FortiOS instalada, identifica atualizações disponíveis e compara com as releases mais recentes recomendadas pela Fortinet.',
  'Perfis de Segurança UTM': 'Analisa a aplicação de perfis de segurança (IPS, Antivírus, Web Filter, App Control) nas políticas de firewall, especialmente em regras de saída para internet.',
  'Configuração VPN': 'Avalia configurações de VPN IPSec e SSL VPN, incluindo algoritmos de criptografia, certificados e práticas de segurança.',
  'Logging e Monitoramento': 'Verifica configurações de log, integração com FortiAnalyzer/FortiCloud e habilitação de logging para eventos de segurança.',
  'Licenciamento': 'Verifica o status do contrato FortiCare e licenças de segurança FortiGuard (AV, IPS, WebFilter, AppControl), incluindo datas de expiração.',
};

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

export function CategorySection({ category, index, variant = 'default', categoryConfigs }: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedCheck, setSelectedCheck] = useState<ComplianceCheck | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  
  // Get config from database or use defaults
  const config = getCategoryConfig(categoryConfigs, category.name);
  const colorOption = AVAILABLE_COLORS.find(c => c.name === config.color);
  const colorHex = colorOption?.hex || '#64748b';

  // Count failures by severity (only active/failing items)
  const criticalCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'critical'
  ).length;

  const highCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'high'
  ).length;

  const mediumCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'medium'
  ).length;

  const lowCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'low'
  ).length;

  const getPassRateColor = () => {
    if (category.passRate >= 80) return 'text-success';
    if (category.passRate >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const handleCheckClick = (check: ComplianceCheck) => {
    setSelectedCheck(check);
    setSheetOpen(true);
  };

  return (
    <div 
      className="animate-slide-in mb-10"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 rounded-lg mb-3 transition-colors"
        style={{
          backgroundColor: `${colorHex}10`,
          borderColor: `${colorHex}30`,
          borderWidth: '1px',
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div 
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${colorHex}15` }}
          >
            <DynamicIcon 
              name={config.icon} 
              className="w-5 h-5" 
              style={{ color: colorHex }}
            />
          </div>
          <span className="text-base font-semibold text-foreground">{config.displayName}</span>
          <Badge variant="secondary" className="text-xs">
            {category.checks.length} verificaç{category.checks.length !== 1 ? 'ões' : 'ão'}
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

        <div className="flex items-center gap-4">
          {category.name !== 'Recomendações' && (
            <span className={cn("text-lg font-semibold tabular-nums", getPassRateColor())}>
              {category.passRate}%
            </span>
          )}
          {category.name === 'Recomendações' && (
            <span className="text-sm text-muted-foreground font-medium">
              Sugestões
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div 
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 pl-4 ml-6 mb-6"
          style={{ 
            borderLeftWidth: '2px',
            borderLeftColor: `${colorHex}30`,
          }}
        >
          {category.checks.map((check) => (
            <ComplianceCard 
              key={check.id} 
              check={check} 
              variant={variant} 
              categoryColorKey={config.color}
              onClick={() => handleCheckClick(check)}
            />
          ))}
        </div>
      )}

      <ComplianceDetailSheet
        item={selectedCheck ? mapComplianceCheck(selectedCheck) : null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
