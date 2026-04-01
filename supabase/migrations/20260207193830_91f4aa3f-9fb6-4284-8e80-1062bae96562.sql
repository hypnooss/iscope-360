-- =====================================================
-- Fase 4: Mover sourceKeyToEndpoint para Banco de Dados
-- =====================================================

-- 1. Criar tabela de mapeamento de source_key para endpoint
CREATE TABLE IF NOT EXISTS public.source_key_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id UUID NOT NULL REFERENCES public.device_types(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  endpoint_label TEXT NOT NULL,
  endpoint_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_type_id, source_key)
);

-- 2. Habilitar RLS
ALTER TABLE public.source_key_endpoints ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acesso
CREATE POLICY "Super admins can manage source key endpoints"
  ON public.source_key_endpoints FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view active source key endpoints"
  ON public.source_key_endpoints FOR SELECT
  USING (is_active = true);

-- 4. Trigger para updated_at
CREATE TRIGGER update_source_key_endpoints_updated_at
  BEFORE UPDATE ON public.source_key_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Inserir mapeamentos para FortiGate
DO $$
DECLARE
  v_fortigate_id UUID;
  v_sonicwall_id UUID;
  v_external_domain_id UUID;
BEGIN
  SELECT id INTO v_fortigate_id FROM public.device_types WHERE code = 'fortigate' AND is_active = true LIMIT 1;
  SELECT id INTO v_sonicwall_id FROM public.device_types WHERE code = 'sonicwall' AND is_active = true LIMIT 1;
  SELECT id INTO v_external_domain_id FROM public.device_types WHERE code = 'external_domain' AND is_active = true LIMIT 1;

  -- FortiGate endpoints
  IF v_fortigate_id IS NOT NULL THEN
    INSERT INTO public.source_key_endpoints (device_type_id, source_key, endpoint_label, endpoint_url) VALUES
      (v_fortigate_id, 'system_global', 'Sistema Global', '/api/v2/cmdb/system/global'),
      (v_fortigate_id, 'system_interface', 'Interfaces de Rede', '/api/v2/cmdb/system/interface'),
      (v_fortigate_id, 'system_status', 'Status do Sistema', '/api/v2/monitor/system/status'),
      (v_fortigate_id, 'system_firmware', 'Firmware', '/api/v2/monitor/system/firmware'),
      (v_fortigate_id, 'webui_state', 'Estado Web UI', '/api/v2/monitor/system/webui-state'),
      (v_fortigate_id, 'firewall_policy', 'Políticas de Firewall', '/api/v2/cmdb/firewall/policy'),
      (v_fortigate_id, 'firewall_address', 'Objetos de Endereço', '/api/v2/cmdb/firewall/address'),
      (v_fortigate_id, 'vpn_ipsec', 'VPN IPsec (Phase1)', '/api/v2/cmdb/vpn.ipsec/phase1-interface'),
      (v_fortigate_id, 'vpn_ipsec_phase1', 'VPN IPsec Phase1', '/api/v2/cmdb/vpn.ipsec/phase1-interface'),
      (v_fortigate_id, 'vpn_ssl_settings', 'VPN SSL Settings', '/api/v2/cmdb/vpn.ssl/settings'),
      (v_fortigate_id, 'log_settings', 'Configurações de Log', '/api/v2/cmdb/log/setting'),
      (v_fortigate_id, 'log_setting', 'Configurações de Log', '/api/v2/cmdb/log/setting'),
      (v_fortigate_id, 'log_syslogd', 'Syslog', '/api/v2/cmdb/log.syslogd/setting'),
      (v_fortigate_id, 'log_fortianalyzer', 'FortiAnalyzer', '/api/v2/cmdb/log.fortianalyzer/setting'),
      (v_fortigate_id, 'log_fortiguard', 'FortiGuard Log', '/api/v2/cmdb/log.fortiguard/setting'),
      (v_fortigate_id, 'antivirus_profile', 'Perfis de Antivírus', '/api/v2/cmdb/antivirus/profile'),
      (v_fortigate_id, 'webfilter_profile', 'Perfis de Web Filter', '/api/v2/cmdb/webfilter/profile'),
      (v_fortigate_id, 'ips_sensor', 'Sensores IPS', '/api/v2/cmdb/ips/sensor'),
      (v_fortigate_id, 'dnsfilter_profile', 'Perfis DNS Filter', '/api/v2/cmdb/dnsfilter/profile'),
      (v_fortigate_id, 'system_ha', 'Alta Disponibilidade', '/api/v2/cmdb/system/ha'),
      (v_fortigate_id, 'system_admin', 'Administradores', '/api/v2/cmdb/system/admin'),
      (v_fortigate_id, 'license_status', 'Status de Licenças', '/api/v2/monitor/license/status'),
      (v_fortigate_id, 'forticare_status', 'Status FortiCare', '/api/v2/monitor/system/forticare'),
      (v_fortigate_id, 'system_automation_stitch', 'Automation Stitch', '/api/v2/cmdb/system/automation-stitch'),
      (v_fortigate_id, 'system_automation_trigger', 'Automation Trigger', '/api/v2/cmdb/system/automation-trigger'),
      (v_fortigate_id, 'system_automation_action', 'Automation Action', '/api/v2/cmdb/system/automation-action'),
      (v_fortigate_id, 'user_ldap', 'LDAP', '/api/v2/cmdb/user/ldap'),
      (v_fortigate_id, 'user_radius', 'RADIUS', '/api/v2/cmdb/user/radius'),
      (v_fortigate_id, 'user_fsso', 'FSSO', '/api/v2/cmdb/user/fsso'),
      (v_fortigate_id, 'user_saml', 'SAML', '/api/v2/cmdb/user/saml')
    ON CONFLICT (device_type_id, source_key) DO UPDATE SET
      endpoint_label = EXCLUDED.endpoint_label,
      endpoint_url = EXCLUDED.endpoint_url,
      updated_at = NOW();
  END IF;

  -- SonicWall endpoints (se existir)
  IF v_sonicwall_id IS NOT NULL THEN
    INSERT INTO public.source_key_endpoints (device_type_id, source_key, endpoint_label, endpoint_url) VALUES
      (v_sonicwall_id, 'version', 'Versão', '/api/sonicos/version'),
      (v_sonicwall_id, 'interfaces', 'Interfaces', '/api/sonicos/interfaces/ipv4'),
      (v_sonicwall_id, 'zones', 'Zonas', '/api/sonicos/zones'),
      (v_sonicwall_id, 'access_rules', 'Regras de Acesso', '/api/sonicos/access-rules/ipv4'),
      (v_sonicwall_id, 'nat_policies', 'Políticas NAT', '/api/sonicos/nat-policies/ipv4'),
      (v_sonicwall_id, 'address_objects', 'Objetos de Endereço', '/api/sonicos/address-objects/ipv4'),
      (v_sonicwall_id, 'service_objects', 'Objetos de Serviço', '/api/sonicos/service-objects'),
      (v_sonicwall_id, 'content_filter', 'Filtro de Conteúdo', '/api/sonicos/content-filter'),
      (v_sonicwall_id, 'gateway_antivirus', 'Gateway Antivírus', '/api/sonicos/gateway-anti-virus'),
      (v_sonicwall_id, 'intrusion_prevention', 'Prevenção de Intrusão', '/api/sonicos/intrusion-prevention'),
      (v_sonicwall_id, 'vpn_policies', 'Políticas VPN', '/api/sonicos/vpn/policies'),
      (v_sonicwall_id, 'ssl_vpn', 'SSL VPN', '/api/sonicos/ssl-vpn'),
      (v_sonicwall_id, 'high_availability', 'Alta Disponibilidade', '/api/sonicos/high-availability'),
      (v_sonicwall_id, 'administration', 'Administração', '/api/sonicos/administration'),
      (v_sonicwall_id, 'log_settings_sonic', 'Configurações de Log', '/api/sonicos/log/settings')
    ON CONFLICT (device_type_id, source_key) DO UPDATE SET
      endpoint_label = EXCLUDED.endpoint_label,
      endpoint_url = EXCLUDED.endpoint_url,
      updated_at = NOW();
  END IF;

  -- External Domain endpoints
  IF v_external_domain_id IS NOT NULL THEN
    INSERT INTO public.source_key_endpoints (device_type_id, source_key, endpoint_label, endpoint_url) VALUES
      (v_external_domain_id, 'ns_records', 'DNS Query (NS)', NULL),
      (v_external_domain_id, 'soa_record', 'DNS Query (SOA)', NULL),
      (v_external_domain_id, 'dnssec_status', 'DNS Query (DNSSEC)', NULL),
      (v_external_domain_id, 'spf_record', 'DNS Query (SPF/TXT)', NULL),
      (v_external_domain_id, 'dmarc_record', 'DNS Query (DMARC/TXT)', NULL),
      (v_external_domain_id, 'dkim_records', 'DNS Query (DKIM/TXT)', NULL),
      (v_external_domain_id, 'mx_records', 'DNS Query (MX)', NULL),
      (v_external_domain_id, 'subdomain_enum', 'Subdomain Enumeration', NULL)
    ON CONFLICT (device_type_id, source_key) DO UPDATE SET
      endpoint_label = EXCLUDED.endpoint_label,
      endpoint_url = EXCLUDED.endpoint_url,
      updated_at = NOW();
  END IF;

  RAISE NOTICE 'Source key endpoints populated successfully';
END $$;