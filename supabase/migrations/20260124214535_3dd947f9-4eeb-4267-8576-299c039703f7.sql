
-- =============================================================
-- ENRIQUECER COLETA E COMPLIANCE DO SONICWALL
-- =============================================================

-- 1. ATUALIZAR BLUEPRINT DO SONICWALL COM NOVOS ENDPOINTS
-- =============================================================

UPDATE device_blueprints
SET collection_steps = '{
  "steps": [
    {
      "id": "auth_login",
      "executor": "http_session",
      "config": {
        "action": "login",
        "method": "POST",
        "path": "/api/sonicos/auth",
        "basic_auth": true,
        "verify_ssl": false,
        "headers": {
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      }
    },
    {
      "id": "version",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/version",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "interfaces",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/interfaces/ipv4",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "access_rules",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/access-rules/ipv4",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "gateway_av",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/gateway-anti-virus",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "ips",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/intrusion-prevention",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "anti_spyware",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/anti-spyware",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "app_control",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/app-control",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "content_filter",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/content-filter",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "geo_ip",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/geo-ip-filter",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "botnet",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/botnet-filter",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "nat_policies",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/nat-policies/ipv4",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "vpn_ssl",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/vpn/ssl",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "vpn_ipsec",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/vpn/policies",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "zones",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/zones",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "log_settings",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/log/settings",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "administration",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/administration",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "licenses",
      "executor": "http_session",
      "config": {
        "action": "request",
        "method": "GET",
        "path": "/api/sonicos/licenses",
        "headers": { "Accept": "application/json" }
      }
    },
    {
      "id": "auth_logout",
      "executor": "http_session",
      "config": {
        "action": "logout",
        "method": "DELETE",
        "path": "/api/sonicos/auth"
      }
    }
  ]
}'::jsonb,
updated_at = now()
WHERE id = 'f1c656c0-75ed-43c6-b0a3-696498833094';

-- 2. INSERIR 18 NOVAS REGRAS DE COMPLIANCE
-- =============================================================

-- SEGURANÇA DE PERÍMETRO (UTM)
INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, pass_description, fail_description, recommendation)
VALUES
-- Gateway Antivírus
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_GAV_ENABLED', 'Gateway Antivírus Ativo', 
 'Verifica se o Gateway Antivírus está habilitado para inspeção de tráfego',
 'Segurança de Perímetro', 'high', 3,
 '{"type": "field_check", "data_source": "gateway_av", "field_path": "gateway_anti_virus.enable", "operator": "equals", "expected_value": true}'::jsonb,
 'Gateway Antivírus está ativo e protegendo o tráfego',
 'Gateway Antivírus está desabilitado, deixando a rede vulnerável a malware',
 'Habilite o Gateway Antivírus em Security Services > Gateway Anti-Virus'),

-- IPS
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_IPS_ENABLED', 'Prevenção de Intrusão Ativa',
 'Verifica se o IPS (Intrusion Prevention System) está habilitado',
 'Segurança de Perímetro', 'high', 3,
 '{"type": "field_check", "data_source": "ips", "field_path": "intrusion_prevention.enable", "operator": "equals", "expected_value": true}'::jsonb,
 'IPS está ativo e protegendo contra ataques',
 'IPS está desabilitado, deixando a rede vulnerável a exploits',
 'Habilite o IPS em Security Services > Intrusion Prevention'),

-- Anti-Spyware
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_ANTISPYWARE_ENABLED', 'Anti-Spyware Ativo',
 'Verifica se o serviço Anti-Spyware está habilitado',
 'Segurança de Perímetro', 'high', 3,
 '{"type": "field_check", "data_source": "anti_spyware", "field_path": "anti_spyware.enable", "operator": "equals", "expected_value": true}'::jsonb,
 'Anti-Spyware está ativo e bloqueando ameaças',
 'Anti-Spyware está desabilitado',
 'Habilite o Anti-Spyware em Security Services > Anti-Spyware'),

-- App Control
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_APPCONTROL_ENABLED', 'Controle de Aplicações Ativo',
 'Verifica se o App Control está habilitado para visibilidade de aplicações',
 'Segurança de Perímetro', 'medium', 2,
 '{"type": "field_check", "data_source": "app_control", "field_path": "app_control.enable", "operator": "equals", "expected_value": true}'::jsonb,
 'Controle de Aplicações está ativo',
 'Controle de Aplicações está desabilitado, sem visibilidade de apps',
 'Habilite App Control em Security Services > App Control'),

