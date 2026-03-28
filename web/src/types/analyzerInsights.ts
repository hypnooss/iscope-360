// Analyzer - Firewall Security Intelligence Types

export type AnalyzerSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type AnalyzerCategory =
  | 'denied_traffic'
  | 'authentication'
  | 'ips_ids'
  | 'dns_security'
  | 'config_changes'
  | 'traffic_behavior'
  | 'lateral_movement'
  | 'persistent_sessions'
  | 'geolocation'
  | 'ioc_correlation'
  | 'anomaly';

export interface AnalyzerInsight {
  id: string;
  category: AnalyzerCategory;
  name: string;
  description: string;
  severity: AnalyzerSeverity;
  details?: string;
  sourceIPs?: string[];
  targetPorts?: number[];
  affectedUsers?: string[];
  count?: number;
  timeWindow?: string;
  recommendation?: string;
}

export interface AnalyzerSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface TopBlockedIP {
  ip: string;
  country?: string;
  count: number;
  targetPorts: number[];
}

export interface TopCountry {
  country: string;
  code?: string;
  count: number;
}

export interface TopCategory {
  category: string;
  count: number;
}

export interface TopUserIP {
  user: string;
  ip?: string;
  count: number;
}

export interface ConfigChangeDetail {
  user: string;
  action: string;
  cfgpath: string;
  cfgobj: string;
  cfgattr: string;
  msg: string;
  date: string;
  category: string;
  severity: string;
}

export interface AnalyzerMetrics {
  topBlockedIPs: TopBlockedIP[];
  topCountries: TopCountry[];
  vpnFailures: number;
  firewallAuthFailures: number;
  firewallAuthSuccesses: number;
  vpnSuccesses: number;
  topAuthIPs: TopBlockedIP[];
  topAuthCountries: TopCountry[];
  topAuthIPsSuccess: TopBlockedIP[];
  topAuthIPsFailed: TopBlockedIP[];
  topAuthCountriesSuccess: TopCountry[];
  topAuthCountriesFailed: TopCountry[];
  // Separated FW auth rankings
  topFwAuthIPsFailed: TopBlockedIP[];
  topFwAuthIPsSuccess: TopBlockedIP[];
  topFwAuthCountriesFailed: TopCountry[];
  topFwAuthCountriesSuccess: TopCountry[];
  // Separated VPN auth rankings
  topVpnAuthIPsFailed: TopBlockedIP[];
  topVpnAuthIPsSuccess: TopBlockedIP[];
  topVpnAuthCountriesFailed: TopCountry[];
  topVpnAuthCountriesSuccess: TopCountry[];
  // VPN user rankings
  topVpnUsersFailed: TopUserIP[];
  topVpnUsersSuccess: TopUserIP[];
  // Outbound connections (allowed)
  topOutboundIPs: TopBlockedIP[];
  topOutboundCountries: TopCountry[];
  topOutboundSourceIPs?: TopBlockedIP[];
  outboundConnections: number;
  // Outbound connections (blocked)
  topOutboundBlockedIPs: TopBlockedIP[];
  topOutboundBlockedCountries: TopCountry[];
  topOutboundBlockedSourceIPs?: TopBlockedIP[];
  outboundBlocked: number;
  ipsEvents: number;
  configChanges: number;
  configChangeDetails: ConfigChangeDetail[];
  totalDenied: number;
  totalEvents: number;
  topWebFilterCategories: TopCategory[];
  topWebFilterUsers: TopUserIP[];
  topAppControlApps: TopCategory[];
  topAppControlUsers: TopUserIP[];
  webFilterBlocked: number;
  appControlBlocked: number;
  anomalyEvents: number;
  anomalyDropped: number;
  topAnomalySources: TopBlockedIP[];
  topAnomalyTypes: TopCategory[];
  // IPS metrics
  topIpsAttackTypes: TopCategory[];
  topIpsSrcIPs: TopBlockedIP[];
  topIpsSrcCountries: TopCountry[];
  topIpsDstIPs: TopBlockedIP[];
  // Inbound traffic (blocked)
  topInboundBlockedIPs: TopBlockedIP[];
  topInboundBlockedCountries: TopCountry[];
  topInboundBlockedDestIPs?: TopBlockedIP[];
  inboundBlocked: number;
  // Inbound traffic (allowed)
  topInboundAllowedIPs: TopBlockedIP[];
  topInboundAllowedCountries: TopCountry[];
  topInboundAllowedDestIPs?: TopBlockedIP[];
  inboundAllowed: number;
  // Fase 2: Active Sessions
  activeSessions: number;
  // Fase 2: Interface Bandwidth
  interfaceBandwidth: InterfaceBandwidth[];
  // Fase 2: Botnet
  botnetDetections: number;
  botnetDomains: BotnetDomain[];
}

