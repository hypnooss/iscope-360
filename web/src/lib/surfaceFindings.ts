/**
 * Surface Findings Engine
 * Transforms raw attack surface data into interpreted, actionable findings
 * with Technical Risk, Business Impact, and Recommendations.
 */

import type { AttackSurfaceCVE } from '@/hooks/useAttackSurfaceData';

// ─── Types ──────────────────────────────────────────────────

export type SurfaceFindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type SurfaceFindingStatus = 'fail' | 'warning' | 'pass';

export type SurfaceFindingCategory =
  | 'risky_services'
  | 'web_security'
  | 'vulnerabilities'
  | 'tls_certificates'
  | 'obsolete_tech'
  | 'leaked_credentials'
  | 'crypto_weaknesses';

export interface AffectedAsset {
  hostname: string;
  ip: string;
}

export interface SurfaceFindingEvidence {
  label: string;
  value: string;
}

export interface SurfaceFinding {
  id: string;
  name: string;
  status: SurfaceFindingStatus;
  severity: SurfaceFindingSeverity;
  category: SurfaceFindingCategory;
  description: string;
  technicalRisk: string;
  businessImpact: string;
  recommendation: string;
  affectedAssets: AffectedAsset[];
  evidence: SurfaceFindingEvidence[];
}

export interface SurfaceFindingCategoryInfo {
  key: SurfaceFindingCategory;
  label: string;
  icon: string;
  color: string;
  colorHex: string;
  description: string;
}

export const CATEGORY_INFO: Record<SurfaceFindingCategory, SurfaceFindingCategoryInfo> = {
  risky_services: {
    key: 'risky_services',
    label: 'Serviços de Risco',
    icon: 'shield-alert',
    color: 'red-500',
    colorHex: '#ef4444',
    description: 'Portas e serviços perigosos expostos na internet',
  },
  web_security: {
    key: 'web_security',
    label: 'Segurança Web',
    icon: 'globe',
    color: 'orange-500',
    colorHex: '#f97316',
    description: 'Problemas de segurança em serviços web expostos',
  },
  vulnerabilities: {
    key: 'vulnerabilities',
    label: 'Vulnerabilidades',
    icon: 'bug',
    color: 'rose-500',
    colorHex: '#f43f5e',
    description: 'CVEs conhecidas detectadas nos ativos',
  },
  tls_certificates: {
    key: 'tls_certificates',
    label: 'Certificados TLS',
    icon: 'lock',
    color: 'amber-500',
    colorHex: '#f59e0b',
    description: 'Problemas com certificados digitais',
  },
  obsolete_tech: {
    key: 'obsolete_tech',
    label: 'Tecnologias Obsoletas',
    icon: 'clock',
    color: 'purple-500',
    colorHex: '#a855f7',
    description: 'Software desatualizado ou sem suporte detectado',
  },
  leaked_credentials: {
    key: 'leaked_credentials',
    label: 'Credenciais Vazadas',
    icon: 'key-round',
    color: 'sky-500',
    colorHex: '#0ea5e9',
    description: 'Credenciais encontradas em vazamentos de dados',
  },
  crypto_weaknesses: {
    key: 'crypto_weaknesses',
    label: 'Criptografia',
    icon: 'lock',
    color: 'cyan-500',
    colorHex: '#06b6d4',
    description: 'Configurações criptográficas fracas ou obsoletas',
  },
};

export const SEVERITY_ORDER: SurfaceFindingSeverity[] = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_LABELS: Record<SurfaceFindingSeverity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
};

// ─── Detection Maps ─────────────────────────────────────────

interface RiskyServiceRule {
  ports: number[];
  serviceNames: string[];
  severity: SurfaceFindingSeverity;
  nameTemplate: string;
  technicalRisk: string;
  businessImpact: string;
  recommendation: string;
}

