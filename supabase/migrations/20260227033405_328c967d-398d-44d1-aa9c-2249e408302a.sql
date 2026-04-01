
-- ============================================================
-- FASE 1: Add 5 new steps to FortiGate Agent blueprint
-- ============================================================

UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[
    {
      "id": "monitor_certificates",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/system/available-certificates",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    },
    {
      "id": "monitor_vpn_ipsec",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/vpn/ipsec",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    },
    {
      "id": "monitor_fortiguard_server",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/system/fortiguard/server-info",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    },
    {
      "id": "monitor_performance",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/system/performance/status",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    },
    {
      "id": "monitor_security_rating",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/system/security-rating",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    }
  ]'::jsonb
),
updated_at = now()
WHERE id = '1130a1f7-9e04-4df8-9c12-50f86066611b';

-- ============================================================
-- FASE 1: Create 5 new compliance rules
-- ============================================================

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint) VALUES

('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6',
 'cert-001',
 'Certificados SSL Válidos',
 'Verifica se todos os certificados instalados no appliance estão válidos e não expirados.',
 'Certificados',
 'high',
 3,
 '{"source_key": "monitor_certificates", "type": "array_check", "path": "results", "condition": "none_match", "field": "status", "value": "expired", "logic": "Nenhum certificado deve ter status expired"}',
 'Renove os certificados expirados imediatamente. Acesse System > Certificates no FortiGate para verificar e substituir certificados vencidos.',
 'Todos os certificados instalados estão válidos e dentro do prazo de validade.',
 'Foram encontrados certificados expirados no appliance. Certificados expirados podem causar falhas em VPN, HTTPS inspection e autenticação.',
 'Não foi possível consultar os certificados do appliance. Verifique as permissões da API key.',
 'Certificados expirados podem causar falhas silenciosas em conexões TLS, VPN SSL e deep inspection, além de alertas nos navegadores dos usuários.',
 'Serviços que dependem de certificados válidos (VPN, captive portal, HTTPS inspection) podem parar de funcionar, causando interrupção operacional.',
 '/api/v2/monitor/system/available-certificates'),

('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6',
 'vpn-004',
 'Túneis IPsec Ativos',
 'Verifica se todos os túneis IPsec configurados estão com status UP.',
 'Configuração VPN',
 'critical',
 4,
 '{"source_key": "monitor_vpn_ipsec", "type": "array_check", "path": "results", "condition": "all_match", "field": "incoming_bytes", "operator": "gt", "value": 0, "alt_condition": "none_match", "alt_field": "status", "alt_value": "down", "logic": "Todos os túneis IPsec configurados devem estar UP"}',
 'Verifique a conectividade e as configurações dos túneis IPsec inoperantes. Confirme se o peer remoto está acessível e se as chaves pré-compartilhadas ou certificados estão corretos.',
 'Todos os túneis IPsec configurados estão ativos e operacionais.',
 'Foram detectados túneis IPsec inoperantes (down). Isso indica perda de conectividade site-to-site.',
 'Não foi possível consultar o status dos túneis IPsec. Verifique se existem túneis configurados.',
 'Túneis IPsec down indicam perda de conectividade entre sites, o que pode afetar replicação de dados, acesso a recursos compartilhados e comunicação entre filiais.',
 'A interrupção de túneis VPN pode paralisar operações entre filiais, impedir acesso a sistemas centralizados e comprometer a continuidade do negócio.',
 '/api/v2/monitor/vpn/ipsec'),

('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6',
 'fg-001',
 'Definições FortiGuard Atualizadas',
 'Verifica se as definições de segurança do FortiGuard (AV, IPS, Web Filter) estão atualizadas.',
 'Atualizações e Firmware',
 'high',
 3,
 '{"source_key": "monitor_fortiguard_server", "type": "object_check", "path": "results", "condition": "field_exists", "field": "connected", "expected_value": true, "logic": "O FortiGate deve estar conectado ao FortiGuard e com definições atualizadas"}',
 'Verifique a conectividade do FortiGate com os servidores FortiGuard. Confirme que as portas 443/53 estão liberadas para saída e que o DNS está funcional.',
 'O FortiGate está conectado ao FortiGuard e recebendo atualizações de definições de segurança.',
 'O FortiGate não está conectado ao FortiGuard ou as definições de segurança estão desatualizadas. Isso compromete a eficácia do AV, IPS e Web Filter.',
 'Não foi possível consultar o status do FortiGuard. Verifique as permissões da API key.',
 'Sem atualizações do FortiGuard, as assinaturas de antivírus, IPS e filtro web ficam obsoletas, deixando o firewall vulnerável a ameaças recentes.',
 'Definições de segurança desatualizadas significam que malware recente, exploits conhecidos e URLs maliciosas podem não ser detectados, expondo a rede a ataques.',
 '/api/v2/monitor/system/fortiguard/server-info'),

('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6',
 'perf-001',
 'Performance de CPU e Memória',
 'Verifica se o uso de CPU e memória do appliance está dentro de limites seguros (abaixo de 90%).',
 'Sistema',
 'high',
 3,
 '{"source_key": "monitor_performance", "type": "threshold_check", "path": "results", "checks": [{"field": "cpu", "operator": "lt", "value": 90, "label": "CPU"}, {"field": "mem", "operator": "lt", "value": 90, "label": "Memória"}], "logic": "CPU e memória devem estar abaixo de 90% de utilização"}',
 'Investigue os processos com alto consumo de recursos. Considere otimizar regras de firewall, desativar funcionalidades não utilizadas ou fazer upgrade do hardware.',
 'O uso de CPU e memória está dentro dos limites seguros (abaixo de 90%).',
 'O appliance está com uso elevado de CPU ou memória (acima de 90%). Isso pode causar degradação de performance, perda de pacotes e instabilidade.',
 'Não foi possível consultar as métricas de performance do appliance.',
 'Uso excessivo de recursos pode causar latência elevada, perda de pacotes, falhas em deep inspection e instabilidade geral do appliance.',
 'Degradação de performance no firewall afeta diretamente a experiência dos usuários, pode causar timeouts em aplicações críticas e reduzir a capacidade de inspeção de segurança.',
 '/api/v2/monitor/system/performance/status'),

('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6',
 'sec-004',
 'Security Rating FortiGuard',
 'Verifica o score de segurança calculado internamente pelo FortiGate através do FortiGuard Security Rating.',
 'Políticas de Segurança',
 'medium',
 2,
 '{"source_key": "monitor_security_rating", "type": "object_check", "path": "results", "condition": "field_exists", "field": "overall_score", "logic": "O FortiGate deve ter o Security Rating habilitado e com score disponível"}',
 'Habilite o FortiGuard Security Rating em Security Fabric > Security Rating. Execute o teste periodicamente para identificar pontos de melhoria recomendados pelo fabricante.',
 'O FortiGuard Security Rating está habilitado e o appliance possui um score de segurança calculado.',
 'O FortiGuard Security Rating não está disponível ou não foi executado. Este recurso fornece recomendações de hardening diretamente do fabricante.',
 'Não foi possível consultar o Security Rating. Verifique se o recurso está habilitado e se a licença FortiGuard está ativa.',
 'Sem o Security Rating, a organização perde visibilidade sobre recomendações de hardening do próprio fabricante, que podem identificar gaps não cobertos por verificações manuais.',
 'O Security Rating fornece uma avaliação independente do fabricante sobre a postura de segurança, complementando auditorias internas com benchmarks da Fortinet.',
 '/api/v2/monitor/system/security-rating');