export interface InterfaceBandwidth {
  name: string;
  tx_bytes: number;
  rx_bytes: number;
  tx_rate: number;
  rx_rate: number;
}

export interface BotnetDomain {
  domain: string;
  count: number;
}

export type AnalyzerEventCategory =
  | 'inbound_traffic'
  | 'outbound_traffic'
  | 'fw_authentication'
  | 'vpn_authentication'
  | 'ips_events'
  | 'config_changes'
  | 'web_filter'
  | 'app_control'
  | 'anomalies'
  | 'botnet';

export interface AnalyzerCategoryInfo {
  key: AnalyzerEventCategory;
  label: string;
  icon: string;
  colorHex: string;
  description: string;
}

export const ANALYZER_CATEGORY_INFO: Record<AnalyzerEventCategory, AnalyzerCategoryInfo> = {
  inbound_traffic: {
    key: 'inbound_traffic',
    label: 'Tráfego de Entrada',
    icon: 'arrow-down-to-line',
    colorHex: '#ef4444',
    description: 'Tráfego externo tentando acessar o firewall',
  },
  outbound_traffic: {
    key: 'outbound_traffic',
    label: 'Tráfego de Saída',
    icon: 'arrow-up-from-line',
    colorHex: '#f97316',
    description: 'Tráfego interno acessando recursos externos',
  },
  fw_authentication: {
    key: 'fw_authentication',
    label: 'Autenticação Firewall',
    icon: 'lock',
    colorHex: '#f97316',
    description: 'Tentativas de autenticação administrativa no firewall',
  },
  vpn_authentication: {
    key: 'vpn_authentication',
    label: 'Autenticação VPN',
    icon: 'wifi',
    colorHex: '#f59e0b',
    description: 'Tentativas de conexão VPN',
  },
  ips_events: {
    key: 'ips_events',
    label: 'Eventos IPS',
    icon: 'alert-triangle',
    colorHex: '#f43f5e',
    description: 'Eventos detectados pelo sistema de prevenção de intrusão',
  },
  config_changes: {
    key: 'config_changes',
    label: 'Alterações de Config',
    icon: 'server',
    colorHex: '#a855f7',
    description: 'Mudanças na configuração do dispositivo',
  },
  web_filter: {
    key: 'web_filter',
    label: 'Filtragem Web',
    icon: 'filter',
    colorHex: '#3b82f6',
    description: 'Sites bloqueados por políticas de web filtering',
  },
  app_control: {
    key: 'app_control',
    label: 'Controle de Apps',
    icon: 'app-window',
    colorHex: '#06b6d4',
    description: 'Aplicações bloqueadas por políticas de controle',
  },
  anomalies: {
    key: 'anomalies',
    label: 'Anomalias',
    icon: 'zap',
    colorHex: '#eab308',
    description: 'Padrões anômalos de tráfego (DoS, DDoS, Port Scans)',
  },
  botnet: {
    key: 'botnet',
    label: 'Detecções Botnet',
    icon: 'bug',
    colorHex: '#dc2626',
    description: 'Comunicações com C&C de botnets conhecidos',
  },
};

export interface AnalyzerSnapshot {
  id: string;
  firewall_id: string;
  client_id: string;
  agent_task_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  period_start?: string;
  period_end?: string;
  score?: number;
  summary: AnalyzerSummary;
  insights: AnalyzerInsight[];
  metrics: AnalyzerMetrics;
  created_at: string;
}
