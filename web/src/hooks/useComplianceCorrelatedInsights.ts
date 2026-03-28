import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AnalyzerSnapshot, AnalyzerMetrics } from '@/types/analyzerInsights';
import type { FirewallSecurityInsight, ComplianceCorrelationRule } from '@/types/firewallSecurityInsights';

// Static correlation rules: compliance code → traffic evidence
const CORRELATION_RULES: ComplianceCorrelationRule[] = [
  {
    complianceCode: 'utm-001',
    metricCondition: (m) => (m.inboundAllowed as number || 0) > 50,
    severity: 'critical',
    icon: 'ShieldOff',
    title: 'IPS Desabilitado com Tráfego Inbound Ativo',
    what: (m) => `O IPS está desabilitado, porém foram detectadas ${m.inboundAllowed || 0} conexões inbound permitidas neste período.`,
    why: 'Sem IPS ativo, exploits e ataques conhecidos passam pelo firewall sem inspeção, podendo comprometer servidores internos.',
    bestPractice: [
      'Ativar perfil IPS em todas as políticas de tráfego inbound',
      'Utilizar o perfil "protect_client" ou criar perfil customizado',
      'Habilitar assinaturas de alta e crítica severidade em modo "block"',
      'Monitorar logs de IPS para ajustar falsos positivos'
    ],
    businessImpact: 'Vulnerabilidades conhecidas podem ser exploradas sem detecção, resultando em comprometimento de servidores, exfiltração de dados e ransomware.',
    metricExtractor: (m) => [
      { label: 'Inbound Permitido', value: m.inboundAllowed as number || 0 },
      { label: 'Eventos IPS', value: m.ipsEvents as number || 0 },
    ],
  },
  {
    complianceCode: 'utm-004',
    metricCondition: (m) => (m.outboundConnections as number || 0) > 100 && (m.webFilterBlocked as number || 0) === 0,
    severity: 'high',
    icon: 'Globe',
    title: 'Web Filter Inativo com Alto Tráfego de Saída',
    what: (m) => `Nenhum evento de Web Filter foi registrado, mas há ${m.outboundConnections || 0} conexões de saída neste período.`,
    why: 'Sem filtragem web, usuários podem acessar sites maliciosos, phishing e conteúdo inapropriado sem controle.',
    bestPractice: [
      'Ativar Web Filter em todas as políticas de saída para internet',
      'Bloquear categorias de alto risco: Malware, Phishing, Botnets',
      'Configurar FortiGuard URL Filtering com categorias atualizadas',
      'Implementar Safe Search para motores de busca'
    ],
    businessImpact: 'Usuários podem acessar sites de phishing resultando em roubo de credenciais, ou baixar malware que compromete estações de trabalho.',
    metricExtractor: (m) => [
      { label: 'Conexões de Saída', value: m.outboundConnections as number || 0 },
      { label: 'Web Filter Bloqueios', value: m.webFilterBlocked as number || 0 },
    ],
  },
  {
    complianceCode: 'utm-007',
    metricCondition: (m) => (m.outboundConnections as number || 0) > 100 && (m.appControlBlocked as number || 0) === 0,
    severity: 'high',
    icon: 'AppWindow',
    title: 'Controle de Aplicações Inativo',
    what: (m) => `Nenhum bloqueio de Application Control registrado com ${m.outboundConnections || 0} conexões de saída ativas.`,
    why: 'Sem controle de aplicações, shadow IT e aplicações não autorizadas (torrents, VPNs pessoais, messaging) operam sem visibilidade.',
    bestPractice: [
      'Ativar Application Control em políticas de saída',
      'Bloquear categorias: P2P, Proxy, Remote Access não autorizado',
      'Monitorar top aplicações para identificar shadow IT',
      'Criar exceções apenas para aplicações corporativas aprovadas'
    ],
    businessImpact: 'Shadow IT pode causar vazamento de dados por aplicações não controladas e criar vetores de ataque não monitorados.',
    metricExtractor: (m) => [
      { label: 'Conexões de Saída', value: m.outboundConnections as number || 0 },
      { label: 'App Control Bloqueios', value: m.appControlBlocked as number || 0 },
    ],
  },
  {
    complianceCode: 'utm-009',
    metricCondition: (m) => (m.botnetDetections as number || 0) > 0,
    severity: 'critical',
    icon: 'Bug',
    title: 'Antivírus Desabilitado com Detecções de Botnet',
    what: (m) => `O antivírus de gateway está desabilitado e foram detectadas ${m.botnetDetections || 0} comunicações com botnets.`,
    why: 'Sem antivírus no gateway, malware pode trafegar livremente pela rede enquanto dispositivos já comprometidos se comunicam com servidores C&C.',
    bestPractice: [
      'Ativar Antivírus em todas as políticas de tráfego',
      'Habilitar inspeção SSL/TLS para detectar malware em HTTPS',
      'Configurar scan de protocolos HTTP, FTP, SMTP e POP3',
      'Realizar varredura imediata de malware em hosts internos'
    ],
    businessImpact: 'Malware ativo na rede pode causar ransomware, exfiltração de dados e propagação lateral para outros sistemas.',
    metricExtractor: (m) => [
      { label: 'Detecções Botnet', value: m.botnetDetections as number || 0 },
      { label: 'Domínios C&C', value: (m.botnetDomains as unknown[])?.length ?? 0 },
    ],
  },
  {
    complianceCode: 'int-001',
    metricCondition: (m) => (m.firewallAuthFailures as number || 0) > 10,
    severity: 'critical',
    icon: 'Monitor',
    title: 'Interface Admin HTTP Exposta com Ataques Ativos',
    what: (m) => `HTTP administrativo habilitado em interface externa com ${m.firewallAuthFailures || 0} tentativas de login falhadas.`,
    why: 'HTTP transmite credenciais em texto claro. Combinado com tentativas de brute force, facilita interceptação e comprometimento.',
    bestPractice: [
      'Desabilitar HTTP em todas as interfaces WAN/externas',
      'Usar exclusivamente HTTPS para gerenciamento',
      'Restringir acesso admin apenas a IPs confiáveis',
      'Implementar trusted hosts na configuração de admins'
    ],
    businessImpact: 'Credenciais admin podem ser interceptadas em trânsito, resultando em controle total do firewall pelo atacante.',
    metricExtractor: (m) => [
      { label: 'Falhas de Login', value: m.firewallAuthFailures as number || 0 },
      { label: 'IPs Atacantes', value: (m.topFwAuthIPsFailed as unknown[])?.length ?? 0 },
    ],
  },
  {
    complianceCode: 'inb-002',
    metricCondition: (m) => (m.inboundAllowed as number || 0) > 0,
    severity: 'critical',
    icon: 'MonitorSmartphone',
    title: 'RDP Exposto com Tráfego Inbound Ativo',
    what: (m) => `RDP (porta 3389) exposto para internet com ${m.inboundAllowed || 0} conexões inbound permitidas.`,
    why: 'RDP é um dos vetores de ataque mais explorados por ransomware e acesso não autorizado.',
    bestPractice: [
      'Remover regras que permitem RDP da internet',
      'Exigir VPN para acesso remoto a desktops',
      'Implementar Network Level Authentication (NLA)',
      'Usar jump servers com MFA para acesso administrativo'
    ],
    businessImpact: 'RDP exposto é o principal vetor de entrada para ransomware, com potencial de paralisação total das operações.',
    metricExtractor: (m) => [
      { label: 'Inbound Permitido', value: m.inboundAllowed as number || 0 },
      { label: 'Inbound Bloqueado', value: m.inboundBlocked as number || 0 },
    ],
  },
  {
    complianceCode: 'inb-003',
    metricCondition: (m) => (m.inboundAllowed as number || 0) > 0,
    severity: 'critical',
    icon: 'HardDrive',
    title: 'SMB/CIFS Exposto com Tráfego Inbound',
    what: (m) => `SMB/CIFS (portas 445/139) exposto para internet com ${m.inboundAllowed || 0} conexões inbound.`,
    why: 'SMB exposto é vetor para exploits como EternalBlue e WannaCry, permitindo propagação lateral massiva.',
    bestPractice: [
      'Bloquear portas 445 e 139 em todas as interfaces WAN',
      'Utilizar VPN para compartilhamento de arquivos remoto',
      'Segmentar rede para limitar acesso SMB interno',
      'Manter patches de segurança atualizados (MS17-010)'
    ],
    businessImpact: 'Exploits SMB podem causar propagação de ransomware em toda a rede em minutos.',
    metricExtractor: (m) => [
      { label: 'Inbound Permitido', value: m.inboundAllowed as number || 0 },
    ],
  },
  {
    complianceCode: 'net-003',
    metricCondition: (m) => (m.totalEvents as number || 0) > 500 && ((m.totalDenied as number || 0) / (m.totalEvents as number || 1)) < 0.3,
    severity: 'high',
    icon: 'ShieldAlert',
    title: 'Regras Any-Any com Alto Volume de Tráfego Permitido',
    what: (m) => `Regras permissivas (any-any) detectadas. Apenas ${Math.round(((m.totalDenied as number || 0) / (m.totalEvents as number || 1)) * 100)}% do tráfego está sendo bloqueado em ${m.totalEvents || 0} eventos.`,
    why: 'Políticas any-any permitem todo tráfego sem inspeção UTM, anulando a eficácia do firewall.',
    bestPractice: [
      'Substituir regras any-any por políticas granulares',
      'Definir origens, destinos e serviços específicos em cada regra',
      'Aplicar perfis UTM (IPS, AV, Web Filter) em todas as regras',
      'Realizar auditoria periódica de regras não utilizadas'
    ],
    businessImpact: 'Firewall operando como roteador — investimento em segurança desperdiçado sem inspeção efetiva.',
    metricExtractor: (m) => [
      { label: 'Total Eventos', value: m.totalEvents as number || 0 },
      { label: 'Taxa de Bloqueio', value: `${Math.round(((m.totalDenied as number || 0) / (m.totalEvents as number || 1)) * 100)}%` },
    ],
  },
  {
    complianceCode: 'sec-002',
    metricCondition: (m) => (m.firewallAuthFailures as number || 0) > 20,
    severity: 'critical',
    icon: 'KeyRound',
    title: '2FA Desabilitado com Brute Force Ativo',
    what: (m) => `Autenticação de dois fatores não está habilitada e há ${m.firewallAuthFailures || 0} tentativas de login falhadas.`,
    why: 'Sem MFA, ataques de força bruta precisam apenas adivinhar a senha. Com volume alto de tentativas, a probabilidade de sucesso aumenta.',
    bestPractice: [
      'Ativar FortiToken ou TOTP para todos os admins',
      'Implementar MFA obrigatório para acesso VPN',
      'Configurar bloqueio temporário após 3 falhas consecutivas',
      'Monitorar alertas de tentativas de brute force'
    ],
    businessImpact: 'Conta admin comprometida sem 2FA resulta em controle total do firewall e possível desativação de todas as proteções.',
    metricExtractor: (m) => [
      { label: 'Falhas de Login', value: m.firewallAuthFailures as number || 0 },
      { label: 'Países Atacantes', value: (m.topFwAuthCountriesFailed as unknown[])?.length ?? 0 },
    ],
  },
  {
    complianceCode: 'sec-001',
    metricCondition: (m) => (m.vpnSuccesses as number || 0) > 0 || (m.vpnFailures as number || 0) > 0,
    severity: 'high',
    icon: 'Lock',
    title: 'Criptografia Fraca com VPN Ativa',
    what: (m) => `Strong crypto não está habilitado e há ${(m.vpnSuccesses as number || 0) + (m.vpnFailures as number || 0)} eventos VPN neste período.`,
    why: 'Sem strong crypto, a VPN pode negociar algoritmos fracos (DES, MD5) vulneráveis a ataques de decriptação.',
    bestPractice: [
      'Habilitar "set strong-crypto enable" na configuração global',
      'Usar AES-256 para criptografia e SHA-256 para hash',
      'Desabilitar SSLv3 e TLS 1.0/1.1',
      'Auditar túneis VPN existentes para verificar cipher suites'
    ],
    businessImpact: 'Tráfego VPN pode ser decriptado por atacantes, expondo dados corporativos sensíveis em trânsito.',
    metricExtractor: (m) => [
      { label: 'Eventos VPN', value: (m.vpnSuccesses as number || 0) + (m.vpnFailures as number || 0) },
    ],
  },
  {
    complianceCode: 'log-001',
    metricCondition: (m) => (m.totalEvents as number || 0) < 50,
    severity: 'high',
    icon: 'FileWarning',
    title: 'Logging Insuficiente — Baixa Visibilidade',
    what: (m) => `Apenas ${m.totalEvents || 0} eventos registrados neste período. Logging pode estar desabilitado ou mal configurado.`,
    why: 'Sem logs adequados, incidentes de segurança passam despercebidos e investigações forenses ficam impossibilitadas.',
    bestPractice: [
      'Habilitar logging em todas as políticas de firewall',
      'Configurar log de "session start" para políticas críticas',
      'Enviar logs para FortiAnalyzer ou SIEM centralizado',
      'Verificar disk logging e memória disponível no firewall'
    ],
    businessImpact: 'Sem visibilidade de eventos, ataques podem ocorrer sem detecção por semanas ou meses.',
    metricExtractor: (m) => [
      { label: 'Total Eventos', value: m.totalEvents as number || 0 },
    ],
  },
];