const RISKY_SERVICES: RiskyServiceRule[] = [
  {
    ports: [3389],
    serviceNames: ['ms-wbt-server', 'rdp', 'remote desktop'],
    severity: 'critical',
    nameTemplate: 'RDP exposto na internet',
    technicalRisk: 'O Remote Desktop Protocol é um dos vetores mais explorados para ataques de ransomware. Permite brute-force de credenciais, exploração de vulnerabilidades como BlueKeep (CVE-2019-0708) e lateral movement na rede interna.',
    businessImpact: 'Acesso remoto não autorizado pode resultar em controle total do servidor, instalação de ransomware, exfiltração de dados sensíveis e comprometimento de toda a infraestrutura conectada.',
    recommendation: 'Restringir acesso via VPN ou desabilitar o serviço se não for necessário. Implementar NLA (Network Level Authentication) e MFA.',
  },
  {
    ports: [445, 139],
    serviceNames: ['microsoft-ds', 'smb', 'netbios-ssn', 'samba'],
    severity: 'critical',
    nameTemplate: 'SMB exposto na internet',
    technicalRisk: 'O protocolo SMB exposto permite exploração de vulnerabilidades como EternalBlue (MS17-010), lateral movement e enumeração de compartilhamentos. É o principal vetor de propagação de worms e ransomware.',
    businessImpact: 'Acesso não autorizado a arquivos compartilhados, propagação de malware pela rede, roubo de credenciais e potencial comprometimento em cascata de todos os sistemas conectados.',
    recommendation: 'Bloquear portas 445/139 no firewall de borda. SMB nunca deve ser acessível pela internet.',
  },
  {
    ports: [23],
    serviceNames: ['telnet'],
    severity: 'critical',
    nameTemplate: 'Telnet exposto na internet',
    technicalRisk: 'Telnet transmite credenciais e dados em texto claro (sem criptografia). Permite interceptação de sessões administrativas e é alvo frequente de botnets IoT.',
    businessImpact: 'Interceptação de credenciais administrativas, acesso não autorizado a equipamentos de rede e potencial inclusão do dispositivo em botnets.',
    recommendation: 'Substituir Telnet por SSH (porta 22) e bloquear a porta 23 no firewall.',
  },
  {
    ports: [21],
    serviceNames: ['ftp'],
    severity: 'high',
    nameTemplate: 'FTP exposto na internet',
    technicalRisk: 'FTP transmite credenciais em texto claro e pode permitir acesso anônimo. Versões antigas possuem vulnerabilidades conhecidas de buffer overflow e directory traversal.',
    businessImpact: 'Exfiltração de dados, upload de malware, acesso a arquivos sensíveis e possível uso como ponto de entrada para a rede interna.',
    recommendation: 'Substituir por SFTP ou FTPS. Se necessário manter FTP, desabilitar acesso anônimo e restringir por IP.',
  },
  {
    ports: [1433],
    serviceNames: ['ms-sql-s', 'mssql', 'sql server'],
    severity: 'critical',
    nameTemplate: 'SQL Server exposto na internet',
    technicalRisk: 'Banco de dados acessível diretamente pela internet permite ataques de brute-force, injeção SQL e execução de comandos via xp_cmdshell.',
    businessImpact: 'Vazamento da base de dados inteira, incluindo dados pessoais, financeiros e credenciais. Pode resultar em multas regulatórias (LGPD) e danos reputacionais.',
    recommendation: 'Remover acesso direto pela internet. Utilizar VPN ou tunnel seguro para acesso remoto ao banco de dados.',
  },
  {
    ports: [3306],
    serviceNames: ['mysql', 'mariadb'],
    severity: 'critical',
    nameTemplate: 'MySQL/MariaDB exposto na internet',
    technicalRisk: 'Banco de dados acessível diretamente pela internet permite ataques de brute-force e exploração de vulnerabilidades de autenticação.',
    businessImpact: 'Vazamento completo dos dados armazenados, incluindo informações pessoais de clientes, transações financeiras e dados proprietários.',
    recommendation: 'Restringir acesso ao banco de dados apenas via rede interna ou VPN. Nunca expor diretamente na internet.',
  },
  {
    ports: [5432],
    serviceNames: ['postgresql', 'postgres'],
    severity: 'critical',
    nameTemplate: 'PostgreSQL exposto na internet',
    technicalRisk: 'Banco de dados acessível diretamente pela internet. PostgreSQL pode permitir execução de comandos do sistema operacional através de funções de extensão.',
    businessImpact: 'Acesso direto aos dados da aplicação, possível execução remota de código no servidor e comprometimento total do ambiente.',
    recommendation: 'Restringir acesso ao banco de dados apenas via rede interna ou VPN.',
  },
  {
    ports: [6379],
    serviceNames: ['redis'],
    severity: 'critical',
    nameTemplate: 'Redis exposto na internet',
    technicalRisk: 'Redis por padrão não possui autenticação. Permite leitura/escrita de dados e pode ser explorado para execução remota de comandos através de manipulação de arquivos.',
    businessImpact: 'Exposição de dados de sessão, cache e filas. Possível execução de comandos no servidor, levando a comprometimento total.',
    recommendation: 'Nunca expor Redis na internet. Configurar autenticação (requirepass) e restringir bind address.',
  },
  {
    ports: [27017, 27018],
    serviceNames: ['mongodb', 'mongo'],
    severity: 'critical',
    nameTemplate: 'MongoDB exposto na internet',
    technicalRisk: 'MongoDB historicamente é implantado sem autenticação. Permite acesso total aos dados e já foi alvo de ataques massivos de ransomware em bancos expostos.',
    businessImpact: 'Exposição total dos dados armazenados. Ataques de ransomware em MongoDB expostos são comuns e já afetaram milhares de organizações.',
    recommendation: 'Habilitar autenticação, restringir bindIP e nunca expor diretamente na internet.',
  },
  {
    ports: [5900, 5901, 5902],
    serviceNames: ['vnc'],
    severity: 'high',
    nameTemplate: 'VNC exposto na internet',
    technicalRisk: 'VNC frequentemente utiliza autenticação fraca (senha de até 8 caracteres). Versões antigas não utilizam criptografia, expondo a sessão visual completa.',
    businessImpact: 'Controle visual e interativo remoto do servidor/desktop, permitindo ao atacante operar o sistema como se estivesse fisicamente presente.',
    recommendation: 'Restringir acesso via VPN. Utilizar VNC com túnel SSH ou substituir por soluções mais seguras.',
  },
  {
    ports: [161],
    serviceNames: ['snmp'],
    severity: 'medium',
    nameTemplate: 'SNMP exposto na internet',
    technicalRisk: 'SNMP v1/v2c utiliza community strings em texto claro (frequentemente "public" e "private"). Permite enumeração completa da infraestrutura de rede.',
    businessImpact: 'Enumeração de topologia de rede, interfaces, rotas e configurações. Informações podem ser utilizadas para planejar ataques direcionados.',
    recommendation: 'Bloquear SNMP no firewall de borda. Se necessário, migrar para SNMPv3 com autenticação e criptografia.',
  },
  {
    ports: [11211],
    serviceNames: ['memcached', 'memcache'],
    severity: 'high',
    nameTemplate: 'Memcached exposto na internet',
    technicalRisk: 'Memcached sem autenticação permite leitura de dados em cache e pode ser usado como amplificador em ataques DDoS (amplificação de até 51.000x).',
    businessImpact: 'Vazamento de dados em cache (sessões, tokens), uso do servidor como amplificador DDoS contra terceiros.',
    recommendation: 'Desabilitar acesso UDP, restringir bind address e bloquear no firewall de borda.',
  },
  {
    ports: [9200, 9300],
    serviceNames: ['elasticsearch'],
    severity: 'critical',
    nameTemplate: 'Elasticsearch exposto na internet',
    technicalRisk: 'Elasticsearch por padrão não possui autenticação. Permite leitura, modificação e exclusão de todos os índices de dados.',
    businessImpact: 'Exposição massiva de dados indexados (logs, métricas, dados de aplicação). Ataques de ransomware em instâncias Elasticsearch são frequentes.',
    recommendation: 'Habilitar X-Pack Security, configurar autenticação e restringir acesso à rede interna.',
  },
];

interface ObsoleteTechRule {
  pattern: RegExp;
  severity: SurfaceFindingSeverity;
  name: string;
  eolInfo: string;
  technicalRisk: string;
  businessImpact: string;
  recommendation: string;
}

