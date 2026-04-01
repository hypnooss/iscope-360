-- =====================================================
-- Fase 3: Migrar Subdomain Enumeration para Banco
-- =====================================================

-- 1. Primeiro, buscar o device_type_id do External Domain
DO $$
DECLARE
  v_device_type_id UUID;
  v_blueprint_id UUID;
BEGIN
  -- Buscar o device_type_id
  SELECT id INTO v_device_type_id 
  FROM public.device_types 
  WHERE code = 'external_domain' AND is_active = true
  LIMIT 1;

  IF v_device_type_id IS NULL THEN
    RAISE EXCEPTION 'Device type external_domain not found';
  END IF;

  -- Buscar o blueprint existente
  SELECT id INTO v_blueprint_id
  FROM public.device_blueprints
  WHERE device_type_id = v_device_type_id AND is_active = true
  LIMIT 1;

  IF v_blueprint_id IS NULL THEN
    RAISE EXCEPTION 'Blueprint for external_domain not found';
  END IF;

  -- 2. Atualizar o blueprint para hybrid e adicionar steps de subdomain enumeration
  UPDATE public.device_blueprints
  SET 
    executor_type = 'hybrid',
    collection_steps = jsonb_build_object(
      'steps', jsonb_build_array(
        -- ===========================================
        -- AGENT STEPS (DNS Queries - executados pelo Python Agent)
        -- ===========================================
        jsonb_build_object(
          'id', 'ns_records',
          'executor', 'agent',
          'type', 'dns_query',
          'config', jsonb_build_object('query_type', 'NS')
        ),
        jsonb_build_object(
          'id', 'mx_records',
          'executor', 'agent',
          'type', 'dns_query',
          'config', jsonb_build_object('query_type', 'MX')
        ),
        jsonb_build_object(
          'id', 'soa_record',
          'executor', 'agent',
          'type', 'dns_query',
          'config', jsonb_build_object('query_type', 'SOA')
        ),
        jsonb_build_object(
          'id', 'spf_record',
          'executor', 'agent',
          'type', 'dns_query',
          'config', jsonb_build_object('query_type', 'SPF')
        ),
        jsonb_build_object(
          'id', 'dmarc_record',
          'executor', 'agent',
          'type', 'dns_query',
          'config', jsonb_build_object('query_type', 'DMARC')
        ),
        jsonb_build_object(
          'id', 'dkim_records',
          'executor', 'agent',
          'type', 'dns_query',
          'config', jsonb_build_object(
            'query_type', 'DKIM',
            'selectors', ARRAY['amazonses', 'ses', 'ses1', 'ses2', 'mailchimp', 'mc', 'k1', 'k2', 'k3', 
                               'mailgun', 'mg', 'hubspot', 'hs', 'hs1', 's1', 's2', 'sendgrid', 'hs2', 
                               'salesforce', 'sfmc', 'pardot', 'ex', 'cttarget', 'opendkim', 'postfix', 
                               'mx1', 'mx2', 'cpanel', 'plesk', 'sendinblue', 'mailjet', 'mailcow', 
                               'zimbra', 'icewarp', 'tiflux', 'selector1', 'selector2', 'default'],
            'best_effort', true
          )
        ),
        jsonb_build_object(
          'id', 'dnssec_status',
          'executor', 'agent',
          'type', 'dns_query',
          'config', jsonb_build_object('query_type', 'DNSSEC', 'best_effort', true)
        ),
        
        -- ===========================================
        -- EDGE FUNCTION STEPS (Subdomain Enumeration)
        -- Phase 1: Premium APIs (Sequential)
        -- ===========================================
        jsonb_build_object(
          'id', 'subdomain_securitytrails',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 1,
          'priority', 1,
          'config', jsonb_build_object(
            'name', 'securitytrails',
            'url_template', 'https://api.securitytrails.com/v1/domain/{domain}/subdomains',
            'method', 'GET',
            'headers', jsonb_build_object(
              'APIKEY', '{{SECURITYTRAILS_API_KEY}}',
              'Accept', 'application/json'
            ),
            'response_parser', 'securitytrails',
            'requires_api_key', true,
            'api_key_env', 'SECURITYTRAILS_API_KEY'
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_virustotal',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 1,
          'priority', 2,
          'config', jsonb_build_object(
            'name', 'virustotal',
            'url_template', 'https://www.virustotal.com/api/v3/domains/{domain}/subdomains?limit=100',
            'method', 'GET',
            'headers', jsonb_build_object(
              'x-apikey', '{{VIRUSTOTAL_API_KEY}}',
              'Accept', 'application/json'
            ),
            'response_parser', 'virustotal',
            'requires_api_key', true,
            'api_key_env', 'VIRUSTOTAL_API_KEY'
          )
        ),
        
        -- ===========================================
        -- EDGE FUNCTION STEPS (Subdomain Enumeration)
        -- Phase 2: Free APIs (Parallel)
        -- ===========================================
        jsonb_build_object(
          'id', 'subdomain_crtsh',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 1,
          'config', jsonb_build_object(
            'name', 'crt.sh',
            'url_template', 'https://crt.sh/?q=%25.{domain}&output=json',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'crtsh',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_hackertarget',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 2,
          'config', jsonb_build_object(
            'name', 'hackertarget',
            'url_template', 'https://api.hackertarget.com/hostsearch/?q={domain}',
            'method', 'GET',
            'response_parser', 'hackertarget',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_alienvault',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 3,
          'config', jsonb_build_object(
            'name', 'alienvault',
            'url_template', 'https://otx.alienvault.com/api/v1/indicators/domain/{domain}/passive_dns',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'alienvault',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_rapiddns',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 4,
          'config', jsonb_build_object(
            'name', 'rapiddns',
            'url_template', 'https://rapiddns.io/subdomain/{domain}?full=1',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'rapiddns',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_threatminer',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 5,
          'config', jsonb_build_object(
            'name', 'threatminer',
            'url_template', 'https://api.threatminer.org/v2/domain.php?q={domain}&rt=5',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'threatminer',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_urlscan',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 6,
          'config', jsonb_build_object(
            'name', 'urlscan',
            'url_template', 'https://urlscan.io/api/v1/search/?q=domain:{domain}',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'urlscan',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_wayback',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 7,
          'config', jsonb_build_object(
            'name', 'wayback',
            'url_template', 'https://web.archive.org/cdx/search/cdx?url=*.{domain}/*&output=json&fl=original&collapse=urlkey',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'wayback',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_certspotter',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 8,
          'config', jsonb_build_object(
            'name', 'certspotter',
            'url_template', 'https://api.certspotter.com/v1/issuances?domain={domain}&include_subdomains=true&expand=dns_names',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'certspotter',
            'requires_api_key', false
          )
        ),
        jsonb_build_object(
          'id', 'subdomain_jldc',
          'executor', 'edge_function',
          'runtime', 'subdomain_api',
          'phase', 2,
          'priority', 9,
          'config', jsonb_build_object(
            'name', 'jldc',
            'url_template', 'https://jldc.me/anubis/subdomains/{domain}',
            'method', 'GET',
            'headers', jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; iScope/1.0)'),
            'response_parser', 'jldc',
            'requires_api_key', false
          )
        )
      )
    ),
    updated_at = NOW()
  WHERE id = v_blueprint_id;

  RAISE NOTICE 'Blueprint updated successfully with % steps', 18;
END $$;