// Extract failed compliance codes from report_data
function extractFailedCodes(reportData: Record<string, unknown>): Set<string> {
  const failedCodes = new Set<string>();
  const categories = reportData?.categories as Record<string, unknown[]> | undefined;
  if (!categories) return failedCodes;

  for (const checks of Object.values(categories)) {
    if (!Array.isArray(checks)) continue;
    for (const check of checks) {
      const c = check as Record<string, unknown>;
      if (c.status === 'fail' && typeof c.id === 'string') {
        failedCodes.add(c.id);
      }
    }
  }
  return failedCodes;
}

export function useComplianceCorrelatedInsights(
  snapshot: AnalyzerSnapshot | null,
  firewallId: string | undefined
): { insights: FirewallSecurityInsight[]; isLoading: boolean } {
  // Fetch the latest compliance report for this firewall
  const { data: latestReport, isLoading } = useQuery({
    queryKey: ['compliance-report-latest', firewallId],
    queryFn: async () => {
      if (!firewallId) return null;
      const { data, error } = await supabase
        .from('analysis_history')
        .select('report_data')
        .eq('firewall_id', firewallId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error) return null;
      return data?.report_data as Record<string, unknown> | null;
    },
    enabled: !!firewallId && !!snapshot,
    staleTime: 5 * 60 * 1000,
  });

  const insights = useMemo(() => {
    if (!snapshot || !latestReport) return [];

    const failedCodes = extractFailedCodes(latestReport);
    const m = snapshot.metrics as unknown as Record<string, unknown>;
    const result: FirewallSecurityInsight[] = [];

    for (const rule of CORRELATION_RULES) {
      const isFailed = failedCodes.has(rule.complianceCode);
      const conditionMet = rule.metricCondition(m);

      if (isFailed && conditionMet) {
        // Fail: compliance failed + traffic evidence confirms
        result.push({
          id: `compliance-${rule.complianceCode}`,
          title: rule.title,
          severity: rule.severity,
          icon: rule.icon,
          what: rule.what(m),
          why: rule.why,
          bestPractice: rule.bestPractice,
          businessImpact: rule.businessImpact,
          metrics: rule.metricExtractor(m),
          source: 'compliance_correlation',
          complianceCode: rule.complianceCode,
          status: 'fail',
        });
      } else if (!isFailed) {
        // Pass: compliance check passed
        result.push({
          id: `compliance-${rule.complianceCode}`,
          title: rule.title,
          severity: 'low',
          icon: rule.icon,
          what: `A configuração ${rule.complianceCode.toUpperCase()} está em conformidade.`,
          why: 'Este controle de segurança está configurado corretamente.',
          bestPractice: ['Manter a configuração atual e monitorar regularmente'],
          businessImpact: 'Nenhum risco identificado no momento.',
          metrics: rule.metricExtractor(m),
          source: 'compliance_correlation',
          complianceCode: rule.complianceCode,
          status: 'pass',
        });
      }
    }

    return result;
  }, [snapshot, latestReport]);

  return { insights, isLoading };
}