const OBSOLETE_TECH_RULES: ObsoleteTechRule[] = [
  {
    pattern: /php[\/:]?(7\.[0-4]|5\.\d|4\.\d)/i,
    severity: 'high',
    name: 'PHP desatualizado detectado',
    eolInfo: 'PHP 7.4 atingiu EOL em Nov/2022, PHP 8.0 em Nov/2023',
    technicalRisk: 'Versões sem suporte não recebem patches de segurança. Vulnerabilidades conhecidas permanecem exploráveis indefinidamente.',
    businessImpact: 'Aplicações web ficam vulneráveis a exploits públicos, podendo resultar em comprometimento do servidor e vazamento de dados.',
    recommendation: 'Atualizar para PHP 8.2+ ou superior. Planejar migração imediata para versão com suporte ativo.',
  },
  {
    pattern: /apache[\/:]?(2\.4\.([0-4]\d|5[0-7])|2\.[0-3]\.|1\.)/i,
    severity: 'medium',
    name: 'Apache HTTP Server desatualizado',
    eolInfo: 'Versões anteriores a 2.4.58 possuem CVEs conhecidas',
    technicalRisk: 'Versões antigas do Apache possuem vulnerabilidades de request smuggling, path traversal e HTTP/2 DoS.',
    businessImpact: 'Servidor web comprometido pode resultar em defacement, distribuição de malware e acesso à rede interna.',
    recommendation: 'Atualizar para a versão mais recente do Apache 2.4.x.',
  },
  {
    pattern: /openssh[\/:]?([0-7]\.\d|8\.[0-9]($|\.))/i,
    severity: 'medium',
    name: 'OpenSSH desatualizado detectado',
    eolInfo: 'Versões anteriores a 9.0 possuem vulnerabilidades conhecidas',
    technicalRisk: 'Versões antigas do OpenSSH podem ser vulneráveis a ataques de enumeração de usuários, key exchange flaws e regressões de segurança (regreSSHion).',
    businessImpact: 'Comprometimento do acesso SSH permite controle total do servidor e lateral movement na rede.',
    recommendation: 'Atualizar para OpenSSH 9.x ou superior.',
  },
  {
    pattern: /nginx[\/:]?(1\.(2[0-3]|1\d|0\d|\d)($|\.))/i,
    severity: 'medium',
    name: 'Nginx desatualizado detectado',
    eolInfo: 'Versões anteriores a 1.24 não recebem mais correções',
    technicalRisk: 'Versões antigas do Nginx possuem vulnerabilidades de HTTP/2 DoS, request smuggling e buffer overflow.',
    businessImpact: 'Servidor web comprometido pode afetar todas as aplicações servidas, impactando disponibilidade e integridade.',
    recommendation: 'Atualizar para Nginx 1.24+ ou versão mainline mais recente.',
  },
  {
    pattern: /windows\s*server\s*20(03|08|12)/i,
    severity: 'critical',
    name: 'Windows Server obsoleto detectado',
    eolInfo: 'Windows Server 2012/2012 R2 atingiu EOL em Out/2023',
    technicalRisk: 'Sistema operacional sem suporte não recebe patches de segurança. Vulnerabilidades como EternalBlue afetam versões antigas permanentemente.',
    businessImpact: 'Servidor completamente vulnerável a exploits públicos. Pode servir como ponto de entrada para comprometimento de toda a rede.',
    recommendation: 'Migrar para Windows Server 2022 ou superior. Se impossível, isolar o servidor da internet imediatamente.',
  },
  {
    pattern: /iis[\/:]?(6\.|7\.[05]|8\.0)/i,
    severity: 'high',
    name: 'IIS desatualizado detectado',
    eolInfo: 'IIS 6.0-8.0 associados a Windows Server obsoletos',
    technicalRisk: 'Versões antigas do IIS possuem vulnerabilidades de execução remota de código, buffer overflow e WebDAV exploits.',
    businessImpact: 'Comprometimento do servidor web e de todas as aplicações hospedadas nele.',
    recommendation: 'Atualizar o Windows Server para versão com suporte, que inclui IIS atualizado.',
  },
  {
    pattern: /react[\/:\s]?(15\.|16\.|17\.)/i,
    severity: 'high',
    name: 'React desatualizado detectado',
    eolInfo: 'React 15/16/17 possuem vulnerabilidades conhecidas incluindo React2Shell (CVE-2025-29927)',
    technicalRisk: 'Versões antigas do React e Next.js podem permitir Server-Side Request Forgery e execução remota via middleware header poisoning (React2Shell).',
    businessImpact: 'Aplicação web vulnerável a ataques que podem resultar em bypass de autenticação, acesso não autorizado ao servidor e exfiltração de dados.',
    recommendation: 'Atualizar para React 18+ e Next.js 15+ (se aplicável). Verificar se o middleware de autenticação valida o header x-middleware-subrequest.',
  },
  {
    pattern: /next[.\/-]?js[\/:\s]?(9\.|10\.|11\.|12\.|13\.|14\.)/i,
    severity: 'high',
    name: 'Next.js desatualizado detectado',
    eolInfo: 'Next.js < 15 é vulnerável a React2Shell (CVE-2025-29927)',
    technicalRisk: 'Versões do Next.js anteriores à 15.x possuem uma vulnerabilidade crítica no middleware que permite bypass de autenticação via header x-middleware-subrequest.',
    businessImpact: 'Atacantes podem contornar toda a camada de autenticação e autorização da aplicação, acessando rotas e dados protegidos.',
    recommendation: 'Atualizar para Next.js 15.2.3+ ou aplicar o patch de segurança oficial. Bloquear o header x-middleware-subrequest no WAF/reverse proxy.',
  },
];

const ADMIN_PANEL_PATTERNS = [
  /\b(admin|administrator|login|signin|wp-admin|wp-login|phpmyadmin|adminer|webmin|cpanel|plesk|grafana|kibana|jenkins|gitlab|portainer)\b/i,
];

// ─── NSE Script Parsers ─────────────────────────────────────

const IMPORTANT_SECURITY_HEADERS = [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Content-Security-Policy',
];

const DANGEROUS_HTTP_METHODS = ['PUT', 'DELETE', 'TRACE', 'CONNECT'];

const WEAK_SSH_ALGOS = [
  'diffie-hellman-group1-sha1',
  'diffie-hellman-group14-sha1',
  '3des-cbc',
  'arcfour', 'arcfour128', 'arcfour256',
  'hmac-md5', 'hmac-md5-96',
  'hmac-sha1-96',
  'blowfish-cbc', 'cast128-cbc',
  'aes128-cbc', 'aes192-cbc', 'aes256-cbc',
];

const OBSOLETE_TLS_VERSIONS = ['TLSv1.0', 'TLSv1.1', 'SSLv2', 'SSLv3'];

function parseSecurityHeaders(raw: string): { missing: string[]; present: string[] } {
  const missing: string[] = [];
  const present: string[] = [];
  const lower = raw.toLowerCase();

  for (const header of IMPORTANT_SECURITY_HEADERS) {
    const key = header.toLowerCase().replace(/-/g, '[_-]');
    const re = new RegExp(key, 'i');
    if (re.test(raw)) {
      if (lower.includes('not configured') && lower.indexOf(header.toLowerCase().replace(/-/g, '_')) < lower.indexOf('not configured')) {
        // Check if this specific header is "not configured"
        const headerIdx = lower.indexOf(header.toLowerCase().replace(/-/g, '_'));
        const nextNewline = lower.indexOf('\n', headerIdx);
        const segment = lower.slice(headerIdx, nextNewline > -1 ? nextNewline : undefined);
        if (segment.includes('not configured')) {
          missing.push(header);
        } else {
          present.push(header);
        }
      } else {
        present.push(header);
      }
    } else {
      missing.push(header);
    }
  }

  // Simpler fallback: HSTS detection via explicit "HSTS not configured" string
  if (lower.includes('hsts not configured') && !missing.includes('Strict-Transport-Security')) {
    missing.push('Strict-Transport-Security');
    const idx = present.indexOf('Strict-Transport-Security');
    if (idx > -1) present.splice(idx, 1);
  }

  return { missing, present };
}

function parseDangerousMethods(raw: string): string[] {
  const match = raw.match(/Supported Methods:\s*(.+)/i);
  if (!match) return [];
  const methods = match[1].trim().split(/\s+/);
  return methods.filter(m => DANGEROUS_HTTP_METHODS.includes(m.toUpperCase())).map(m => m.toUpperCase());
}

