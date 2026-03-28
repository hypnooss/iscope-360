export interface DocSection {
  title: string;
  content: string;
}

export interface DocModule {
  id: string;
  name: string;
  icon: string;
  version: string;
  lastUpdated: string;
  sections: DocSection[];
  changelog: { version: string; date: string; changes: string[] }[];
  children?: { id: string; name: string }[];
}

export interface DocCategory {
  id: string;
  name: string;
  modules: DocModule[];
}

export const DOCS_VERSION = 'v1.0.0';
export const DOCS_LAST_UPDATED = '2026-03-03';

export const technicalDocs: DocCategory[] = [
  {
    id: 'external-domain',
    name: 'Domínio Externo',
    modules: [
      {
        id: 'ext-compliance',
        name: 'Compliance',
        icon: 'FileText',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Avaliar a postura de segurança externa de domínios da organização, verificando configurações de DNS, certificados SSL/TLS, headers HTTP de segurança e subdomínios expostos.

**Problema que resolve:** Organizações frequentemente desconhecem vulnerabilidades em sua superfície de ataque externa — certificados expirados, headers de segurança ausentes, registros DNS mal configurados e subdomínios esquecidos que podem ser explorados.

**Tipo de análise:** Snapshot periódico com agendamento configurável (diário, semanal, mensal).

**Dependências:**
- Agent Python instalado com acesso à internet
- Supabase Edge Functions para orquestração
- Amass para enumeração de subdomínios
- Ferramentas de DNS (dig/nslookup) no agent`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Origem dos dados:** Consultas DNS públicas, verificação SSL/TLS, HTTP headers, enumeração de subdomínios.

**Tipo de conexão:** Agent Python → Internet (consultas DNS, HTTP, SSL)

**Frequência de coleta:** Configurável via agendamento (external_domain_schedules)

**Modelo de processamento:** Snapshot — cada análise gera um relatório completo

**Banco de dados:** Supabase PostgreSQL (tabelas: external_domains, external_domain_analysis_history)

**Fluxo lógico:**
\`\`\`
Trigger (Manual/Agendamento)
  → Edge Function (trigger-external-domain-analysis)
    → Cria agent_task (task_type: external_domain_analysis)
      → Agent Python recebe tarefa
        → Executa coleta DNS (A, AAAA, MX, TXT, NS, SOA, CNAME)
        → Verifica certificado SSL/TLS
        → Analisa HTTP headers de segurança
        → Enumera subdomínios (Amass)
        → Verifica DNSSEC, SPF, DKIM, DMARC
      → Envia resultados (agent-task-result)
        → Edge Function processa e avalia regras de compliance
          → Gera score 0-100
            → Salva em external_domain_analysis_history
              → Atualiza last_score no external_domains
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Endpoints/Ferramentas utilizados:**
- \`dns_query\` executor: consultas DNS (A, AAAA, MX, TXT, NS, SOA, CNAME, CAA)
- \`http_request\` executor: verificação de headers HTTP e HTTPS
- \`amass\` executor: enumeração de subdomínios
- Verificação SSL via conexão TLS direta

**Campos coletados:**
- Registros DNS completos por tipo
- Certificado SSL: emissor, validade, cadeia, algoritmo, SANs
- Headers HTTP: Strict-Transport-Security, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- Subdomínios descobertos com IPs resolvidos
- Registros SPF, DKIM, DMARC

**Volume médio:** ~50-200 consultas por domínio por análise

**Política de retenção:** Histórico completo mantido (external_domain_analysis_history)

**Deduplicação:** Cada análise gera um registro único com timestamp; sem deduplicação (cada snapshot é independente)`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Regras estáticas (threshold):**
O motor avalia cada domínio contra um conjunto de regras de compliance organizadas por categoria:

**DNS Security:**
- DNSSEC habilitado e válido
- Registros CAA configurados
- SPF configurado corretamente (sem +all)
- DMARC com política de reject ou quarantine
- DKIM configurado

**SSL/TLS:**
- Certificado válido e não expirado
- Certificado com validade > 30 dias
- Cadeia de certificados completa
- Protocolo TLS 1.2+ (sem SSLv3, TLS 1.0, TLS 1.1)
- Algoritmo de assinatura seguro (SHA-256+)

**HTTP Headers:**
- HSTS habilitado com max-age adequado
- Content-Security-Policy presente
- X-Frame-Options configurado
- X-Content-Type-Options: nosniff
- Referrer-Policy configurada

**Subdomínios:**
- Verificação de subdomínios apontando para IPs inexistentes (subdomain takeover)
- Detecção de serviços expostos em subdomínios

**Scoring:** Cada regra tem peso (weight) e severidade. Score final = soma ponderada de regras aprovadas / total possível × 100.`
          },
          {
            title: '📐 Modelo Matemático',
            content: `**Score de Compliance:**

O score é calculado como uma média ponderada das regras avaliadas:

\`\`\`
Score = (Σ peso_i × resultado_i) / (Σ peso_i) × 100
\`\`\`

Onde:
- \`peso_i\` = weight da regra (1-10)
- \`resultado_i\` = 1 (pass) ou 0 (fail)

**Classificação do Score:**
| Score | Classificação |
|-------|--------------|
| 90-100 | Excelente |
| 70-89 | Bom |
| 50-69 | Regular |
| 30-49 | Ruim |
| 0-29 | Crítico |

**Nota:** Este módulo utiliza avaliação estática (regras de compliance), não baseline comportamental. O modelo de Z-Score não se aplica aqui.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico (severity: critical):**
- Certificado SSL expirado
- DNSSEC com assinatura inválida
- SPF com mecanismo +all
- Subdomain takeover detectado

**Alto (severity: high):**
- Certificado expirando em < 30 dias
- DMARC ausente ou com política none
- HSTS ausente
- TLS 1.0/1.1 habilitado

**Médio (severity: medium):**
- Headers de segurança ausentes (CSP, X-Frame-Options)
- CAA não configurado
- DKIM ausente

**Baixo (severity: low):**
- Referrer-Policy ausente
- Permissions-Policy ausente
- Subdomínios desnecessários expostos`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Armazenamento:** Dados armazenados no Supabase PostgreSQL com RLS habilitado. Cada domínio está vinculado a um client_id, garantindo isolamento multi-tenant.

**Criptografia:** Conexão TLS em trânsito (Supabase). Dados em repouso criptografados pelo Supabase (AES-256).

**LGPD/GDPR:** Este módulo não coleta dados pessoais — apenas informações técnicas de infraestrutura DNS e web pública.

**Controle de acesso:** 
- super_admin: acesso total
- workspace_admin: acesso aos domínios do seu workspace
- user: acesso de leitura aos domínios do seu workspace

**Logs de auditoria:** Todas as análises são registradas com analyzed_by (user ID), timestamp e source (manual/scheduled).`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Capacidade estimada:** ~100 domínios por workspace, análises concorrentes limitadas pelo número de agents disponíveis.

**Limites por cliente:** Sem limite hard-coded; limitado pela capacidade do agent e quotas de API.

**Tempo médio de análise:** 30-120 segundos por domínio (dependendo de subdomínios).

**Escalabilidade:** Horizontal via múltiplos agents. Cada agent processa uma tarefa por vez; mais agents = mais paralelismo.

**Processamento assíncrono:** Sim — análises são enfileiradas como agent_tasks e processadas de forma assíncrona pelo agent Python.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Enumeração de subdomínios depende de fontes públicas (Amass) e pode não encontrar todos
- Verificação SSL requer conectividade direta do agent ao domínio na porta 443
- DKIM só verifica seletores comuns (default, google, selector1, selector2)
- Rate limiting de consultas DNS pode afetar análises de domínios com muitos registros
- Análise de headers HTTP verifica apenas a página raiz (/)`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Suporte a verificação de múltiplos seletores DKIM personalizados
- Integração com Certificate Transparency logs
- Monitoramento contínuo de certificados (não apenas snapshot)
- Verificação de DANE/TLSA
- Análise de headers em múltiplas páginas/endpoints
- Detecção de WAF/CDN`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      },
      {
        id: 'ext-analyzer',
        name: 'Analyzer (Attack Surface)',
        icon: 'Radar',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Mapear e avaliar a superfície de ataque externa da organização, identificando serviços expostos, portas abertas, vulnerabilidades conhecidas e riscos em IPs públicos.

**Problema que resolve:** Organizações não têm visibilidade sobre quais serviços estão expostos na internet, portas abertas desnecessárias, e versões vulneráveis de software acessíveis externamente.

**Tipo de análise:** Snapshot com escaneamento ativo de rede (Nmap, Masscan).

**Dependências:**
- Agent Python (preferencialmente system agent) com Nmap e Masscan instalados
- Supabase Edge Functions para orquestração e consolidação
- Tabelas: attack_surface_snapshots, attack_surface_tasks`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Origem dos dados:** Escaneamento ativo de IPs públicos da organização.

**Tipo de conexão:** Agent → Internet (scan de portas TCP/UDP)

**Frequência de coleta:** Sob demanda ou agendado (attack_surface_schedules)

**Modelo de processamento:** Batch distribuído — cada IP é uma tarefa independente

**Fluxo lógico:**
\`\`\`
Trigger (Manual/Agendamento)
  → Edge Function (attack-surface-scan)
    → Cria snapshot (attack_surface_snapshots)
      → Descobre IPs públicos (DNS resolution de domínios + IPs manuais)
        → Para cada IP, cria attack_surface_task
          → Agent executa Nmap/Masscan no IP
            → Retorna portas abertas, serviços, versões, OS detection
          → Edge Function (attack-surface-step-result) processa resultado
        → Consolidação (consolidate-attack-surface)
          → Correlação com CVE cache
            → Score de risco calculado
              → Resultados salvos no snapshot
\`\`\`

**Distribuição de carga:** Tarefas podem ser distribuídas entre múltiplos agents (system agents preferencialmente).`
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Ferramentas utilizadas:**
- \`nmap\` executor: Port scanning detalhado (-sV para versão, -O para OS, scripts NSE)
- \`masscan\` executor: Fast port scanning para descoberta rápida
- \`snmp\` executor: Consultas SNMP quando porta 161 aberta
- \`http_request\` executor: Banner grabbing e fingerprinting HTTP

**Campos coletados por IP:**
- Portas abertas (TCP/UDP)
- Serviços detectados e versões
- Sistema operacional estimado
- Banners de serviço
- Certificados SSL em portas HTTPS
- Respostas HTTP (status, headers, título)

**Volume médio:** 10-50 IPs por scan, ~65535 portas por IP (configurable)

**Política de retenção:** Snapshots mantidos indefinidamente; dados brutos por tarefa mantidos.

**Deduplicação:** Cada snapshot é independente; comparação entre snapshots identifica mudanças.`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Regras de detecção de risco:**

**Portas de alto risco:**
- FTP (21), Telnet (23), SMB (445), RDP (3389) expostos → Crítico
- Bancos de dados expostos (3306, 5432, 1433, 27017) → Crítico
- SSH (22) exposto sem restrição → Alto

**Serviços vulneráveis:**
- Correlação versão do serviço × CVE cache → severidade do CVE
- Software desatualizado (versão < última estável) → Alto
- Serviços com exploits públicos conhecidos → Crítico

**Análise de configuração:**
- SSL/TLS fraco em serviços HTTPS → Médio
- Default credentials detectados → Crítico
- Information disclosure (banners excessivos) → Baixo

**Score de risco por IP:**
\`\`\`
Risco_IP = Σ (severidade_finding × peso_porta)
Score_IP = max(0, 100 - Risco_IP)
\`\`\`

**Score geral do snapshot:**
\`\`\`
Score = média_ponderada(Score_IP_i) por todos os IPs
\`\`\``
          },
          {
            title: '📐 Modelo Matemático',
            content: `**Classificação de Findings:**

Cada finding recebe uma severidade baseada em:

1. **CVSS Score** (quando CVE correlacionado):
   | CVSS | Severidade |
   |------|-----------|
   | 9.0-10.0 | Crítica |
   | 7.0-8.9 | Alta |
   | 4.0-6.9 | Média |
   | 0.1-3.9 | Baixa |

2. **Risco intrínseco da porta/serviço** (quando sem CVE):
   - Portas de gerenciamento remoto (RDP, Telnet, VNC) = Alto
   - Portas de banco de dados = Crítico
   - Portas web (80, 443) = Informativo (esperado)
   - Portas desconhecidas = Médio

**Nota:** O Analyzer de Attack Surface usa avaliação baseada em regras e CVSS, não baseline comportamental com Z-Score.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:**
- Banco de dados exposto à internet
- Serviço com CVE crítico (CVSS ≥ 9.0)
- Credenciais padrão detectadas
- Backdoor ou serviço malicioso detectado

**Alto:**
- RDP/Telnet/FTP exposto
- CVE com CVSS 7.0-8.9
- SSH com autenticação por senha habilitada

**Médio:**
- Portas incomuns abertas
- Software desatualizado sem CVE conhecido
- Information disclosure

**Informativo:**
- Serviços web padrão (HTTP/HTTPS)
- Mudanças entre snapshots (nova porta aberta/fechada)`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Considerações legais:** O scan de Attack Surface deve ser realizado apenas em IPs pertencentes à organização. O sistema valida que os IPs escaneados pertencem aos domínios cadastrados do cliente.

**Armazenamento:** Resultados de scan armazenados com RLS por client_id.

**Dados sensíveis:** Banners de serviço e informações de versão podem conter dados sensíveis — acesso restrito.

**Auditoria:** Cada scan registra created_by, timestamps de início/fim, e status.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Tempo médio de scan:** 2-10 minutos por IP (dependendo do range de portas)

**Paralelismo:** Cada IP é uma tarefa independente; múltiplos agents podem processar IPs simultaneamente.

**Limites:** Masscan limitado a rate configurável para evitar saturação de rede.

**Escalabilidade:** Linear com número de agents system disponíveis.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Requer agents com Nmap/Masscan instalados (geralmente system agents)
- Firewalls/IDS podem bloquear ou alertar sobre os scans
- Detecção de OS não é 100% precisa
- UDP scanning é significativamente mais lento que TCP
- Não detecta vulnerabilidades em aplicações web (camada 7) — focado em infraestrutura`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Integração com scanners de vulnerabilidades web (Nuclei)
- Detecção de subdomain takeover automatizada
- Comparação automática entre snapshots com alertas de mudança
- Scanning de IPv6
- Integração com threat intelligence feeds`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      }
    ]
  },
  {
    id: 'firewall',
    name: 'Firewall',
    modules: [
      {
        id: 'fw-compliance',
        name: 'Compliance',
        icon: 'FileText',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Avaliar a conformidade de segurança de firewalls FortiGate, verificando 80+ regras de configuração em categorias como interfaces, políticas, VPN, autenticação, logging e sistema.

**Problema que resolve:** Firewalls mal configurados são uma das principais causas de brechas de segurança. Este módulo identifica automaticamente configurações inseguras, políticas permissivas, e desvios de best practices.

**Tipo de análise:** Snapshot periódico via API do FortiOS (REST API).

**Dependências:**
- Agent Python com conectividade ao firewall (rede local)
- FortiGate com REST API habilitada
- API key ou credenciais configurados
- Device type e blueprints configurados no sistema`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Origem dos dados:** FortiOS REST API (FortiGate)

**Tipo de conexão:** Agent Python → FortiGate REST API (HTTPS)

**Frequência de coleta:** Configurável via agendamento (analysis_schedules) — diário, semanal ou mensal

**Modelo de processamento:** Snapshot — coleta completa da configuração seguida de avaliação

**Banco de dados:** Supabase PostgreSQL (firewalls, analysis_history, compliance_rules)

**Fluxo lógico:**
\`\`\`
Trigger (Manual/Agendamento)
  → Edge Function (trigger-firewall-analysis)
    → Busca blueprint ativo do device_type
      → Cria agent_task com steps do blueprint
        → Agent Python recebe tarefa
          → Para cada step do blueprint:
            → Executor HTTP faz request à API FortiGate
            → Coleta resposta JSON
            → Envia step_result parcial
          → Envia resultado final
        → Edge Function (agent-task-result) processa:
          → Carrega regras de compliance ativas do device_type
          → Avalia cada regra contra os dados coletados
          → Calcula score ponderado
          → Gera evidence (evidências) por regra
          → Salva analysis_history com report_data completo
          → Atualiza last_score e last_analysis_at no firewall
\`\`\`

**Blueprints:** Definem quais endpoints da API FortiGate serão consultados. Cada step tem:
- endpoint (ex: /api/v2/cmdb/system/interface)
- método HTTP
- configuração de autenticação
- parser de resposta`
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Endpoints da API FortiGate consultados (via blueprint):**

| Step | Endpoint | Dados |
|------|----------|-------|
| system_status | /api/v2/monitor/system/status | Versão, serial, uptime |
| interfaces | /api/v2/cmdb/system/interface | Interfaces, roles, IPs, allowaccess |
| firewall_policy | /api/v2/cmdb/firewall/policy | Políticas de firewall |
| firewall_address | /api/v2/cmdb/firewall/address | Objetos de endereço |
| admin_users | /api/v2/cmdb/system/admin | Contas administrativas |
| vpn_ipsec | /api/v2/cmdb/vpn.ipsec/phase1-interface | Túneis VPN IPsec |
| vpn_ssl | /api/v2/cmdb/vpn.ssl/settings | Configurações VPN SSL |
| log_settings | /api/v2/cmdb/log/setting | Configurações de logging |
| system_global | /api/v2/cmdb/system/global | Configurações globais |
| dns | /api/v2/cmdb/system/dns | Configurações DNS |
| ntp | /api/v2/cmdb/system/ntp | Configurações NTP |
| snmp | /api/v2/cmdb/system.snmp/community | Comunidades SNMP |
| ha | /api/v2/cmdb/system/ha | High Availability |
| firmware | /api/v2/monitor/system/firmware | Informações de firmware |

**Volume:** ~15-25 requests por análise (um por step do blueprint)

**Política de retenção:** Histórico completo de análises mantido em analysis_history.

**Deduplicação:** N/A — cada análise é um snapshot independente.`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**80+ regras de compliance organizadas por categoria:**

**Interfaces (int-001 a int-005):**
- HTTP/HTTPS/SSH/SNMP/Ping desabilitados em interfaces WAN
- Detecção de interface WAN baseada no campo \`role\` do FortiOS
- Interfaces com role "wan" ou "sd-wan" são verificadas

**Políticas de Firewall (pol-001 a pol-015+):**
- Ausência de regras "any-any" permissivas
- Logging habilitado em todas as políticas
- Políticas com source/destination específicos
- IPS habilitado em políticas de entrada
- Application Control configurado
- Web Filtering ativo

**VPN (vpn-001 a vpn-010):**
- Criptografia forte em VPN IPsec (AES-256, SHA-256+)
- DH Group ≥ 14
- PFS habilitado
- VPN SSL com autenticação de dois fatores
- Idle timeout configurado

**Autenticação (auth-001 a auth-008):**
- Timeout de sessão administrativa
- Política de senhas forte
- MFA habilitado para admins
- Contas padrão desabilitadas
- Limite de tentativas de login

**Sistema (sys-001 a sys-010):**
- NTP configurado
- DNS seguro
- SNMP v3 (não v1/v2c)
- Firmware atualizado
- HA configurado (quando aplicável)

**Logging (log-001 a log-005):**
- Logging habilitado
- Log de tráfego ativo
- Syslog configurado
- Log de eventos do sistema

**Avaliação por regra:**
\`\`\`
Resultado = evaluation_logic aplicada aos dados coletados
  → pass | fail | not_found
  → evidência detalhada gerada
\`\`\``
          },
          {
            title: '📐 Modelo Matemático',
            content: `**Score de Compliance (0-100):**

\`\`\`
Score = (Σ peso_i × resultado_i) / (Σ peso_i) × 100
\`\`\`

Onde:
- \`peso_i\` = weight da regra de compliance (1-10)
- \`resultado_i\` = 1 (pass), 0 (fail), excluído (not_found)

**Regras não encontradas** (not_found) são excluídas do cálculo para não penalizar funcionalidades não aplicáveis ao modelo do firewall.

**Distribuição de severidade:**
| Severidade | Peso típico | Impacto no score |
|-----------|-------------|------------------|
| critical | 8-10 | Alto |
| high | 5-7 | Médio-Alto |
| medium | 3-4 | Médio |
| low | 1-2 | Baixo |

**Nota:** Este módulo utiliza avaliação estática baseada em regras de compliance. Não utiliza baseline comportamental ou Z-Score.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico (severity: critical):**
- Interfaces WAN com gerenciamento habilitado (HTTP/SSH/Telnet)
- Política "any-any" sem restrição
- VPN com criptografia fraca (DES, 3DES, MD5)
- Conta admin sem senha ou com senha padrão

**Alto (severity: high):**
- Logging desabilitado
- IPS/IDS não ativo em políticas de entrada
- SNMP v1/v2c com community "public"
- Firmware desatualizado com CVEs conhecidos

**Médio (severity: medium):**
- Application Control não configurado
- Web Filtering ausente
- NTP não configurado
- DNS usando servidores públicos inseguros

**Baixo (severity: low):**
- Banner de login não configurado
- Hostname padrão
- Timezone incorreto`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Armazenamento:** Dados de análise armazenados no Supabase com RLS por client_id.

**Credenciais do firewall:** API keys e credenciais armazenadas criptografadas via Edge Function (manage-firewall-credentials). Nunca expostas ao frontend.

**Criptografia:** 
- Em trânsito: TLS entre Agent e FortiGate API; TLS entre Agent e Supabase
- Em repouso: AES-256 pelo Supabase

**LGPD/GDPR:** Dados coletados são configurações técnicas, sem dados pessoais.

**Controle de acesso:**
- super_admin: acesso total a todos os firewalls
- workspace_admin: acesso aos firewalls do seu workspace
- user: leitura dos relatórios do seu workspace

**Auditoria:** Cada análise registra analyzed_by, timestamps, e fonte (manual/agendada).`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Tempo médio de análise:** 15-60 segundos por firewall (dependendo da complexidade da configuração)

**Capacidade:** ~50 firewalls por workspace; análises sequenciais por agent

**Paralelismo:** Cada agent processa um firewall por vez; múltiplos agents permitem análises paralelas

**Escalabilidade:** Linear com agents; cada agent pode ser dedicado a firewalls específicos

**Processamento assíncrono:** Sim — via agent_tasks; resultados processados em edge functions`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Suporte exclusivo para FortiGate (outros vendors requerem novos device_types e blueprints)
- API do FortiGate pode ter limitações de rate limiting
- Algumas configurações avançadas (SD-WAN rules, automation stitches) ainda não são cobertas
- Detecção de interface WAN baseia-se no campo "role" do FortiOS — interfaces sem role definido não são classificadas
- Agent precisa de conectividade de rede ao firewall (geralmente rede interna)`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Suporte a Palo Alto Networks (novo device_type)
- Suporte a Cisco ASA / FTD
- Comparação de configuração entre análises (config diff)
- Regras de compliance customizáveis por cliente
- Integração com SIEM para alertas em tempo real
- Benchmark CIS FortiGate integrado`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      },
      {
        id: 'fw-analyzer',
        name: 'Analyzer',
        icon: 'Radar',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Analisar o comportamento operacional do firewall ao longo do tempo, detectando anomalias de tráfego, mudanças de configuração suspeitas, e padrões de ataque.

**Problema que resolve:** Configurações estáticas não capturam ameaças dinâmicas. O Analyzer monitora o comportamento real do firewall para detectar desvios, ataques em andamento e mudanças não autorizadas.

**Tipo de análise:** Snapshot periódico com baseline comportamental.

**Dependências:**
- Agent com acesso à API FortiGate (monitor endpoints)
- Histórico de snapshots para construção de baseline
- Tabelas: analyzer_snapshots, analyzer_config_changes`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Origem dos dados:** FortiOS REST API — endpoints de monitoramento e logs

**Tipo de conexão:** Agent Python → FortiGate REST API

**Frequência de coleta:** Configurável (analyzer_schedules) — tipicamente diário

**Modelo de processamento:** Snapshot com análise de tendência

**Fluxo lógico:**
\`\`\`
Trigger (Manual/Agendamento)
  → Edge Function (trigger-firewall-analyzer)
    → Cria agent_task (task_type: firewall_analyzer)
      → Agent coleta:
        → Métricas de tráfego (throughput, sessões, bandwidth)
        → Logs de configuração (config changes)
        → Top sources/destinations
        → Políticas mais utilizadas
        → Eventos de segurança (IPS, AV, web filter)
      → Edge Function (firewall-analyzer) processa:
        → Compara métricas com baseline histórico
        → Detecta anomalias estatísticas
        → Identifica mudanças de configuração
        → Gera insights categorizados
        → Salva analyzer_snapshot
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Endpoints monitorados:**
- /api/v2/monitor/system/resource/usage — CPU, memória, sessões
- /api/v2/monitor/firewall/policy — Contadores de policy hits
- /api/v2/monitor/log/event — Logs de evento do sistema
- /api/v2/monitor/system/interface — Throughput por interface
- /api/v2/log/event — Logs de mudanças de configuração

**Métricas coletadas:**
- CPU usage (%), Memory usage (%)
- Active sessions count
- Bandwidth por interface (in/out)
- Policy hit counts
- Event logs (config changes, admin logins, system events)
- IPS/AV detections count

**Volume:** Variável — depende do período analisado e volume de logs`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Regras comportamentais:**
- Desvio de tráfego > 2σ do baseline → Atenção
- Desvio de tráfego > 3σ do baseline → Anomalia
- Spike de sessões ativas > 5x média → Alerta crítico
- CPU/Memória > 90% sustentado → Alerta operacional

**Regras de correlação:**
- Mudança de configuração + spike de tráfego = possível comprometimento
- Múltiplas tentativas de login falhadas + mudança de admin = possível ataque
- Nova política permissiva + tráfego anômalo = investigar

**Regras de mudança de configuração:**
- Qualquer mudança em políticas de firewall → Registrar
- Mudança em interfaces WAN → Alerta alto
- Novo admin criado → Alerta alto
- Desabilitação de logging → Alerta crítico`
          },
          {
            title: '📐 Modelo Matemático (Baseline Comportamental)',
            content: `**Modelo de Baseline:**

O Analyzer utiliza um modelo estatístico para detecção de anomalias baseado em média móvel e desvio padrão.

**Média Móvel (Moving Average):**
\`\`\`
μ = (Σ Xi) / N
\`\`\`
Onde Xi são as observações na janela temporal e N é o número de observações.

**Desvio Padrão:**
\`\`\`
σ = √(Σ (Xi - μ)² / N)
\`\`\`

**Z-Score (medida de desvio):**
\`\`\`
Z = (X_atual - μ) / σ
\`\`\`

**Classificação de anomalias:**
| Z-Score | Classificação | Ação |
|---------|--------------|------|
| |Z| < 2 | Normal | Nenhuma |
| 2 ≤ |Z| < 3 | Atenção | Registrar insight |
| |Z| ≥ 3 | Anomalia | Alerta + investigação |

**Janela temporal:** 7 dias para baseline de curto prazo, 30 dias para baseline de longo prazo.

**Fator multiplicador:** O sistema permite configurar multiplicadores por métrica para ajustar sensibilidade.

**Definições:**
- **Comportamento normal:** Métrica dentro de 2 desvios padrão da média histórica
- **Desvio tolerável:** Métrica entre 2σ e 3σ — registrado como insight para revisão
- **Anomalia estatística:** Métrica acima de 3σ — alerta gerado automaticamente
- **Falso positivo:** Desvios esperados (manutenção programada, crescimento orgânico) podem ser marcados como falso positivo para ajuste do baseline`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:**
- Anomalia de tráfego com Z > 5 (provável ataque)
- Desabilitação de logging detectada
- Criação de política "any-any" fora de manutenção

**Segurança:**
- Múltiplas tentativas de admin login falhadas
- Mudança de configuração por usuário desconhecido
- Nova rota estática suspeita

**Operacional:**
- CPU/Memória em threshold crítico (>90%)
- Interface down detectada
- HA failover ocorrido

**Atenção:**
- Métricas entre 2σ e 3σ do baseline
- Mudanças de configuração durante horário não comercial
- Aumento gradual de sessões

**Informativo:**
- Mudanças de configuração documentadas
- Métricas dentro do normal
- Relatório periódico de tendências`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Armazenamento:** Snapshots e insights salvos com RLS por client_id. Mudanças de configuração indexadas por firewall_id.

**Dados sensíveis:** Logs de configuração podem conter IPs internos e nomes de políticas — acesso restrito por workspace.

**Auditoria:** Cada snapshot tem timestamp, agent_task_id vinculado, e status de processamento.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Processamento:** Cálculos de baseline executados na Edge Function durante processamento do snapshot.

**Armazenamento:** Cada snapshot armazena métricas resumidas e insights gerados — não dados brutos de logs.

**Escalabilidade:** Proporcional ao número de firewalls e frequência de análise.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Baseline requer mínimo de 7 snapshots para cálculos estatísticos confiáveis
- Logs do FortiGate podem ser truncados se buffer cheio
- Mudanças de configuração dependem dos event logs estarem habilitados
- Não detecta ameaças em tráfego criptografado sem SSL inspection`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Integração com syslog para monitoramento em tempo real
- Machine learning para detecção de padrões complexos
- Correlação cross-firewall (ataques distribuídos)
- Dashboard de tendências com gráficos de baseline`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      },
      {
        id: 'fw-cves',
        name: 'CVEs',
        icon: 'ShieldCheck',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Monitorar e alertar sobre vulnerabilidades conhecidas (CVEs) que afetam os firewalls FortiGate do cliente, correlacionando com a versão de firmware em uso.

**Problema que resolve:** Equipes de segurança precisam acompanhar constantemente novos CVEs publicados pela Fortinet e verificar se seus firewalls estão vulneráveis.

**Tipo de análise:** Cache sincronizado de CVEs com correlação automática.

**Dependências:**
- Fontes de CVE configuradas (cve_sources)
- Edge Function para sincronização (refresh-cve-cache, fortigate-cve)
- Versão de firmware dos firewalls cadastrados`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Origem dos dados:** FortiGuard PSIRT (advisories), NVD (National Vulnerability Database)

**Tipo de conexão:** Edge Function → APIs externas de CVE

**Frequência de coleta:** Sincronização periódica configurável (cve_sources.next_run_at)

**Modelo de processamento:** Cache — CVEs são sincronizados e armazenados localmente

**Fluxo lógico:**
\`\`\`
Sync trigger (agendamento)
  → Edge Function (refresh-cve-cache)
    → Consulta fontes configuradas (FortiGuard PSIRT API)
      → Parseia advisories
        → Extrai CVE ID, descrição, CVSS, produtos afetados
          → Salva/atualiza em cve_cache
            → Atualiza cve_severity_cache (contadores por severidade)
              → Frontend consulta e correlaciona com firmware dos firewalls
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Fontes:**
- FortiGuard PSIRT API: Advisories específicos para FortiOS
- NVD API: CVEs gerais com CPE matching para Fortinet

**Campos armazenados (cve_cache):**
- cve_id: Identificador CVE (ex: CVE-2024-12345)
- title: Título do advisory
- description: Descrição da vulnerabilidade
- score: CVSS score (0-10)
- severity: critical/high/medium/low
- products: Produtos e versões afetados (JSON)
- advisory_url: Link para o advisory original
- published_date: Data de publicação
- source_id: Fonte de origem

**Cache de severidade (cve_severity_cache):**
- Contadores agregados por severidade por módulo e cliente
- Top CVEs mais relevantes

**Deduplicação:** Por cve_id + source_id (unique constraint)`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Correlação automática:**
1. Sistema identifica versão de firmware do FortiGate (via análise ou cadastro)
2. Compara com "products" de cada CVE no cache
3. Se versão do firmware está na faixa afetada → CVE aplicável

**Priorização:**
- CVSS ≥ 9.0 + exploit público → Urgente
- CVSS 7.0-8.9 → Alto
- CVSS 4.0-6.9 → Médio
- CVSS < 4.0 → Baixo

**Verificação de patch:**
- Se firmware ≥ versão corrigida → CVE resolvido
- Se firmware < versão corrigida → CVE pendente`
          },
          {
            title: '📐 Modelo Matemático',
            content: `**Scoring CVSS (Common Vulnerability Scoring System):**

O sistema utiliza o CVSS v3.1 score fornecido pelas fontes de CVE. Não há cálculo próprio de CVSS — utiliza-se o score oficial.

**Risco agregado por firewall:**
\`\`\`
Risco = Σ CVSS_i para todos os CVEs aplicáveis não resolvidos
Risco_normalizado = min(Risco / 40, 1.0) × 100
\`\`\`

Onde 40 representa um threshold de risco máximo (4 CVEs críticos).`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:** Novo CVE com CVSS ≥ 9.0 afetando firmware em uso
**Alto:** CVE com CVSS 7.0-8.9, exploit público disponível
**Médio:** CVE com CVSS 4.0-6.9
**Informativo:** Nova sincronização de CVEs, CVEs resolvidos por atualização`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Dados:** CVEs são informações públicas. Correlação com firmware é dado sensível (revela versão vulnerável) — protegido por RLS.

**Acesso:** Mesmas regras do módulo Firewall (super_admin, workspace_admin, user).`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Sync:** ~30 segundos por fonte de CVE. Cache reduz necessidade de consultas externas repetidas.

**Storage:** CVEs são compartilhados entre clientes (sem duplicação por workspace).

**Escalabilidade:** Cache centralizado; apenas correlação é por cliente.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Depende de APIs externas (FortiGuard, NVD) estarem disponíveis
- Correlação de versão requer formato padronizado de firmware
- CVEs sem CPE estruturado podem não ser correlacionados automaticamente
- Tempo entre publicação do CVE e sincronização depende da frequência configurada`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Alertas push quando novo CVE crítico é detectado
- Integração com EPSS (Exploit Prediction Scoring System)
- Sugestão automática de versão de firmware para remediar todos os CVEs
- Dashboard de exposure timeline`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      }
    ]
  },
  {
    id: 'microsoft365',
    name: 'Microsoft 365',
    modules: [
      {
        id: 'm365-compliance',
        name: 'Compliance',
        icon: 'FileText',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Avaliar a postura de segurança de tenants Microsoft 365, verificando configurações de segurança, políticas de acesso condicional, MFA, Secure Score e conformidade com best practices.

**Problema que resolve:** Tenants M365 possuem centenas de configurações de segurança distribuídas entre Azure AD, Exchange Online, SharePoint, Teams, Intune e Defender. Este módulo centraliza a avaliação.

**Tipo de análise:** Snapshot periódico via Microsoft Graph API e PowerShell.

**Dependências:**
- Tenant M365 conectado via OAuth (App Registration)
- Permissões adequadas configuradas (Graph API + Exchange PowerShell)
- Agent Python para execução de scripts PowerShell
- Tabelas: m365_tenants, m365_posture_snapshots`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Origem dos dados:** Microsoft Graph API + Exchange Online PowerShell

**Tipo de conexão:** 
- OAuth 2.0 (Client Credentials + Certificate) para Graph API
- PowerShell remoto via Agent para Exchange Online

**Frequência:** Configurável via m365_analyzer_schedules

**Fluxo lógico:**
\`\`\`
Trigger (Manual/Agendamento)
  → Edge Function (trigger-m365-posture-analysis)
    → Cria agent_task
      → Agent obtém token OAuth (certificado)
        → Coleta via Graph API:
          → Secure Score, Conditional Access, MFA status
          → Users, Groups, Applications
          → Device compliance, Intune policies
        → Coleta via PowerShell:
          → Exchange transport rules, anti-spam, DKIM/DMARC
          → Mailbox configurations
      → Edge Function (m365-security-posture) processa:
        → Avalia insights por categoria
        → Calcula score de postura
        → Salva snapshot
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Graph API endpoints:**
- /security/secureScores — Microsoft Secure Score
- /identity/conditionalAccess/policies — Políticas de acesso condicional
- /reports/credentialUserRegistrationDetails — Status de MFA
- /applications — Aplicações registradas
- /servicePrincipals — Service principals
- /users — Usuários e configurações
- /groups — Grupos e memberships
- /deviceManagement/managedDevices — Dispositivos Intune
- /security/alerts — Alertas de segurança

**PowerShell cmdlets (Exchange Online):**
- Get-TransportRule — Regras de transporte
- Get-HostedContentFilterPolicy — Anti-spam
- Get-DkimSigningConfig — DKIM
- Get-AntiPhishPolicy — Anti-phishing
- Get-SafeLinksPolicy — Safe Links
- Get-SafeAttachmentPolicy — Safe Attachments`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Categorias de insights:**

**Identidade e Acesso:**
- MFA habilitado para todos os usuários
- Conditional Access com policies de baseline
- Legacy authentication bloqueada
- Admin accounts com MFA obrigatório
- PIM (Privileged Identity Management) configurado

**Proteção de Dados:**
- DLP policies configuradas
- Information Protection labels
- Sensitivity labels em uso
- Encryption de emails

**Dispositivos:**
- Compliance policies do Intune
- Device enrollment configurado
- BitLocker/FileVault enforcement
- Patching compliance

**Exchange Online:**
- DKIM habilitado
- DMARC configurado
- SPF correto
- Anti-spam e anti-phishing ativos
- Safe Links e Safe Attachments

**Cada insight tem:**
- Status: pass/fail/warning/not_applicable
- Severidade: critical/high/medium/low
- Recomendação de correção
- Entidades afetadas (usuários, dispositivos, políticas)`
          },
          {
            title: '📐 Modelo Matemático',
            content: `**Score de Postura M365:**

Score composto baseado em Microsoft Secure Score + avaliação proprietária:

\`\`\`
Score_total = (0.4 × Secure_Score_normalizado) + (0.6 × Score_proprietário)
\`\`\`

**Score proprietário:**
\`\`\`
Score_prop = (Σ peso_i × resultado_i) / (Σ peso_i) × 100
\`\`\`

**Classificação:**
| Score | Nível |
|-------|-------|
| 90-100 | Excelente |
| 70-89 | Bom |
| 50-69 | Regular |
| 30-49 | Ruim |
| 0-29 | Crítico |

**Nota:** Módulo Compliance usa avaliação estática. O modelo de Z-Score é utilizado no módulo Analyzer.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:** MFA desabilitado para admins globais, Legacy auth habilitada, Global admin sem Conditional Access
**Alto:** MFA não enforced para todos os usuários, DMARC ausente, DLP não configurado
**Médio:** Safe Links/Attachments não configurados, Device compliance não enforced
**Baixo:** Sensitivity labels não em uso, Self-service password reset não configurado`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Autenticação:** OAuth 2.0 com certificado (não client secret). Certificado armazenado no agent e registrado no Azure AD.

**Permissões:** Princípio de menor privilégio — apenas permissões de leitura (Read) são solicitadas.

**Dados:** Nomes de usuários e emails são coletados para identificar entidades afetadas — sujeito a LGPD/GDPR.

**Isolamento:** Cada tenant é independente; dados não são compartilhados entre workspaces.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Tempo de análise:** 2-5 minutos por tenant (dependendo do número de usuários e políticas)

**Rate limiting:** Graph API tem throttling — sistema implementa retry com backoff exponencial.

**Capacidade:** ~10 tenants por workspace.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Requer permissões de Global Reader ou equivalente no Azure AD
- Exchange Online PowerShell requer setup de RBAC específico (ExchangeManageAsApp)
- Algumas verificações dependem de licenças específicas (E3/E5, Defender, Intune)
- Rate limiting do Graph API pode atrasar análises em tenants grandes (>10k users)
- PIM e Conditional Access requerem Azure AD Premium P2`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Suporte a Google Workspace
- Relatórios de tendência de postura ao longo do tempo
- Remediação automatizada (com aprovação)
- Integração com Microsoft Defender XDR
- Benchmark CIS Microsoft 365`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      },
      {
        id: 'm365-analyzer',
        name: 'Analyzer',
        icon: 'Radar',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Detectar anomalias comportamentais no uso do Microsoft 365, identificando padrões de exfiltração de dados, movimentação lateral, abuso de permissões e atividades suspeitas.

**Problema que resolve:** Ameaças internas e contas comprometidas frequentemente operam dentro dos limites de permissões legítimas. O Analyzer detecta desvios do comportamento normal de cada usuário.

**Tipo de análise:** Baseline comportamental com detecção de anomalias (Z-Score).

**Dependências:**
- Tenant M365 conectado com permissões de Audit Log
- Histórico de pelo menos 7 dias para baseline inicial
- Edge Functions para processamento (m365-analyzer, m365-external-movement)`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Origem dos dados:** Microsoft Graph API — Audit Logs, Sign-in Logs, Activity Reports

**Tipo de conexão:** OAuth 2.0 (certificado) → Graph API

**Frequência:** Diário (configurável via m365_analyzer_schedules)

**Fluxo lógico:**
\`\`\`
Trigger (Agendamento diário)
  → Edge Function (trigger-m365-analyzer)
    → Obtém token OAuth
      → Coleta dados do período (últimas 24h)
        → Audit logs (mailbox, SharePoint, OneDrive, Teams)
        → Sign-in logs
        → Email activity reports
      → Processa contra baseline:
        → Calcula métricas por usuário
        → Compara com média histórica (30 dias)
        → Calcula Z-Score por métrica
        → Classifica anomalias
      → Salva analyzer_snapshot com insights
      → Detecta movimentação externa (m365-external-movement)
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Graph API endpoints:**
- /auditLogs/signIns — Logs de login
- /auditLogs/directoryAudits — Audit logs de diretório
- /security/alerts_v2 — Alertas de segurança
- /reports/getEmailActivityUserDetail — Atividade de email
- /reports/getOneDriveActivityUserDetail — Atividade OneDrive
- /reports/getSharePointActivityUserDetail — Atividade SharePoint
- /reports/getTeamsUserActivityUserDetail — Atividade Teams

**Métricas calculadas por usuário:**
- Emails enviados/recebidos (internos e externos)
- Arquivos acessados/compartilhados/baixados
- Volume de dados transferidos
- Logins por localização geográfica
- Horários de atividade
- Destinatários externos únicos
- Compartilhamentos externos criados`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Regras comportamentais (Z-Score):**
- Volume de emails enviados > 3σ da média do usuário → Possível exfiltração
- Downloads de arquivos > 3σ → Possível data hoarding
- Compartilhamentos externos > 3σ → Possível data leak
- Login de nova geolocalização → Alerta de segurança

**Regras de frequência:**
- Mais de 100 emails externos em 1 hora → Alerta
- Mais de 50 arquivos baixados em 30 minutos → Alerta
- Login de 2+ países em 1 hora (impossible travel) → Crítico

**Regras de correlação:**
- Conta comprometida: login anômalo + envio massivo de emails
- Insider threat: aumento gradual de downloads + novo compartilhamento externo
- Lateral movement: acesso a recursos não habituais + escalação de privilégio

**Movimentação Externa:**
- Emails para domínios nunca antes contatados
- Volume de dados para domínios externos > baseline
- Compartilhamento com contas pessoais (gmail, hotmail)`
          },
          {
            title: '📐 Modelo Matemático (Baseline Comportamental)',
            content: `**Este módulo implementa o modelo completo de baseline comportamental.**

**1. Construção do Baseline:**

Para cada usuário e cada métrica, o sistema mantém um baseline baseado nos últimos 30 dias de atividade.

**Média (μ):**
\`\`\`
μ = (Σ Xi) / N
\`\`\`
Onde Xi = valor da métrica no dia i, N = número de dias com dados (máx 30).

**Desvio Padrão (σ):**
\`\`\`
σ = √(Σ (Xi - μ)² / N)
\`\`\`

**2. Detecção de Anomalia:**

**Z-Score:**
\`\`\`
Z = (X_atual - μ) / σ
\`\`\`
Onde X_atual = valor observado no período atual.

**Classificação:**
| |Z| | Classificação | Ação |
|------|--------------|------|
| < 2 | **Normal** | Nenhuma — comportamento dentro do esperado |
| 2 ≤ |Z| < 3 | **Atenção** | Insight registrado para revisão |
| ≥ 3 | **Anomalia** | Alerta gerado, investigação recomendada |
| ≥ 5 | **Anomalia Crítica** | Alerta crítico, possível incidente |

**3. Tratamento de Edge Cases:**

- **σ = 0** (sem variação histórica): Qualquer desvio > 0 gera alerta
- **N < 7** (baseline insuficiente): Usa thresholds estáticos como fallback
- **Usuário novo**: Primeiros 7 dias usam médias globais da organização

**4. Janelas Temporais:**
- **Curto prazo:** 7 dias — detecta mudanças recentes
- **Longo prazo:** 30 dias — baseline estável
- **Peso:** Longo prazo tem peso 0.7, curto prazo 0.3

**5. Definições:**
- **Comportamento normal:** Atividade dentro de 2σ do baseline histórico do usuário
- **Desvio tolerável:** Atividade entre 2σ e 3σ — pode ser legítima (ex: fim de trimestre, projeto especial)
- **Anomalia estatística:** Atividade > 3σ — estatisticamente improvável sem causa especial
- **Falso positivo:** Desvio explicável por contexto (férias, mudança de função, projeto) — pode ser dismissado pelo analista`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:**
- Impossible travel detectado
- Exfiltração massiva (>3σ em múltiplas métricas simultâneas)
- Conta admin com comportamento anômalo

**Segurança:**
- Login de nova geolocalização
- Envio de emails para domínios suspeitos
- Compartilhamento externo de dados sensíveis

**Atenção:**
- Métricas entre 2σ e 3σ
- Aumento gradual de atividade externa
- Novos padrões de acesso

**Informativo:**
- Resumo diário de atividade
- Tendências de comportamento
- Novos usuários detectados`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**LGPD/GDPR:** Este módulo processa dados de atividade de usuários (emails, arquivos, logins) — requer consentimento ou base legal adequada.

**Minimização:** Apenas métricas agregadas são armazenadas, não conteúdo de emails ou arquivos.

**Retenção:** Baseline de 30 dias; insights de anomalias mantidos por 90 dias.

**Acesso:** Apenas workspace_admin e super_admin podem visualizar insights comportamentais.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Processamento:** ~30 segundos a 2 minutos por tenant (dependendo do número de usuários).

**Rate limiting:** Graph API — implementado retry com exponential backoff.

**Otimização:** Métricas pré-calculadas por usuário; cálculos de Z-Score são O(n) por métrica.

**Limite:** Recomendado até 10.000 usuários por tenant para processamento diário.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Audit logs do M365 podem ter latência de até 24 horas
- Baseline confiável requer mínimo de 7 dias de dados
- Usuários com atividade muito variável terão σ alto (menos sensibilidade)
- Impossible travel depende da precisão de geolocalização do Azure AD
- Não analisa conteúdo de emails/arquivos (apenas metadados e volumes)`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- UEBA (User and Entity Behavior Analytics) completo
- Machine learning para classificação de anomalias
- Correlação com incidents do Microsoft Defender
- Playbooks de resposta automatizada
- Peer group analysis (comparação com colegas de função)`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      },
      {
        id: 'm365-cves',
        name: 'CVEs',
        icon: 'ShieldCheck',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Monitorar CVEs que afetam produtos Microsoft 365 e correlacionar com as licenças e serviços em uso pelo tenant.

**Problema que resolve:** O ecossistema M365 tem múltiplos produtos (Exchange, SharePoint, Teams, Outlook, Office) cada um com seus próprios CVEs. Este módulo centraliza o monitoramento.

**Tipo de análise:** Cache sincronizado com correlação por produto/licença.

**Dependências:**
- cve_sources configuradas para módulo m365
- Licenças do tenant identificadas (m365-tenant-licenses)`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Fluxo:**
\`\`\`
Sync (agendamento)
  → Edge Function (m365-cves)
    → Consulta MSRC (Microsoft Security Response Center)
      → Parseia advisories
        → Salva em cve_cache (module_code: 'm365')
          → Correlaciona com licenças do tenant
            → Atualiza cve_severity_cache
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Fonte:** Microsoft Security Response Center (MSRC) API

**Campos:** cve_id, título, descrição, CVSS, produtos afetados, patches disponíveis.

**Correlação:** Produtos M365 em uso × CVEs que os afetam.`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `Similar ao módulo Firewall CVEs — priorização por CVSS e disponibilidade de patch.`
          },
          {
            title: '📐 Modelo Matemático',
            content: `Utiliza CVSS v3.1 das fontes oficiais. Mesmo modelo de risco agregado do módulo Firewall CVEs.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:** CVE com CVSS ≥ 9.0 em produto ativo do tenant
**Alto:** CVE com CVSS 7.0-8.9 sem patch aplicado
**Informativo:** Novo patch disponível, CVEs resolvidos`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `CVEs são públicos. Correlação com licenças é dado sensível — protegido por RLS.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `Cache centralizado. Sync periódico (~30s). Correlação é por tenant.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Depende da MSRC API estar disponível
- Correlação por produto requer mapeamento licença → produto correto
- Patches do M365 são frequentemente aplicados automaticamente (SaaS)`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Verificação de patch status real via Graph API
- Timeline de vulnerabilidade exposure
- Priorização baseada em EPSS`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      },
      {
        id: 'm365-entraid',
        name: 'Entra ID',
        icon: 'Shield',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Analisar a segurança do Azure AD (Entra ID) do tenant, incluindo configurações de usuários, MFA, aplicações registradas, service principals, conditional access e audit logs.

**Problema que resolve:** Entra ID é o plano de controle de identidade do M365. Configurações incorretas podem levar a comprometimento de contas, escalação de privilégios e acesso não autorizado.

**Tipo de análise:** Snapshot com insights categorizados.

**Dependências:** Tenant M365 conectado, permissões de Directory.Read.All, AuditLog.Read.All`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Fluxo:**
\`\`\`
Edge Function (entra-id-security-insights / entra-id-application-insights)
  → Graph API
    → Coleta usuários, apps, policies
      → Avalia contra regras de segurança
        → Gera insights categorizados
          → Retorna ao frontend
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Endpoints:**
- /users — Usuários, MFA status, last sign-in
- /applications — Apps registradas, permissões, secrets/certificates
- /servicePrincipals — Service principals e permissões
- /identity/conditionalAccess/policies — Políticas de CA
- /auditLogs/directoryAudits — Audit logs
- /auditLogs/signIns — Logs de sign-in

**Dados analisados:**
- Usuários sem MFA
- Admins globais sem Conditional Access
- Apps com permissões excessivas
- Service principals com secrets expirando
- Sign-ins de risco
- Stale accounts (sem login > 90 dias)`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Segurança de Identidade:**
- Todos os admins devem ter MFA → Crítico se falha
- Legacy authentication deve estar bloqueada → Alto
- Contas stale (>90 dias sem login) → Médio
- Guest users com permissões excessivas → Alto

**Aplicações:**
- Apps com Application.ReadWrite.All → Crítico
- Service principals com secrets expirando em <30 dias → Alto
- Apps sem owner definido → Médio
- Apps com redirect URIs inseguros (HTTP) → Alto

**Conditional Access:**
- Policy de MFA baseline → Crítico se ausente
- Block legacy auth policy → Alto se ausente
- Named locations configuradas → Médio
- Risk-based policies → Alto se ausentes`
          },
          {
            title: '📐 Modelo Matemático',
            content: `Score baseado em avaliação estática de insights. Cada insight tem peso e severidade. Score = soma ponderada de insights pass / total possível.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:** Admin global sem MFA, App com permissões de escrita global
**Alto:** Legacy auth não bloqueada, Stale admin accounts
**Médio:** Contas guest excessivas, Apps sem owner
**Baixo:** Naming conventions não seguidas`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**LGPD:** Coleta nomes e emails de usuários — necessário base legal. Dados armazenados apenas durante processamento (não persistidos em banco próprio para dados de usuários).`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Tempo:** 30s-2min dependendo do tamanho do tenant. Paginação automática para tenants grandes.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- PIM requer Azure AD Premium P2
- Conditional Access requer pelo menos Azure AD Premium P1
- Audit logs têm retenção limitada (7-30 dias conforme licença)
- Graph API throttling em tenants muito grandes`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Monitoramento contínuo de sign-ins de risco
- Integração com Azure AD Identity Protection
- Análise de access reviews compliance
- Detecção de shadow IT via app registrations`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      },
      {
        id: 'm365-exchange',
        name: 'Exchange Online',
        icon: 'Mail',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Avaliar a segurança e configuração do Exchange Online, incluindo regras de transporte, anti-spam, anti-phishing, DKIM, DMARC, Safe Links e Safe Attachments.

**Problema que resolve:** Email é o principal vetor de ataque. Configurações incorretas de Exchange Online podem permitir phishing, spoofing, exfiltração de dados via email e bypass de controles de segurança.

**Tipo de análise:** Snapshot via PowerShell e Graph API.

**Dependências:** 
- Tenant M365 com Exchange Online habilitado
- RBAC de Exchange configurado (ExchangeManageAsApp)
- Agent Python com módulo PowerShell`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Fluxo:**
\`\`\`
Edge Function (exchange-online-insights)
  → Agent executa PowerShell cmdlets
    → Coleta configurações de Exchange
      → Avalia contra regras de segurança
        → Gera insights categorizados
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**PowerShell cmdlets:**
- Get-TransportRule: Regras de transporte (mail flow)
- Get-HostedContentFilterPolicy: Políticas anti-spam
- Get-AntiPhishPolicy: Anti-phishing
- Get-DkimSigningConfig: DKIM
- Get-SafeLinksPolicy: Safe Links (Defender for Office 365)
- Get-SafeAttachmentPolicy: Safe Attachments
- Get-MalwareFilterPolicy: Anti-malware
- Get-OwaMailboxPolicy: Políticas OWA
- Get-SharingPolicy: Políticas de compartilhamento de calendário

**Verificações de DNS:**
- SPF (registro TXT)
- DMARC (registro TXT _dmarc)
- DKIM (registros CNAME selector1/selector2)`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Email Authentication:**
- SPF configurado com -all ou ~all → Crítico se ausente
- DMARC com policy reject ou quarantine → Alto se none
- DKIM habilitado para todos os domínios → Alto

**Anti-Spam/Phishing:**
- Anti-phishing policy ativa → Alto
- Mailbox Intelligence habilitado → Médio
- Spoof Intelligence ativo → Médio
- High Confidence Phishing action = Quarantine → Alto

**Proteção Avançada (Defender for O365):**
- Safe Links habilitado → Alto (se licença disponível)
- Safe Attachments habilitado → Alto
- ZAP (Zero-hour Auto Purge) ativo → Médio

**Regras de Transporte:**
- Regras que bypassam anti-spam → Crítico
- Regras de auto-forward para externo → Crítico
- Regras com exceções excessivas → Médio`
          },
          {
            title: '📐 Modelo Matemático',
            content: `Score baseado em avaliação estática de insights de configuração. Cada insight tem peso e severidade conforme padrão do sistema.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:** SPF ausente, Regra de forward externo encontrada, Anti-spam bypassado
**Alto:** DMARC none, Safe Links/Attachments ausentes, DKIM não configurado
**Médio:** ZAP desabilitado, Mailbox Intelligence off
**Informativo:** Configurações adequadas, novas regras de transporte detectadas`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Setup RBAC:** Requer configuração específica no Exchange Online (setup-exchange-rbac) para permitir acesso via certificado.

**Dados:** Configurações técnicas apenas — sem acesso a conteúdo de emails.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Tempo:** 30s-1min por tenant. PowerShell remoto tem overhead de conexão.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Safe Links/Attachments requerem licença Defender for Office 365
- PowerShell RBAC setup pode ser complexo (requer Global Admin inicialmente)
- Verificação de DKIM limitada a seletores padrão Microsoft (selector1, selector2)
- Regras de transporte complexas podem ter avaliação parcial`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Análise de mail flow rules complexas
- Verificação de quarantine policies
- Monitoramento de email threats em tempo real
- Integração com Microsoft Defender for Office 365 dashboard`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      }
    ]
  },
  {
    id: 'asset-management',
    name: 'Gestão de Ativos',
    modules: [
      {
        id: 'assets-overview',
        name: 'Visão Geral',
        icon: 'Server',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Centralizar o gerenciamento de todos os ativos monitorados pelo sistema — firewalls, domínios externos, tenants M365 — com controle de licenciamento e associação a workspaces.

**Problema que resolve:** Organizações precisam de visibilidade sobre todos os ativos sob monitoramento, seus status, licenças ativas, e a qual workspace/cliente pertencem.

**Tipo de análise:** CRUD operacional com controle de licenciamento.

**Dependências:**
- Tabelas: firewalls, external_domains, m365_tenants, clients, agents
- Licensing Hub para controle de quotas
- Módulos ativados por workspace`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Componentes:**

**Environment Page:** Página central que lista todos os ativos do workspace/sistema, organizados por tipo (Firewall, Domínio Externo, M365 Tenant).

**Licensing Hub:** Controle de licenças por workspace:
\`\`\`
Workspace → Módulos ativos → Quotas por módulo
  → Firewall: X licenças (Y em uso)
  → External Domain: X licenças (Y em uso)
  → M365: X licenças (Y em uso)
\`\`\`

**Fluxo de adição de ativo:**
\`\`\`
Usuário seleciona tipo de ativo
  → Verifica quota disponível no workspace
    → Preenche formulário específico do tipo
      → Valida dados (URL, domínio, credenciais)
        → Cria registro no banco
          → Associa ao agent (quando aplicável)
            → Ativo disponível para análise
\`\`\`

**Associação com Agents:**
- Firewalls: agent_id obrigatório (agent deve ter conectividade com firewall)
- External Domains: agent_id obrigatório (agent executa as coletas)
- M365 Tenants: agent_id para PowerShell, OAuth para Graph API`
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Dados gerenciados por tipo de ativo:**

**Firewalls:**
- Nome, URL da API, API Key/credenciais
- Serial number, versão de firmware
- Agent associado
- Último score, última análise
- Geolocalização (latitude/longitude)
- Device type (FortiGate modelo)

**Domínios Externos:**
- Nome, domínio (FQDN)
- Agent associado
- Último score, último scan
- Status (ativo/inativo)

**M365 Tenants:**
- Nome, Tenant ID, Client ID
- Tipo de autenticação (certificate/secret)
- Módulos habilitados (Graph, Exchange, SharePoint)
- Status de conexão
- Licenças detectadas`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Validação de entrada:**
- URLs devem ser HTTPS válidos
- Domínios devem ser FQDNs válidos
- Tenant IDs devem ser UUIDs válidos
- Agent deve estar ativo e não revogado

**Controle de licenciamento:**
- Verificação de quota antes de adicionar ativo
- Bloqueio de adição quando quota excedida
- Alertas quando uso > 80% da quota`
          },
          {
            title: '📐 Modelo Matemático',
            content: `N/A — Módulo operacional sem análise estatística.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Operacional:** Agent offline (last_seen > 5 min), Licença próxima do limite
**Informativo:** Novo ativo adicionado, Ativo removido`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Credenciais:** API keys e passwords são armazenados criptografados via Edge Functions dedicadas (manage-firewall-credentials). Frontend nunca tem acesso a credenciais em texto puro.

**RLS:** Cada ativo vinculado a client_id; acesso restrito por workspace.

**Auditoria:** Criação e modificação de ativos registrada com created_by e timestamps.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Limites recomendados por workspace:**
- Até 50 firewalls
- Até 100 domínios externos
- Até 10 tenants M365
- Até 20 agents

**Escalabilidade:** Limitada pelo plano de licenciamento, não por capacidade técnica.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Credenciais de firewall não são testadas na adição (validação é durante primeira análise)
- Licenciamento é controlado apenas no frontend atualmente (sem enforcement no banco)
- Remoção de ativo não remove histórico de análises (by design para auditoria)`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Auto-discovery de ativos na rede
- Importação em bulk via CSV
- Tags e categorização customizável
- Enforcement de licenciamento no banco via triggers
- Integração com CMDB externos`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      }
    ]
  },
  {
    id: 'dashboard',
    name: 'Dashboard Executivo',
    modules: [
      {
        id: 'dash-executive',
        name: 'Dashboard Geral',
        icon: 'LayoutDashboard',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Fornecer uma visão executiva consolidada do estado de segurança da organização, agregando scores de todos os módulos ativos.

**Problema que resolve:** Gestores precisam de uma visão rápida e de alto nível sobre a postura de segurança, sem navegar em cada módulo individualmente.

**Tipo de análise:** Agregação de dados existentes.

**Dependências:** Todos os módulos ativos contribuem com scores e métricas.`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Fluxo:**
\`\`\`
Dashboard Page
  → Hook useDashboardStats()
    → Consulta Supabase (RLS por client_id)
      → firewalls: count, avg(last_score)
      → external_domains: count, avg(last_score)
      → m365_tenants: count, posture scores
      → cve_severity_cache: contadores por severidade
      → Últimas análises por módulo
    → Calcula score geral ponderado
    → Renderiza cards e sparklines
\`\`\`

**Score Geral:**
\`\`\`
Score_geral = Σ (peso_módulo × score_módulo) / Σ peso_módulo
\`\`\`

Pesos padrão: Firewall=3, M365=3, External Domain=2

**Componentes visuais:**
- ScoreGauge: Velocímetro com score geral
- StatCards: Métricas por módulo (ativos, score, CVEs)
- ScoreSparkline: Tendência de score nos últimos 30 dias
- Alertas recentes cross-módulo`
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Fontes:** Dados pré-calculados nos módulos. Dashboard não coleta dados novos — apenas agrega.

**Consultas:**
- firewalls: count(), avg(last_score), max(last_analysis_at)
- external_domains: count(), avg(last_score)
- cve_severity_cache: critical, high, medium, low counts
- analysis_history: últimos N registros para sparkline`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `N/A — Dashboard é apenas visualização. Não avalia regras próprias.`
          },
          {
            title: '📐 Modelo Matemático',
            content: `**Score Geral:**
\`\`\`
Score = Σ (w_i × s_i) / Σ w_i
\`\`\`
Onde w_i = peso do módulo, s_i = score médio do módulo.

**Classificação visual:** Mesmo padrão (0-29 Crítico, 30-49 Ruim, 50-69 Regular, 70-89 Bom, 90-100 Excelente)`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `Dashboard exibe alertas de todos os módulos, priorizados por severidade e recência.`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `Dados filtrados por RLS — cada workspace vê apenas seus dados. Super admin vê dados agregados de todos os workspaces.`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Otimização:** Queries com índices em client_id. Sparkline usa dados pré-calculados (não reprocessa análises).

**Cache:** React Query com staleTime de 5 minutos para evitar queries excessivas.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Score geral só é preciso quando todos os módulos têm análises recentes
- Sparkline depende de análises regulares (gaps se análises são esporádicas)
- Não possui drill-down direto para findings individuais (navega para módulo)`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Dashboards customizáveis (widgets drag-and-drop)
- Relatório executivo exportável em PDF
- Comparação temporal (mês a mês)
- Benchmarking anônimo entre organizações similares`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      }
    ]
  },
  {
    id: 'authentication',
    name: 'Autenticação',
    modules: [
      {
        id: 'auth-system',
        name: 'Sistema de Autenticação',
        icon: 'Lock',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Gerenciar autenticação, autorização e controle de acesso multi-tenant para toda a plataforma.

**Problema que resolve:** Plataforma multi-tenant com diferentes níveis de acesso (super admin, workspace admin, user) precisa de controle granular e seguro.

**Tipo de análise:** N/A — sistema de autenticação.

**Dependências:** Supabase Auth, PostgreSQL RLS`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Stack de autenticação:**
\`\`\`
Frontend (React)
  → Supabase Auth Client (supabase-js)
    → Supabase Auth Service
      → PostgreSQL (auth.users)
        → RLS policies por tabela
          → user_roles (role-based access)
            → profiles (user metadata)
              → client_users (workspace association)
\`\`\`

**Roles (RBAC):**

| Role | Escopo | Permissões |
|------|--------|-----------|
| super_admin | Global | Acesso total, gerenciamento de workspaces, administração do sistema |
| super_suporte | Global | Visualização de todos os workspaces, sem modificação |
| workspace_admin | Workspace | Gerenciamento de usuários e ativos do workspace |
| user | Workspace | Visualização de dados do workspace |

**Tabelas de autenticação:**
- \`auth.users\`: Gerenciada pelo Supabase Auth
- \`profiles\`: Metadados do usuário (nome, client_id)
- \`user_roles\`: Tabela separada de roles (segurança contra escalação)
- \`client_users\`: Associação usuário ↔ workspace

**IMPORTANTE:** Roles são armazenados em tabela separada (user_roles), NUNCA na tabela profiles. Isso previne ataques de escalação de privilégio via manipulação de perfil.`
          },
          {
            title: '📡 Coleta de Dados',
            content: `N/A — sistema de autenticação não coleta dados de análise.

**Dados gerenciados:**
- Credenciais de usuário (hash bcrypt via Supabase Auth)
- Tokens JWT (emitidos pelo Supabase Auth)
- Sessões ativas
- Logs de autenticação`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**RLS (Row Level Security):**

Cada tabela com dados de negócio tem políticas RLS que verificam:
1. \`auth.uid()\` — ID do usuário autenticado
2. \`has_role(auth.uid(), 'role')\` — Função de verificação de role (SECURITY DEFINER)
3. \`client_id\` — Filtro por workspace

**Função has_role (SECURITY DEFINER):**
\`\`\`sql
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
\`\`\`

A flag SECURITY DEFINER é essencial para evitar recursão infinita nas políticas RLS.

**Exemplo de política:**
\`\`\`sql
CREATE POLICY "Users see own workspace data"
ON public.firewalls
FOR SELECT TO authenticated
USING (
  client_id IN (
    SELECT client_id FROM profiles WHERE id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin')
);
\`\`\``
          },
          {
            title: '📐 Modelo Matemático',
            content: `N/A — sistema de autenticação sem modelo estatístico.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Segurança:** Tentativa de acesso a recurso sem permissão (403), múltiplas tentativas de login falhadas
**Operacional:** Sessão expirada, token inválido
**Informativo:** Novo usuário criado, role alterado`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Senhas:** Hash bcrypt gerenciado pelo Supabase Auth — nunca armazenadas em texto puro.

**Tokens:** JWT com expiração configurável. Refresh tokens para renovação.

**MFA:** Suportado via Supabase Auth (TOTP).

**Auditoria:** admin_activity_logs registram todas as ações administrativas com IP, user agent, e detalhes.

**LGPD:**
- Dados pessoais: nome, email — mínimo necessário
- Direito ao esquecimento: suportado via exclusão de conta
- Portabilidade: dados exportáveis via API

**Prevenção de escalação:**
- Roles em tabela separada com SECURITY DEFINER
- Frontend NUNCA determina permissões — sempre verificação server-side via RLS
- Tokens JWT não contêm role (role verificado via banco em cada request)`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**JWT:** Stateless — não requer lookup de sessão a cada request. Role verificado via RLS no banco.

**Conexões:** Pool de conexões gerenciado pelo Supabase.

**Limite:** Sem limite prático de usuários (Supabase Auth escala horizontalmente).`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- MFA não é enforced por política (cada usuário habilita individualmente)
- Não há SSO (SAML/OIDC) nativo — requer Supabase Pro
- Password policy básica (mínimo 6 caracteres pelo Supabase)
- Audit logs de autenticação dependem da retenção do Supabase`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- SSO com SAML 2.0 / OIDC para clientes enterprise
- Passwordless authentication (magic link, WebAuthn)
- MFA enforced por policy de workspace
- Session management avançado (revogar sessões remotamente)
- IP allowlist por workspace`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      }
    ]
  },
  {
    id: 'integrations',
    name: 'Integrações',
    modules: [
      {
        id: 'int-overview',
        name: 'Visão Geral de Integrações',
        icon: 'Zap',
        version: '1.0.0',
        lastUpdated: '2026-03-03',
        sections: [
          {
            title: '📋 Visão Geral',
            content: `**Objetivo:** Documentar todas as integrações do sistema — como componentes internos se comunicam e como sistemas externos são conectados.

**Componentes principais:**
1. **Frontend (React SPA)** — Interface do usuário
2. **Supabase** — Backend-as-a-Service (Auth, Database, Edge Functions, Realtime)
3. **Agent Python** — Executor de tarefas em rede local do cliente
4. **Supervisor** — Gerenciador do Agent (auto-update, watchdog)
5. **APIs Externas** — FortiGate, Microsoft Graph, NVD, FortiGuard, DeHashed`
          },
          {
            title: '🏗️ Arquitetura Técnica',
            content: `**Diagrama de componentes:**
\`\`\`
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (React)                   │
│  React + Vite + TailwindCSS + React Query           │
│  Preview: lovable.app | Prod: custom domain         │
└──────────────┬──────────────────────────────────────┘
               │ HTTPS (Supabase JS Client)
               ▼
┌─────────────────────────────────────────────────────┐
│                   SUPABASE CLOUD                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │   Auth   │ │ Realtime │ │  Edge Functions  │    │
│  └──────────┘ └──────────┘ │  (Deno Runtime)  │    │
│  ┌──────────────────────┐  │  50+ functions    │    │
│  │  PostgreSQL + RLS    │  └────────┬─────────┘    │
│  │  Tables, Views, RPC  │           │              │
│  └──────────────────────┘           │              │
└─────────────────────────────────────┼──────────────┘
                                      │ HTTPS
               ┌──────────────────────┼──────────────┐
               │                      ▼              │
               │  ┌──────────────────────────┐       │
               │  │    SUPERVISOR (Python)    │       │
               │  │  - Watchdog do Agent      │       │
               │  │  - Auto-update            │       │
               │  │  - Heartbeat              │       │
               │  └──────────┬───────────────┘       │
               │             │                        │
               │  ┌──────────▼───────────────┐       │
               │  │     AGENT (Python)        │       │
               │  │  - Executa tarefas        │       │
               │  │  - Coleta de dados        │       │
               │  │  - Executors modulares    │       │
               │  └──────────┬───────────────┘       │
               │             │                        │
               │  REDE LOCAL DO CLIENTE              │
               └──────────────┼──────────────────────┘
                              │
               ┌──────────────▼──────────────┐
               │     ATIVOS MONITORADOS       │
               │  - FortiGate (REST API)      │
               │  - M365 (Graph API)          │
               │  - Domínios (DNS/HTTP)       │
               └─────────────────────────────┘
\`\`\``
          },
          {
            title: '📡 Coleta de Dados',
            content: `**Supabase Edge Functions (50+):**

Responsáveis por:
- Orquestração de tarefas (trigger-*, agent-tasks)
- Processamento de resultados (agent-task-result, agent-step-result)
- Integrações com APIs externas (m365-*, fortigate-*, dehashed-*)
- Gestão de credenciais (manage-firewall-credentials, manage-api-keys)
- Autenticação de agents (register-agent, agent-heartbeat)

**Agent Python — Executors modulares:**

| Executor | Função |
|----------|--------|
| http_request | Requests HTTP/HTTPS (FortiGate API) |
| http_session | Sessão HTTP persistente com cookies |
| httpx_executor | HTTP client avançado (async) |
| dns_query | Consultas DNS (dig) |
| nmap | Port scanning com Nmap |
| masscan | Fast port scanning |
| snmp | Consultas SNMP |
| ssh | Execução de comandos via SSH |
| powershell | Execução de scripts PowerShell |
| amass | Enumeração de subdomínios |
| asn_classifier | Classificação de ASN |
| nmap_discovery | Descoberta de hosts na rede |

**Supervisor:**
- Monitora processo do Agent via systemd
- Verifica atualizações periodicamente
- Reinicia Agent automaticamente em caso de falha
- Reporta versão e status via heartbeat`
          },
          {
            title: '⚙️ Motor de Regras',
            content: `**Comunicação Agent ↔ Supabase:**

1. Agent registra-se via \`register-agent\` (activation code)
2. Recebe JWT exclusivo para autenticação
3. Poll periódico via \`agent-tasks\` para novas tarefas
4. Executa tarefas e envia resultados via \`agent-step-result\` / \`agent-task-result\`
5. Heartbeat periódico via \`agent-heartbeat\`

**Realtime (Comandos remotos):**
- Supabase Realtime para shell remoto (agent_commands)
- Agent monitora canal Realtime para comandos em tempo real
- Resultados enviados de volta via Realtime

**Auto-update do Agent:**
\`\`\`
Supervisor verifica periodicamente
  → Edge Function (get-release-url) retorna última versão
    → Se versão > atual:
      → Download do novo pacote
      → Backup do Agent atual
      → Instala nova versão
      → Reinicia Agent
      → Heartbeat com nova versão
\`\`\``
          },
          {
            title: '📐 Modelo Matemático',
            content: `N/A — módulo de integrações sem modelo estatístico.`
          },
          {
            title: '🚨 Tipos de Alertas',
            content: `**Crítico:** Agent offline por mais de 30 minutos, Edge Function com erro persistente
**Operacional:** Agent reiniciado, atualização aplicada, conectividade intermitente
**Informativo:** Novo agent registrado, versão atualizada, tarefa completada`
          },
          {
            title: '🔒 Segurança e Compliance',
            content: `**Autenticação de Agents:**
- Cada agent tem JWT exclusivo (gerado no registro)
- JWT usado para autenticar chamadas às Edge Functions
- Agents podem ser revogados (campo revoked)

**Edge Functions:**
- Validam JWT em cada request
- Verificam permissões antes de executar
- Rate limiting implícito do Supabase

**Comunicação:**
- Toda comunicação é HTTPS (TLS 1.2+)
- Agent → Supabase: HTTPS
- Agent → FortiGate: HTTPS (verificação de certificado configurável)
- Agent → M365: HTTPS (OAuth 2.0)`
          },
          {
            title: '📊 Performance e Escalabilidade',
            content: `**Edge Functions:** Serverless — escalam automaticamente conforme demanda.

**Agents:** Cada agent é single-threaded para tarefas (uma por vez). Escalabilidade horizontal via mais agents.

**Database:** Supabase managed PostgreSQL com connection pooling.

**Realtime:** WebSocket connections para shell remoto — limitado pelo plano Supabase.`
          },
          {
            title: '⚠️ Limitações Conhecidas',
            content: `- Edge Functions têm timeout de 60 segundos (análises longas são delegadas ao Agent)
- Agents em redes com proxy precisam de configuração adicional
- Realtime tem limite de conexões simultâneas pelo plano Supabase
- Auto-update do Agent requer Agent não estar processando tarefa
- PowerShell executor requer PowerShell 7+ instalado no sistema do Agent`
          },
          {
            title: '🗺️ Roadmap Técnico',
            content: `- Webhook notifications para eventos do sistema
- API REST pública para integrações externas
- SDK para desenvolvimento de executors customizados
- Integração com Terraform para provisionamento
- Support para agents em containers (Docker)
- Message queue (RabbitMQ/Redis) para comunicação de alta performance`
          }
        ],
        changelog: [
          { version: '1.0.0', date: '2026-03-03', changes: ['Documentação inicial criada'] }
        ]
      }
    ]
  }
];