-- Content Filter
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_CONTENTFILTER_ENABLED', 'Filtro de Conteúdo Ativo',
 'Verifica se o Content Filter está habilitado',
 'Segurança de Perímetro', 'medium', 2,
 '{"type": "field_check", "data_source": "content_filter", "field_path": "content_filter.enable", "operator": "equals", "expected_value": true}'::jsonb,
 'Filtro de Conteúdo está ativo',
 'Filtro de Conteúdo está desabilitado',
 'Habilite Content Filter em Security Services > Content Filter');

-- POLÍTICAS DE SEGURANÇA
INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, pass_description, fail_description, recommendation)
VALUES
-- Regras Any-Any
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_ANY_ANY_RULES', 'Regras "Any-Any" Detectadas',
 'Verifica se existem regras excessivamente permissivas com source e destination "any"',
 'Políticas de Segurança', 'critical', 5,
 '{"type": "array_none_match", "data_source": "access_rules", "field_path": "access_rules", "conditions": [{"field": "source.any", "operator": "equals", "value": true}, {"field": "destination.any", "operator": "equals", "value": true}, {"field": "service.any", "operator": "equals", "value": true}, {"field": "action", "operator": "equals", "value": "allow"}]}'::jsonb,
 'Não foram encontradas regras any-any permissivas',
 'Existem regras any-any que permitem qualquer tráfego',
 'Revise e restrinja regras com source/destination/service = any'),

-- RDP Exposto
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_RDP_EXPOSED', 'RDP Exposto para Internet',
 'Verifica se existem regras permitindo RDP (porta 3389) da WAN',
 'Políticas de Segurança', 'critical', 5,
 '{"type": "array_none_match", "data_source": "access_rules", "field_path": "access_rules", "conditions": [{"field": "source.zone", "operator": "equals", "value": "WAN"}, {"field": "service.port", "operator": "contains", "value": "3389"}, {"field": "action", "operator": "equals", "value": "allow"}]}'::jsonb,
 'RDP não está exposto para a internet',
 'RDP (porta 3389) está acessível da internet',
 'Remova regras que expõem RDP para WAN ou use VPN'),

-- SMB Exposto
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_SMB_EXPOSED', 'SMB Exposto para Internet',
 'Verifica se existem regras permitindo SMB (portas 445/139) da WAN',
 'Políticas de Segurança', 'critical', 5,
 '{"type": "array_none_match", "data_source": "access_rules", "field_path": "access_rules", "conditions": [{"field": "source.zone", "operator": "equals", "value": "WAN"}, {"field": "service.port", "operator": "in", "value": ["445", "139"]}, {"field": "action", "operator": "equals", "value": "allow"}]}'::jsonb,
 'SMB não está exposto para a internet',
 'SMB (portas 445/139) está acessível da internet',
 'Bloqueie SMB da WAN - este protocolo nunca deve ser exposto à internet');

-- VPN
INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, pass_description, fail_description, recommendation)
VALUES
-- Criptografia IPsec
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_IPSEC_CRYPTO', 'Criptografia IPsec Forte',
 'Verifica se os túneis VPN IPsec usam criptografia forte (AES-256)',
 'VPN', 'high', 3,
 '{"type": "array_all_match", "data_source": "vpn_ipsec", "field_path": "vpn.policies", "conditions": [{"field": "proposal.encryption", "operator": "in", "value": ["aes-256", "aes-256-gcm"]}], "allow_empty": true}'::jsonb,
 'Todos os túneis IPsec usam criptografia AES-256',
 'Existem túneis VPN com criptografia fraca',
 'Configure todos os túneis IPsec para usar AES-256 ou AES-256-GCM'),

-- SSL VPN
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_SSLVPN_ENABLED', 'SSL VPN Configurado',
 'Verifica se o SSL VPN está configurado para acesso remoto seguro',
 'VPN', 'medium', 2,
 '{"type": "field_check", "data_source": "vpn_ssl", "field_path": "ssl_vpn.enable", "operator": "equals", "expected_value": true}'::jsonb,
 'SSL VPN está configurado e disponível',
 'SSL VPN não está configurado',
 'Configure SSL VPN para acesso remoto seguro dos usuários');