function parseSslEnumCiphers(raw: string): {
  obsoleteVersions: string[];
  weakCiphers: string[];
  hasCBC: boolean;
  hasNoForwardSecrecy: boolean;
  leastStrength: string | null;
} {
  const obsoleteVersions: string[] = [];
  const weakCiphers: string[] = [];
  let hasCBC = false;
  let hasNoForwardSecrecy = false;
  let leastStrength: string | null = null;

  for (const ver of OBSOLETE_TLS_VERSIONS) {
    if (raw.includes(ver)) obsoleteVersions.push(ver);
  }

  // Detect CBC ciphers
  const cbcMatch = raw.match(/[A-Z0-9_]+_CBC[A-Z0-9_]*/g);
  if (cbcMatch) {
    hasCBC = true;
    weakCiphers.push(...cbcMatch.slice(0, 5));
  }

  // Detect RSA key exchange (no forward secrecy)
  if (/TLS_RSA_WITH_/i.test(raw)) {
    hasNoForwardSecrecy = true;
  }

  // Extract least strength rating
  const strengthMatch = raw.match(/least strength:\s*([A-F])/i);
  if (strengthMatch) leastStrength = strengthMatch[1].toUpperCase();

  return { obsoleteVersions, weakCiphers, hasCBC, hasNoForwardSecrecy, leastStrength };
}

function parseWeakSshAlgos(raw: string): string[] {
  const found: string[] = [];
  for (const algo of WEAK_SSH_ALGOS) {
    if (raw.includes(algo)) found.push(algo);
  }
  return found;
}

function parseVulners(raw: string): Array<{ cve_id: string; score: number; url?: string }> {
  const results: Array<{ cve_id: string; score: number; url?: string }> = [];
  const seen = new Set<string>();
  const lines = raw.split('\n');
  for (const line of lines) {
    const match = line.match(/(CVE-\d{4}-\d+)\s+(\d+\.?\d*)/i);
    if (match) {
      const cve_id = match[1].toUpperCase();
      if (seen.has(cve_id)) continue;
      seen.add(cve_id);
      const score = parseFloat(match[2]);
      const urlMatch = line.match(/(https?:\/\/\S+)/);
      results.push({ cve_id, score, url: urlMatch?.[1] });
    }
  }
  return results;
}

// ─── Asset type (simplified for the engine) ─────────────────

export interface FindingsAsset {
  hostname: string;
  ip: string;
  ports: number[];
  services: Array<{
    port: number;
    transport: string;
    name?: string;
    product?: string;
    version?: string;
    scripts?: Record<string, string>;
  }>;
  webServices: Array<{
    url: string;
    status_code: number;
    server?: string;
    title?: string;
    technologies?: string[];
    tls?: { subject_cn?: string; issuer?: string | string[]; not_after?: string };
    headers?: Record<string, string>;
  }>;
  tlsCerts: Array<{
    subject_cn: string;
    issuer: string;
    not_after: string | null;
    daysRemaining: number | null;
  }>;
  cves: AttackSurfaceCVE[];
  allTechs: string[];
}

// ─── Findings Generator ─────────────────────────────────────

