import { useMemo } from 'react';
import type { AnalyzerSnapshot } from '@/types/analyzerInsights';
import type { FirewallSecurityInsight } from '@/types/firewallSecurityInsights';

export function useFirewallSecurityInsights(snapshot: AnalyzerSnapshot | null): FirewallSecurityInsight[] {
  return useMemo(() => {
    if (!snapshot) return [];
    
    const insights: FirewallSecurityInsight[] = [];
    const m = snapshot.metrics;

    // Heurística 1: VPN Bombardeada
    const vpnFailures = m.vpnFailures || 0;
    const vpnCountries = new Set(m.topVpnAuthCountriesFailed?.map(c => c.country) ?? []).size;
    const hasVpnData = (m.vpnSuccesses || 0) > 0 || vpnFailures > 0;

    if (vpnFailures > 100 && vpnCountries > 5) {
      insights.push({
        id: 'vpn-exposed',
        title: 'VPN Exposta a Ataques Globais',
        severity: 'high',
        icon: 'Wifi',
        status: 'fail',
        what: `${vpnFailures} tentativas de VPN de ${vpnCountries} países diferentes.`,
        why: 'VPNs sem restrição geográfica são alvos constantes de ataques automatizados de força bruta.',
        bestPractice: [
          'Restringir origens por geolocalização (países permitidos)',
          'Implementar whitelist de IPs ou redes confiáveis',
          'Ativar autenticação multifator (MFA) obrigatória',
          'Configurar rate limiting para tentativas de login'
        ],
        businessImpact: 'Credenciais comprometidas podem resultar em acesso não autorizado à rede interna, exfiltração de dados sensíveis e violação de conformidade.',
        metrics: [
          { label: 'Tentativas Falhadas', value: vpnFailures },
          { label: 'Países Únicos', value: vpnCountries },
        ],
      });
    } else if (hasVpnData) {
      insights.push({
        id: 'vpn-exposed',
        title: 'VPN sem Ataques Globais Significativos',
        severity: 'low',
        icon: 'Wifi',
        status: 'pass',
        what: `VPN ativa com ${vpnFailures} tentativas falhadas de ${vpnCountries} países — dentro do esperado.`,
        why: 'O volume de tentativas de acesso à VPN está dentro dos parâmetros normais.',
        bestPractice: ['Manter monitoramento contínuo de tentativas de acesso VPN'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'Tentativas Falhadas', value: vpnFailures },
          { label: 'Países Únicos', value: vpnCountries },
        ],
      });
    }

    // Heurística 2: Admin Brute Force
    const totalAuth = (m.firewallAuthSuccesses || 0) + (m.firewallAuthFailures || 0);
    const adminFailRate = totalAuth > 0 ? (m.firewallAuthFailures || 0) / totalAuth : 0;
    
    if (adminFailRate > 0.5 && (m.firewallAuthFailures || 0) > 20) {
      insights.push({
        id: 'admin-brute-force',
        title: 'Alta Taxa de Falhas em Acesso Administrativo',
        severity: 'critical',
        icon: 'ShieldAlert',
        status: 'fail',
        what: `${Math.round(adminFailRate * 100)}% das tentativas de login admin falharam (${m.firewallAuthFailures} falhas).`,
        why: 'Alta taxa de falhas indica tentativas de brute force ou credenciais vazadas.',
        bestPractice: [
          'Restringir acesso admin apenas a IPs internos ou VPN',
          'Nunca expor interface admin via WAN',
          'Implementar bloqueio temporário após N falhas',
          'Usar certificados ou chaves SSH ao invés de senhas'
        ],
        businessImpact: 'Comprometimento de conta admin resulta em controle total do firewall e possível desativação de proteções.',
        metrics: [
          { label: 'Taxa de Falha', value: `${Math.round(adminFailRate * 100)}%` },
          { label: 'Tentativas', value: totalAuth },
        ],
      });
    } else if (totalAuth > 0) {
      insights.push({
        id: 'admin-brute-force',
        title: 'Acesso Administrativo sem Anomalias',
        severity: 'low',
        icon: 'ShieldAlert',
        status: 'pass',
        what: `Taxa de falha de ${Math.round(adminFailRate * 100)}% em ${totalAuth} tentativas — dentro do esperado.`,
        why: 'O volume de falhas de autenticação administrativa está dentro dos parâmetros normais.',
        bestPractice: ['Manter monitoramento contínuo de acessos administrativos'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'Taxa de Falha', value: `${Math.round(adminFailRate * 100)}%` },
          { label: 'Tentativas', value: totalAuth },
        ],
      });
    }

    // Heurística 3: Botnet Detection
    if ((m.botnetDetections || 0) > 0) {
      insights.push({
        id: 'botnet-c2',
        title: 'Comunicação com Botnets Detectada',
        severity: 'critical',
        icon: 'Bug',
        status: 'fail',
        what: `${m.botnetDetections} tentativas de comunicação com servidores C&C de botnets conhecidos.`,
        why: 'Dispositivos internos podem estar comprometidos e sob controle remoto.',
        bestPractice: [
          'Ativar FortiGuard Botnet C&C Detection',
          'Implementar DNS Filtering para bloquear domínios maliciosos',
          'Segmentar rede (VLANs) para limitar propagação',
          'Realizar scan de malware em hosts internos'
        ],
        businessImpact: 'Dispositivos comprometidos podem ser usados para DDoS, mineração de criptomoedas ou exfiltração de dados.',
        metrics: [
          { label: 'Detecções', value: m.botnetDetections || 0 },
          { label: 'Domínios Únicos', value: m.botnetDomains?.length ?? 0 },
        ],
      });
    } else {
      insights.push({
        id: 'botnet-c2',
        title: 'Nenhuma Comunicação com Botnets',
        severity: 'low',
        icon: 'Bug',
        status: 'pass',
        what: 'Nenhuma comunicação com servidores C&C de botnets foi detectada neste período.',
        why: 'Não há evidências de dispositivos comprometidos se comunicando com botnets.',
        bestPractice: ['Manter FortiGuard Botnet C&C Detection ativo'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'Detecções', value: 0 },
        ],
      });
    }

    // Heurística 4: Port Scan
    const portScanIPs = (m.topBlockedIPs ?? []).filter(ip => ip.targetPorts.length > 10);
    if (portScanIPs.length > 0) {
      insights.push({
        id: 'port-scan-detected',
        title: 'Port Scans Detectados',
        severity: 'high',
        icon: 'Radar',
        status: 'fail',
        what: `${portScanIPs.length} IPs realizaram varredura em múltiplas portas (${portScanIPs[0].targetPorts.length} portas).`,
        why: 'Port scans são a fase de reconhecimento de ataques direcionados.',
        bestPractice: [
          'Configurar IDS/IPS para bloquear port scans',
          'Desabilitar serviços não utilizados em interfaces WAN',
          'Implementar rate limiting em firewalls de borda',
          'Monitorar logs de port scan para identificar padrões'
        ],
        businessImpact: 'Atacantes mapeiam serviços expostos para explorar vulnerabilidades conhecidas.',
        metrics: [
          { label: 'IPs Escaneando', value: portScanIPs.length },
          { label: 'Portas Testadas', value: portScanIPs[0].targetPorts.length },
        ],
      });
    } else {
      insights.push({
        id: 'port-scan-detected',
        title: 'Nenhum Port Scan Detectado',
        severity: 'low',
        icon: 'Radar',
        status: 'pass',
        what: 'Nenhuma varredura de portas significativa foi detectada neste período.',
        why: 'Não há evidências de reconhecimento ativo contra a infraestrutura.',
        bestPractice: ['Manter IDS/IPS ativo para detecção contínua'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'IPs Escaneando', value: 0 },
        ],
      });
    }

    // Heurística 5: Anomalias de Tráfego
    if ((m.anomalyEvents || 0) > 20) {
      insights.push({
        id: 'traffic-anomalies',
        title: 'Alto Volume de Anomalias de Tráfego',
        severity: 'medium',
        icon: 'Zap',
        status: 'fail',
        what: `${m.anomalyEvents} eventos anômalos detectados (DoS, DDoS, Port Scans).`,
        why: 'Anomalias indicam ataques de negação de serviço ou tentativas de exploração.',
        bestPractice: [
          'Ativar proteção DDoS em interfaces WAN',
          'Configurar rate limiting para prevenir flooding',
          'Implementar geoblocking para regiões de alto risco',
          'Monitorar padrões de tráfego em tempo real'
        ],
        businessImpact: 'Ataques DDoS podem causar indisponibilidade de serviços críticos e perda de receita.',
        metrics: [
          { label: 'Eventos Anômalos', value: m.anomalyEvents || 0 },
          { label: 'Tráfego Dropado', value: m.anomalyDropped || 0 },
        ],
      });
    } else {
      insights.push({
        id: 'traffic-anomalies',
        title: 'Tráfego sem Anomalias Significativas',
        severity: 'low',
        icon: 'Zap',
        status: 'pass',
        what: `Apenas ${m.anomalyEvents || 0} eventos anômalos detectados — dentro do esperado.`,
        why: 'O volume de anomalias de tráfego está dentro dos parâmetros normais.',
        bestPractice: ['Manter proteção DDoS ativa em interfaces WAN'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'Eventos Anômalos', value: m.anomalyEvents || 0 },
        ],
      });
    }

    // Heurística 6: Alta Taxa de Bloqueio
    const blockRate = (m.totalEvents || 0) > 0 ? (m.totalDenied || 0) / (m.totalEvents || 1) : 0;
    if (blockRate > 0.7 && (m.totalDenied || 0) > 1000) {
      insights.push({
        id: 'high-block-rate',
        title: 'Taxa de Bloqueio Elevada',
        severity: 'medium',
        icon: 'Shield',
        status: 'fail',
        what: `${Math.round(blockRate * 100)}% de todo o tráfego está sendo bloqueado (${m.totalDenied} eventos).`,
        why: 'Taxa muito alta pode indicar políticas restritivas demais ou ataques massivos.',
        bestPractice: [
          'Revisar políticas de firewall para verificar falsos positivos',
          'Analisar logs para identificar origens legítimas bloqueadas',
          'Ajustar regras para balancear segurança e usabilidade',
          'Considerar whitelist para serviços conhecidos'
        ],
        businessImpact: 'Bloqueios excessivos podem impactar operações legítimas e produtividade dos usuários.',
        metrics: [
          { label: 'Taxa de Bloqueio', value: `${Math.round(blockRate * 100)}%` },
          { label: 'Total Bloqueado', value: m.totalDenied || 0 },
        ],
      });
    } else if ((m.totalEvents || 0) > 0) {
      insights.push({
        id: 'high-block-rate',
        title: 'Taxa de Bloqueio Normal',
        severity: 'low',
        icon: 'Shield',
        status: 'pass',
        what: `${Math.round(blockRate * 100)}% do tráfego está sendo bloqueado — dentro do esperado.`,
        why: 'A taxa de bloqueio está em níveis saudáveis, indicando políticas bem calibradas.',
        bestPractice: ['Revisar políticas periodicamente para manter equilíbrio'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'Taxa de Bloqueio', value: `${Math.round(blockRate * 100)}%` },
          { label: 'Total Bloqueado', value: m.totalDenied || 0 },
        ],
      });
    }

    // Heurística 7: Sessões Persistentes
    if ((m.activeSessions || 0) > 1000) {
      insights.push({
        id: 'persistent-sessions',
        title: 'Alto Número de Sessões Persistentes',
        severity: 'low',
        icon: 'Users',
        status: 'fail',
        what: `${m.activeSessions} sessões ativas simultâneas no firewall.`,
        why: 'Sessões longas podem indicar conexões zombie ou falta de timeout adequado.',
        bestPractice: [
          'Configurar timeout de sessão adequado para cada tipo de tráfego',
          'Implementar políticas de reconexão automática',
          'Monitorar sessões órfãs e limpá-las periodicamente',
          'Limitar número máximo de sessões por usuário/IP'
        ],
        businessImpact: 'Sessões órfãs consomem recursos do firewall e podem degradar performance.',
        metrics: [
          { label: 'Sessões Ativas', value: m.activeSessions || 0 },
        ],
      });
    } else if ((m.activeSessions || 0) > 0) {
      insights.push({
        id: 'persistent-sessions',
        title: 'Sessões Ativas em Níveis Normais',
        severity: 'low',
        icon: 'Users',
        status: 'pass',
        what: `${m.activeSessions} sessões ativas — dentro dos parâmetros normais.`,
        why: 'O número de sessões ativas está em níveis saudáveis.',
        bestPractice: ['Manter monitoramento contínuo de sessões ativas'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'Sessões Ativas', value: m.activeSessions || 0 },
        ],
      });
    }

    // Heurística 8: Tráfego Saída Bloqueado
    if ((m.outboundBlocked || 0) > 100) {
      insights.push({
        id: 'outbound-blocked',
        title: 'Alto Volume de Tráfego de Saída Bloqueado',
        severity: 'medium',
        icon: 'ArrowUpRight',
        status: 'fail',
        what: `${m.outboundBlocked} conexões de saída foram bloqueadas.`,
        why: 'Tráfego de saída bloqueado pode indicar malware tentando se comunicar com servidores externos.',
        bestPractice: [
          'Implementar políticas de egress filtering rigorosas',
          'Categorizar destinos externos (Web Filter)',
          'Monitorar tentativas de conexão a IPs/domínios suspeitos',
          'Realizar varredura de malware em hosts internos'
        ],
        businessImpact: 'Malware não detectado pode exfiltrar dados sensíveis ou causar ransomware.',
        metrics: [
          { label: 'Conexões Bloqueadas', value: m.outboundBlocked || 0 },
          { label: 'IPs Únicos', value: m.topOutboundBlockedIPs?.length ?? 0 },
        ],
      });
    } else {
      insights.push({
        id: 'outbound-blocked',
        title: 'Tráfego de Saída sem Bloqueios Anômalos',
        severity: 'low',
        icon: 'ArrowUpRight',
        status: 'pass',
        what: `Apenas ${m.outboundBlocked || 0} conexões de saída bloqueadas — dentro do esperado.`,
        why: 'O volume de tráfego de saída bloqueado está em níveis normais.',
        bestPractice: ['Manter políticas de egress filtering ativas'],
        businessImpact: 'Nenhum risco identificado no momento.',
        metrics: [
          { label: 'Conexões Bloqueadas', value: m.outboundBlocked || 0 },
        ],
      });
    }

    return insights;
  }, [snapshot]);
}