-- SISTEMA E ADMINISTRAÇÃO
INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, pass_description, fail_description, recommendation)
VALUES
-- HTTPS Admin
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_HTTPS_ADMIN', 'Gerência via HTTPS Obrigatória',
 'Verifica se a administração está restrita a HTTPS (HTTP desabilitado)',
 'Administração', 'critical', 5,
 '{"type": "field_check", "data_source": "administration", "field_path": "administration.web_management.http.enable", "operator": "equals", "expected_value": false}'::jsonb,
 'Administração via HTTP está desabilitada',
 'Administração via HTTP está habilitada (inseguro)',
 'Desabilite HTTP e use apenas HTTPS para gerenciamento'),

-- SSH Timeout
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_SSH_TIMEOUT', 'Timeout de Sessão Admin',
 'Verifica se existe timeout configurado para sessões administrativas',
 'Administração', 'medium', 2,
 '{"type": "field_check", "data_source": "administration", "field_path": "administration.session_timeout", "operator": "greater_than", "expected_value": 0}'::jsonb,
 'Timeout de sessão administrativa está configurado',
 'Sessões administrativas não expiram automaticamente',
 'Configure timeout de sessão em System > Administration'),

-- Syslog
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_SYSLOG_ENABLED', 'Envio de Logs para Syslog',
 'Verifica se os logs estão sendo enviados para um servidor Syslog externo',
 'Auditoria', 'medium', 2,
 '{"type": "array_any_match", "data_source": "log_settings", "field_path": "log.syslog.servers", "conditions": [{"field": "enable", "operator": "equals", "value": true}], "allow_empty": false}'::jsonb,
 'Logs estão sendo enviados para servidor Syslog',
 'Não há servidor Syslog configurado',
 'Configure um servidor Syslog para centralização de logs');

-- LICENCIAMENTO
INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, pass_description, fail_description, recommendation)
VALUES
-- Licenças de Segurança
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_LICENSE_ACTIVE', 'Licenças de Segurança Ativas',
 'Verifica se as licenças de segurança (GAV, IPS, etc) estão ativas',
 'Licenciamento', 'high', 4,
 '{"type": "field_check", "data_source": "licenses", "field_path": "licenses.security_services.status", "operator": "equals", "expected_value": "licensed"}'::jsonb,
 'Licenças de segurança estão ativas',
 'Licenças de segurança expiradas ou inativas',
 'Renove as licenças de Security Services'),

-- Suporte Ativo
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_SUPPORT_ACTIVE', 'Contrato de Suporte Ativo',
 'Verifica se o contrato de suporte está ativo para receber atualizações',
 'Licenciamento', 'critical', 5,
 '{"type": "field_check", "data_source": "licenses", "field_path": "licenses.support.status", "operator": "equals", "expected_value": "licensed"}'::jsonb,
 'Contrato de suporte está ativo',
 'Contrato de suporte expirado',
 'Renove o contrato de suporte para receber atualizações de firmware e assinaturas');

-- ZONAS E INTERFACES
INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, pass_description, fail_description, recommendation)
VALUES
-- Serviços de Segurança por Zona
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_ZONE_SECURITY', 'Serviços de Segurança nas Zonas',
 'Verifica se as zonas críticas têm serviços de segurança habilitados',
 'Zonas e Interfaces', 'high', 3,
 '{"type": "array_all_match", "data_source": "zones", "field_path": "zones", "conditions": [{"field": "security_type", "operator": "not_equals", "value": "trusted"}], "filter": {"field": "name", "operator": "in", "value": ["WAN", "DMZ"]}}'::jsonb,
 'Zonas críticas têm serviços de segurança configurados',
 'Algumas zonas não têm proteção adequada',
 'Configure GAV, IPS e Anti-Spyware nas zonas WAN e DMZ'),

-- Stealth Mode
('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'SW_STEALTH_MODE', 'Modo Stealth nas Interfaces WAN',
 'Verifica se as interfaces WAN estão em modo stealth (não respondem a ping)',
 'Zonas e Interfaces', 'medium', 2,
 '{"type": "array_all_match", "data_source": "interfaces", "field_path": "interfaces", "conditions": [{"field": "management.ping", "operator": "equals", "value": false}], "filter": {"field": "zone", "operator": "equals", "value": "WAN"}}'::jsonb,
 'Interfaces WAN estão em modo stealth',
 'Interfaces WAN respondem a ping (fingerprinting possível)',
 'Desabilite ping nas interfaces WAN para evitar reconhecimento');