export function generateFindings(assets: FindingsAsset[]): SurfaceFinding[] {
  const findings: SurfaceFinding[] = [];
  let idCounter = 0;

  // DEBUG: log assets tech info for diagnosing missing findings
  console.log('[generateFindings] assets count:', assets.length);
  for (const a of assets) {
    const nextReact = a.allTechs.filter(t => /next|react/i.test(t));
    if (nextReact.length > 0) {
      console.log(`[generateFindings] ${a.ip} (${a.hostname}) techs:`, nextReact);
    }
  }
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  // ── 1. Risky Services ─────────────────────────────────────
  for (const rule of RISKY_SERVICES) {
    const affected: AffectedAsset[] = [];
    const evidenceMap = new Map<string, SurfaceFindingEvidence[]>();
    const detectedPorts = new Set<number>();

    for (const asset of assets) {
      let matched = false;
      const assetEvidence: SurfaceFindingEvidence[] = [];

      // Check by port
      for (const port of asset.ports) {
        if (rule.ports.includes(port)) {
          matched = true;
          detectedPorts.add(port);
          const svc = asset.services.find(s => s.port === port);
          assetEvidence.push({
            label: 'Porta/Serviço',
            value: `${port}/${svc?.transport || 'tcp'} — ${svc?.product || svc?.name || 'detectado'}${svc?.version ? ` ${svc.version}` : ''}`,
          });
        }
      }

      // Check by service name (any port)
      if (!matched) {
        for (const svc of asset.services) {
          const svcName = (svc.product || svc.name || '').toLowerCase();
          if (rule.serviceNames.some(rn => svcName.includes(rn))) {
            matched = true;
            detectedPorts.add(svc.port);
            assetEvidence.push({
              label: 'Serviço',
              value: `${svc.port}/${svc.transport} — ${svc.product || svc.name}${svc.version ? ` ${svc.version}` : ''}`,
            });
          }
        }
      }

      if (matched) {
        affected.push({ hostname: asset.hostname, ip: asset.ip });
        evidenceMap.set(asset.ip, assetEvidence);
      }
    }

    if (affected.length > 0) {
      const allEvidence: SurfaceFindingEvidence[] = [];
      for (const [ip, evs] of evidenceMap) {
        for (const ev of evs) {
          allEvidence.push({ label: `${ip}`, value: ev.value });
        }
      }

      // Build dynamic name with actual detected ports
      const portsArr = Array.from(detectedPorts).sort((a, b) => a - b);
      const portsSuffix = portsArr.length === 1
        ? ` (porta ${portsArr[0]})`
        : ` (portas ${portsArr.join(', ')})`;
      const dynamicName = `${rule.nameTemplate}${portsSuffix}`;

      findings.push({
        id: nextId('svc'),
        name: dynamicName,
        status: 'fail',
        severity: rule.severity,
        category: 'risky_services',
        description: `${affected.length} ${affected.length === 1 ? 'ativo expõe' : 'ativos expõem'} este serviço na internet.`,
        technicalRisk: rule.technicalRisk,
        businessImpact: rule.businessImpact,
        recommendation: rule.recommendation,
        affectedAssets: affected,
        evidence: allEvidence,
      });
    }
  }

  // ── 2. Web Security ───────────────────────────────────────

  // HTTP without TLS
  const httpNoTls: AffectedAsset[] = [];
  const httpNoTlsEvidence: SurfaceFindingEvidence[] = [];
  for (const asset of assets) {
    for (const ws of asset.webServices) {
      if (ws.url?.startsWith('http://') && (ws.status_code < 300 || ws.status_code >= 400)) {
        const exists = httpNoTls.find(a => a.ip === asset.ip);
        if (!exists) httpNoTls.push({ hostname: asset.hostname, ip: asset.ip });
        httpNoTlsEvidence.push({ label: asset.ip, value: ws.url });
      }
    }
  }
  if (httpNoTls.length > 0) {
    findings.push({
      id: nextId('web'),
      name: 'Serviço HTTP sem criptografia (sem HTTPS)',
      status: 'fail',
      severity: 'medium',
      category: 'web_security',
      description: `${httpNoTlsEvidence.length} endpoint${httpNoTlsEvidence.length !== 1 ? 's' : ''} servido${httpNoTlsEvidence.length !== 1 ? 's' : ''} sem criptografia TLS.`,
      technicalRisk: 'Dados trafegam em texto claro, incluindo credenciais, cookies de sessão e informações sensíveis. Suscetível a ataques man-in-the-middle (MITM) e sniffing de rede.',
      businessImpact: 'Interceptação de credenciais de usuários, sequestro de sessões e exposição de dados pessoais em trânsito, podendo resultar em violações de conformidade (LGPD).',
      recommendation: 'Habilitar HTTPS com certificado TLS válido em todos os endpoints. Configurar redirecionamento automático de HTTP para HTTPS.',
      affectedAssets: httpNoTls,
      evidence: httpNoTlsEvidence,
    });
  }

  // Admin panels exposed
  const adminPanels: AffectedAsset[] = [];
  const adminEvidence: SurfaceFindingEvidence[] = [];
  for (const asset of assets) {
    for (const ws of asset.webServices) {
      const url = ws.url?.toLowerCase() || '';
      const title = ws.title?.toLowerCase() || '';
      if (ADMIN_PANEL_PATTERNS.some(p => p.test(url) || p.test(title))) {
        const exists = adminPanels.find(a => a.ip === asset.ip);
        if (!exists) adminPanels.push({ hostname: asset.hostname, ip: asset.ip });
        adminEvidence.push({ label: asset.ip, value: `${ws.url}${ws.title ? ` — "${ws.title}"` : ''}` });
      }
    }
  }
  if (adminPanels.length > 0) {
    findings.push({
      id: nextId('web'),
      name: 'Painel de administração exposto na internet',
      status: 'fail',
      severity: 'high',
      category: 'web_security',
      description: `${adminEvidence.length} interface${adminEvidence.length !== 1 ? 's' : ''} de administração acessível${adminEvidence.length !== 1 ? 'is' : ''} publicamente.`,
      technicalRisk: 'Painéis de administração expostos são alvos prioritários para brute-force de credenciais, exploração de vulnerabilidades conhecidas do software e acesso não autorizado.',
      businessImpact: 'Acesso administrativo não autorizado pode resultar em controle total da aplicação/servidor, modificação de dados e interrupção de serviços.',
      recommendation: 'Restringir acesso a painéis de administração por IP (whitelist) ou VPN. Implementar autenticação multifator (MFA).',
      affectedAssets: adminPanels,
      evidence: adminEvidence,
    });
  }

  // ── Vulners CVE Enrichment (before CVE grouping) ──────────
  for (const asset of assets) {
    for (const svc of asset.services) {
      const raw = svc.scripts?.['vulners'];
      if (!raw) continue;
      const vulnCves = parseVulners(raw);
      for (const vc of vulnCves) {
        if (!asset.cves.find(c => c.cve_id === vc.cve_id)) {
          asset.cves.push({
            cve_id: vc.cve_id,
            score: vc.score,
            severity: vc.score >= 9 ? 'critical' : vc.score >= 7 ? 'high' : vc.score >= 4 ? 'medium' : 'low',
            title: `Detectado via Nmap vulners`,
            products: [svc.product || svc.name || 'unknown'],
            advisory_url: vc.url || '',
          });
        }
      }
    }
  }

  // ── 3. Vulnerabilities (CVEs grouped by product) ──────────
  // Collect all CVEs with their affected assets
  const cveMap = new Map<string, { cve: AttackSurfaceCVE; assets: AffectedAsset[] }>();
  for (const asset of assets) {
    for (const cve of asset.cves) {
      const existing = cveMap.get(cve.cve_id);
      if (existing) {
        if (!existing.assets.find(a => a.ip === asset.ip)) {
          existing.assets.push({ hostname: asset.hostname, ip: asset.ip });
        }
      } else {
        cveMap.set(cve.cve_id, { cve, assets: [{ hostname: asset.hostname, ip: asset.ip }] });
      }
    }
  }

  // Group CVEs by product instead of individual findings
  const productMap = new Map<string, {
    cves: Array<{ cve: AttackSurfaceCVE; assets: AffectedAsset[] }>;
    allAssets: Map<string, AffectedAsset>;
  }>();

  for (const entry of cveMap.values()) {
    // Determine product key from CVE products or fallback
    const productName = entry.cve.products?.length
      ? entry.cve.products[0]
      : 'Produto desconhecido';

    const existing = productMap.get(productName);
    if (existing) {
      existing.cves.push(entry);
      for (const a of entry.assets) existing.allAssets.set(a.ip, a);
    } else {
      const allAssets = new Map<string, AffectedAsset>();
      for (const a of entry.assets) allAssets.set(a.ip, a);
      productMap.set(productName, { cves: [entry], allAssets });
    }
  }

  // Generate one finding per product
  for (const [productName, group] of productMap) {
    const sortedCves = group.cves.sort((a, b) => (b.cve.score ?? 0) - (a.cve.score ?? 0));
    const affectedAssets = Array.from(group.allAssets.values());

    // Calculate severity breakdown
    const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    let worstSeverity: SurfaceFindingSeverity = 'low';
    const sevRankLocal: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

    for (const entry of sortedCves) {
      const sev = (entry.cve.severity || 'medium').toLowerCase();
      sevCounts[sev] = (sevCounts[sev] || 0) + 1;
      if ((sevRankLocal[sev] || 0) > (sevRankLocal[worstSeverity] || 0)) {
        worstSeverity = sev as SurfaceFindingSeverity;
      }
    }

    // Build severity breakdown string
    const sevParts: string[] = [];
    if (sevCounts.critical > 0) sevParts.push(`${sevCounts.critical} Crítica${sevCounts.critical > 1 ? 's' : ''}`);
    if (sevCounts.high > 0) sevParts.push(`${sevCounts.high} Alta${sevCounts.high > 1 ? 's' : ''}`);
    if (sevCounts.medium > 0) sevParts.push(`${sevCounts.medium} Média${sevCounts.medium > 1 ? 's' : ''}`);
    if (sevCounts.low > 0) sevParts.push(`${sevCounts.low} Baixa${sevCounts.low > 1 ? 's' : ''}`);
    const sevBreakdown = sevParts.join(', ');

    const totalCves = sortedCves.length;
    const isCriticalOrHigh = worstSeverity === 'critical' || worstSeverity === 'high';

    findings.push({
      id: nextId('cve'),
      name: `${productName} — ${totalCves} vulnerabilidade${totalCves !== 1 ? 's' : ''} (${sevBreakdown})`,
      status: isCriticalOrHigh ? 'fail' : 'warning',
      severity: worstSeverity,
      category: 'vulnerabilities',
      description: `${totalCves} CVE${totalCves !== 1 ? 's' : ''} conhecida${totalCves !== 1 ? 's' : ''} detectada${totalCves !== 1 ? 's' : ''} em ${affectedAssets.length} ${affectedAssets.length === 1 ? 'ativo' : 'ativos'}.`,
      technicalRisk: isCriticalOrHigh
        ? `Produto com vulnerabilidades ${worstSeverity === 'critical' ? 'críticas' : 'de alta severidade'} conhecidas. Pode permitir execução remota de código, escalonamento de privilégios ou comprometimento total do sistema.`
        : 'Vulnerabilidades de menor severidade que individualmente representam risco limitado, mas em conjunto podem ser encadeadas com outras falhas para amplificar o impacto de um ataque.',
      businessImpact: isCriticalOrHigh
        ? 'Risco imediato de comprometimento. Vulnerabilidades críticas são frequentemente exploradas em campanhas automatizadas de ataque dentro de dias após a divulgação.'
        : 'Risco moderado que deve ser endereçado no ciclo regular de patching. Não requer ação de emergência, mas negligenciar pode aumentar a superfície de ataque ao longo do tempo.',
      recommendation: isCriticalOrHigh
        ? `Atualizar ${productName} para a versão mais recente com patches de segurança aplicados. Priorizar imediatamente.`
        : `Incluir atualização de ${productName} no próximo ciclo de patching.`,
      affectedAssets: affectedAssets,
      evidence: sortedCves.slice(0, 15).map(e => ({
        label: e.cve.cve_id,
        value: `${e.cve.score != null ? `CVSS ${e.cve.score}` : '—'}${e.cve.title ? ` — ${e.cve.title}` : ''}`,
      })),
    });
  }

  // ── 4. TLS Certificates ───────────────────────────────────

  // Expired certificates
  const expiredCerts: Array<{ asset: FindingsAsset; cert: FindingsAsset['tlsCerts'][0] }> = [];
  for (const asset of assets) {
    for (const cert of asset.tlsCerts) {
      if (cert.daysRemaining !== null && cert.daysRemaining < 0) {
        expiredCerts.push({ asset, cert });
      }
    }
  }
  if (expiredCerts.length > 0) {
    const affected = [...new Map(expiredCerts.map(e => [e.asset.ip, { hostname: e.asset.hostname, ip: e.asset.ip }])).values()];
    findings.push({
      id: nextId('cert'),
      name: `${expiredCerts.length} certificado${expiredCerts.length !== 1 ? 's' : ''} TLS expirado${expiredCerts.length !== 1 ? 's' : ''}`,
      status: 'fail',
      severity: 'high',
      category: 'tls_certificates',
      description: `Certificados digitais expirados detectados em ${affected.length} ${affected.length === 1 ? 'ativo' : 'ativos'}.`,
      technicalRisk: 'Certificados expirados quebram a cadeia de confiança TLS. Navegadores exibem alertas de segurança, e conexões podem ser interceptadas por ataques man-in-the-middle (MITM).',
      businessImpact: 'Perda de confiança dos usuários (alertas de "site inseguro"), possível interceptação de dados em trânsito, impacto em SEO e reputação da marca.',
      recommendation: 'Renovar imediatamente os certificados expirados. Implementar monitoramento automático de expiração com alertas antecipados (30/60/90 dias).',
      affectedAssets: affected,
      evidence: expiredCerts.map(e => ({
        label: e.cert.subject_cn,
        value: `Expirado há ${Math.abs(e.cert.daysRemaining!)} dias — Ativo: ${e.asset.hostname} (${e.asset.ip})`,
      })),
    });
  }

  // Expiring soon certificates
  const expiringCerts: Array<{ asset: FindingsAsset; cert: FindingsAsset['tlsCerts'][0] }> = [];
  for (const asset of assets) {
    for (const cert of asset.tlsCerts) {
      if (cert.daysRemaining !== null && cert.daysRemaining >= 0 && cert.daysRemaining <= 30) {
        expiringCerts.push({ asset, cert });
      }
    }
  }
  if (expiringCerts.length > 0) {
    const affected = [...new Map(expiringCerts.map(e => [e.asset.ip, { hostname: e.asset.hostname, ip: e.asset.ip }])).values()];
    findings.push({
      id: nextId('cert'),
      name: `${expiringCerts.length} certificado${expiringCerts.length !== 1 ? 's' : ''} expirando em até 30 dias`,
      status: 'warning',
      severity: 'medium',
      category: 'tls_certificates',
      description: `Certificados com expiração próxima detectados em ${affected.length} ${affected.length === 1 ? 'ativo' : 'ativos'}.`,
      technicalRisk: 'Se não renovados a tempo, os certificados expirarão, causando interrupção de serviços HTTPS e alertas de segurança nos navegadores dos usuários.',
      businessImpact: 'Risco de indisponibilidade de serviços web e aplicações que dependem de TLS. Usuários podem perder acesso ou receberão alertas assustadores.',
      recommendation: 'Renovar os certificados antes da expiração. Considerar automação com Let\'s Encrypt ou ACME para evitar recorrência.',
      affectedAssets: affected,
      evidence: expiringCerts.map(e => ({
        label: e.cert.subject_cn,
        value: `Expira em ${e.cert.daysRemaining} dias — Ativo: ${e.asset.hostname} (${e.asset.ip})`,
      })),
    });
  }

  // ── 5. Obsolete Technologies ──────────────────────────────
  for (const rule of OBSOLETE_TECH_RULES) {
    const affected: AffectedAsset[] = [];
    const matchEvidence: SurfaceFindingEvidence[] = [];

    for (const asset of assets) {
      let matched = false;

      for (const tech of asset.allTechs) {
        if (rule.pattern.test(tech)) {
          if (!matched) {
            affected.push({ hostname: asset.hostname, ip: asset.ip });
            matched = true;
          }
          matchEvidence.push({ label: asset.ip, value: tech });
        }
      }

      if (!matched) {
        for (const ws of asset.webServices) {
          const server = ws.server || '';
          if (rule.pattern.test(server)) {
            affected.push({ hostname: asset.hostname, ip: asset.ip });
            matched = true;
            matchEvidence.push({ label: asset.ip, value: server });
          }
        }
      }

      if (!matched) {
        for (const svc of asset.services) {
          const desc = `${svc.product || ''} ${svc.version || ''}`.trim();
          if (desc && rule.pattern.test(desc)) {
            affected.push({ hostname: asset.hostname, ip: asset.ip });
            matched = true;
            matchEvidence.push({ label: asset.ip, value: desc });
          }
        }
      }
    }

    if (affected.length > 0) {
      findings.push({
        id: nextId('tech'),
        name: rule.name,
        status: 'fail',
        severity: rule.severity,
        category: 'obsolete_tech',
        description: `${rule.eolInfo}. Detectado em ${affected.length} ${affected.length === 1 ? 'ativo' : 'ativos'}.`,
        technicalRisk: rule.technicalRisk,
        businessImpact: rule.businessImpact,
        recommendation: rule.recommendation,
        affectedAssets: affected,
        evidence: matchEvidence,
      });
    }
  }

  // ── 5b. Unversioned Next.js / React fallback ─────────────
  {
    const unversionedAffected: AffectedAsset[] = [];
    const unversionedEvidence: SurfaceFindingEvidence[] = [];

    for (const asset of assets) {
      const hasNextjs = asset.allTechs.some(t => /next\.?js/i.test(t));
      const hasVersionedNextjs = asset.allTechs.some(t => /next[.\/-]?js[\/:\s]?\d/i.test(t));

      if (hasNextjs && !hasVersionedNextjs) {
        unversionedAffected.push({ hostname: asset.hostname, ip: asset.ip });
        unversionedEvidence.push({
          label: asset.ip,
          value: `Next.js detectado sem versão — tecnologias: ${asset.allTechs.filter(t => /next|react/i.test(t)).join(', ')}`,
        });
      }
    }

    if (unversionedAffected.length > 0) {
      findings.push({
        id: nextId('tech'),
        name: 'Next.js detectado sem versão identificada — possível React2Shell',
        status: 'fail',
        severity: 'medium',
        category: 'obsolete_tech',
        description: `Next.js foi detectado mas a versão não pôde ser extraída automaticamente. Versões anteriores a 15 são vulneráveis ao React2Shell (CVE-2025-29927). Detectado em ${unversionedAffected.length} ${unversionedAffected.length === 1 ? 'ativo' : 'ativos'}.`,
        technicalRisk: 'Sem a versão exata, não é possível confirmar automaticamente se a aplicação é vulnerável. Next.js < 15 permite bypass de autenticação via header x-middleware-subrequest, possibilitando acesso não autorizado a rotas protegidas.',
        businessImpact: 'Se a versão for inferior a 15, atacantes podem contornar toda a camada de autenticação da aplicação e acessar dados protegidos.',
        recommendation: 'Verificar manualmente a versão do Next.js acessando os JS bundles (/_next/static/chunks/) ou inspecionando o código-fonte. Se a versão for inferior a 15, atualizar imediatamente para Next.js 15+.',
        affectedAssets: unversionedAffected,
        evidence: unversionedEvidence,
      });
    }
  }

  // ── 6. Security Headers (NSE: http-security-headers) ──────
  {
    const headerMap = new Map<string, AffectedAsset[]>(); // header -> affected
    const headerEvidence = new Map<string, SurfaceFindingEvidence[]>();

    for (const asset of assets) {
      for (const svc of asset.services) {
        const raw = svc.scripts?.['http-security-headers'];
        if (!raw) continue;
        const { missing } = parseSecurityHeaders(raw);
        for (const hdr of missing) {
          if (!headerMap.has(hdr)) {
            headerMap.set(hdr, []);
            headerEvidence.set(hdr, []);
          }
          const list = headerMap.get(hdr)!;
          if (!list.find(a => a.ip === asset.ip)) {
            list.push({ hostname: asset.hostname, ip: asset.ip });
          }
          headerEvidence.get(hdr)!.push({
            label: asset.ip,
            value: `Porta ${svc.port} — ${hdr} ausente`,
          });
        }
      }
    }

    for (const [header, affected] of headerMap) {
      if (affected.length === 0) continue;
      const evidence = headerEvidence.get(header) || [];
      const friendlyName = header === 'Strict-Transport-Security' ? 'HSTS'
        : header === 'X-Content-Type-Options' ? 'X-Content-Type-Options'
        : header === 'X-Frame-Options' ? 'X-Frame-Options'
        : header === 'Content-Security-Policy' ? 'CSP'
        : header;

      findings.push({
        id: nextId('hdr'),
        name: `Header ${friendlyName} ausente`,
        status: 'warning',
        severity: 'medium',
        category: 'web_security',
        description: `O header de segurança ${header} não está configurado em ${affected.length} ${affected.length === 1 ? 'ativo' : 'ativos'}.`,
        technicalRisk: header === 'Strict-Transport-Security'
          ? 'Sem HSTS, conexões podem ser downgraded de HTTPS para HTTP, permitindo ataques man-in-the-middle e SSL stripping.'
          : header === 'Content-Security-Policy'
          ? 'Sem CSP, o site fica vulnerável a Cross-Site Scripting (XSS) e injeção de conteúdo malicioso de terceiros.'
          : header === 'X-Frame-Options'
          ? 'Sem X-Frame-Options, páginas podem ser embutidas em iframes maliciosos, permitindo ataques de clickjacking.'
          : 'Header de segurança ausente reduz a proteção contra ataques comuns no navegador.',
        businessImpact: 'Falta de headers de segurança aumenta a superfície de ataque da aplicação web, facilitando ataques automatizados e comprometimento de sessões de usuários.',
        recommendation: `Configurar o header ${header} no servidor web. Headers de segurança são uma camada de defesa essencial e de fácil implementação.`,
        affectedAssets: affected,
        evidence,
      });
    }
  }

  // ── 7. Dangerous HTTP Methods (NSE: http-methods) ─────────
  {
    const affected: AffectedAsset[] = [];
    const evidence: SurfaceFindingEvidence[] = [];
    const allMethods = new Set<string>();

    for (const asset of assets) {
      for (const svc of asset.services) {
        const raw = svc.scripts?.['http-methods'];
        if (!raw) continue;
        const dangerous = parseDangerousMethods(raw);
        if (dangerous.length > 0) {
          if (!affected.find(a => a.ip === asset.ip)) {
            affected.push({ hostname: asset.hostname, ip: asset.ip });
          }
          for (const m of dangerous) allMethods.add(m);
          evidence.push({
            label: asset.ip,
            value: `Porta ${svc.port} — Métodos: ${dangerous.join(', ')}`,
          });
        }
      }
    }

    if (affected.length > 0) {
      const methods = Array.from(allMethods).join(', ');
      findings.push({
        id: nextId('meth'),
        name: `Métodos HTTP perigosos habilitados (${methods})`,
        status: 'fail',
        severity: 'medium',
        category: 'web_security',
        description: `Métodos HTTP perigosos detectados em ${affected.length} ${affected.length === 1 ? 'ativo' : 'ativos'}.`,
        technicalRisk: 'Métodos como TRACE permitem Cross-Site Tracing (XST) para roubo de cookies HTTPOnly. PUT e DELETE podem permitir upload de webshells ou exclusão de arquivos remotamente.',
        businessImpact: 'Manipulação não autorizada de conteúdo do servidor, upload de código malicioso e potencial comprometimento total da aplicação.',
        recommendation: 'Desabilitar métodos HTTP desnecessários no servidor web. Permitir apenas GET, POST e HEAD para endpoints públicos.',
        affectedAssets: affected,
        evidence,
      });
    }
  }

  // ── 8. TLS/SSL Weak Config (NSE: ssl-enum-ciphers) ────────
  {
    const obsoleteAffected: AffectedAsset[] = [];
    const obsoleteEvidence: SurfaceFindingEvidence[] = [];
    const weakCipherAffected: AffectedAsset[] = [];
    const weakCipherEvidence: SurfaceFindingEvidence[] = [];
    const allObsoleteVersions = new Set<string>();

    for (const asset of assets) {
      for (const svc of asset.services) {
        const raw = svc.scripts?.['ssl-enum-ciphers'];
        if (!raw) continue;
        const parsed = parseSslEnumCiphers(raw);

        if (parsed.obsoleteVersions.length > 0) {
          if (!obsoleteAffected.find(a => a.ip === asset.ip)) {
            obsoleteAffected.push({ hostname: asset.hostname, ip: asset.ip });
          }
          for (const v of parsed.obsoleteVersions) allObsoleteVersions.add(v);
          obsoleteEvidence.push({
            label: asset.ip,
            value: `Porta ${svc.port} — ${parsed.obsoleteVersions.join(', ')} suportado`,
          });
        }

        if (parsed.hasCBC || parsed.hasNoForwardSecrecy || (parsed.leastStrength && parsed.leastStrength >= 'B')) {
          if (!weakCipherAffected.find(a => a.ip === asset.ip)) {
            weakCipherAffected.push({ hostname: asset.hostname, ip: asset.ip });
          }
          const issues: string[] = [];
          if (parsed.hasCBC) issues.push('CBC mode');
          if (parsed.hasNoForwardSecrecy) issues.push('sem Forward Secrecy');
          if (parsed.leastStrength && parsed.leastStrength >= 'B') issues.push(`rating ${parsed.leastStrength}`);
          weakCipherEvidence.push({
            label: asset.ip,
            value: `Porta ${svc.port} — ${issues.join(', ')}`,
          });
        }
      }
    }

    if (obsoleteAffected.length > 0) {
      const versions = Array.from(allObsoleteVersions).join(', ');
      findings.push({
        id: nextId('tls'),
        name: `Protocolo TLS obsoleto (${versions})`,
        status: 'fail',
        severity: 'high',
        category: 'crypto_weaknesses',
        description: `Versões obsoletas de TLS/SSL detectadas em ${obsoleteAffected.length} ${obsoleteAffected.length === 1 ? 'ativo' : 'ativos'}.`,
        technicalRisk: 'TLSv1.0 e TLSv1.1 possuem vulnerabilidades conhecidas (BEAST, POODLE, CRIME) que permitem descriptografia de tráfego. SSLv2/v3 são completamente inseguros.',
        businessImpact: 'Dados em trânsito podem ser interceptados e descriptografados. Não-conformidade com PCI DSS, LGPD e outros frameworks regulatórios que exigem TLSv1.2+.',
        recommendation: 'Desabilitar TLSv1.0, TLSv1.1 e todas as versões SSL. Configurar apenas TLSv1.2 e TLSv1.3 com cipher suites modernos.',
        affectedAssets: obsoleteAffected,
        evidence: obsoleteEvidence,
      });
    }

    if (weakCipherAffected.length > 0) {
      findings.push({
        id: nextId('tls'),
        name: 'Cipher suites fracos detectados',
        status: 'warning',
        severity: 'medium',
        category: 'crypto_weaknesses',
        description: `Configurações criptográficas fracas em ${weakCipherAffected.length} ${weakCipherAffected.length === 1 ? 'ativo' : 'ativos'}.`,
        technicalRisk: 'Cipher suites com CBC mode são vulneráveis a ataques BEAST e Lucky13. Ausência de Forward Secrecy (RSA key exchange) permite que chaves comprometidas descriptografem tráfego passado.',
        businessImpact: 'Dados criptografados podem ser descriptografados retrospectivamente se a chave privada do servidor for comprometida. Reduz a confidencialidade de comunicações passadas.',
        recommendation: 'Priorizar cipher suites com ECDHE/DHE (Forward Secrecy) e modo GCM. Desabilitar cipher suites com CBC mode e RSA key exchange.',
        affectedAssets: weakCipherAffected,
        evidence: weakCipherEvidence,
      });
    }
  }

  // ── 9. Weak SSH Algorithms (NSE: ssh2-enum-algos) ─────────
  {
    const affected: AffectedAsset[] = [];
    const evidence: SurfaceFindingEvidence[] = [];
    const allWeakAlgos = new Set<string>();

    for (const asset of assets) {
      for (const svc of asset.services) {
        const raw = svc.scripts?.['ssh2-enum-algos'];
        if (!raw) continue;
        const weak = parseWeakSshAlgos(raw);
        if (weak.length > 0) {
          if (!affected.find(a => a.ip === asset.ip)) {
            affected.push({ hostname: asset.hostname, ip: asset.ip });
          }
          for (const a of weak) allWeakAlgos.add(a);
          evidence.push({
            label: asset.ip,
            value: `Porta ${svc.port} — ${weak.join(', ')}`,
          });
        }
      }
    }

    if (affected.length > 0) {
      findings.push({
        id: nextId('ssh'),
        name: `Algoritmos SSH fracos (${allWeakAlgos.size} obsoleto${allWeakAlgos.size !== 1 ? 's' : ''})`,
        status: 'warning',
        severity: 'medium',
        category: 'crypto_weaknesses',
        description: `Algoritmos criptográficos obsoletos detectados no SSH de ${affected.length} ${affected.length === 1 ? 'ativo' : 'ativos'}.`,
        technicalRisk: 'Algoritmos como diffie-hellman-group1-sha1 e 3des-cbc possuem fraquezas criptográficas conhecidas. Ataques de downgrade podem forçar o uso desses algoritmos fracos.',
        businessImpact: 'Sessões SSH podem ser interceptadas ou descriptografadas. Não-conformidade com políticas de segurança que exigem criptografia moderna.',
        recommendation: 'Remover algoritmos obsoletos da configuração do SSH (sshd_config). Manter apenas algoritmos modernos como curve25519-sha256, aes256-gcm e hmac-sha2-256.',
        affectedAssets: affected,
        evidence,
      });
    }
  }


  // Sort findings: by severity (critical first), then by affected count
  const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  findings.sort((a, b) => {
    const sevDiff = (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return b.affectedAssets.length - a.affectedAssets.length;
  });

  return findings;
}

// ─── Stats from Findings ────────────────────────────────────

export interface FindingsStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byCategory: Record<SurfaceFindingCategory, number>;
}

export function calculateFindingsStats(findings: SurfaceFinding[]): FindingsStats {
  const stats: FindingsStats = {
    total: findings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    byCategory: {
      risky_services: 0,
      web_security: 0,
      vulnerabilities: 0,
      tls_certificates: 0,
      obsolete_tech: 0,
      leaked_credentials: 0,
      crypto_weaknesses: 0,
    },
  };

  for (const f of findings) {
    stats[f.severity]++;
    stats.byCategory[f.category]++;
  }

  return stats;
}
