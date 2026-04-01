-- Data fix (TEST): criar device_type + blueprint para aparecer em Administração > Coletas > Domínios Externos
DO $$
DECLARE
  v_device_type_id uuid;
  v_existing_blueprint_id uuid;
BEGIN
  -- 1) device_type: external_domain (category=other)
  SELECT id INTO v_device_type_id
  FROM public.device_types
  WHERE code = 'external_domain'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_device_type_id IS NULL THEN
    INSERT INTO public.device_types (vendor, name, code, category, icon, is_active)
    VALUES ('iScope', 'Domínio Externo', 'external_domain', 'other', 'Globe', true)
    RETURNING id INTO v_device_type_id;
  ELSE
    -- Garante que está ativo e com a categoria certa (não cria duplicado)
    UPDATE public.device_types
    SET vendor = 'iScope',
        name = 'Domínio Externo',
        category = 'other',
        icon = COALESCE(icon, 'Globe'),
        is_active = true,
        updated_at = now()
    WHERE id = v_device_type_id;
  END IF;

  -- 2) device_blueprint ativo (não duplicar)
  SELECT id INTO v_existing_blueprint_id
  FROM public.device_blueprints
  WHERE device_type_id = v_device_type_id
    AND is_active = true
    AND name = 'External Domain DNS Scan'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_blueprint_id IS NULL THEN
    INSERT INTO public.device_blueprints (
      device_type_id,
      name,
      version,
      description,
      is_active,
      collection_steps
    )
    VALUES (
      v_device_type_id,
      'External Domain DNS Scan',
      'any',
      'DNS multi-step scan (NS/MX/SOA/SPF/DMARC/DKIM/DNSSEC)',
      true,
      (
        jsonb_build_object(
          'steps', jsonb_build_array(
            jsonb_build_object(
              'id','ns_records',
              'type','dns_query',
              'config', jsonb_build_object('query_type','NS')
            ),
            jsonb_build_object(
              'id','mx_records',
              'type','dns_query',
              'config', jsonb_build_object('query_type','MX')
            ),
            jsonb_build_object(
              'id','soa_record',
              'type','dns_query',
              'config', jsonb_build_object('query_type','SOA')
            ),
            jsonb_build_object(
              'id','spf_record',
              'type','dns_query',
              'config', jsonb_build_object('query_type','SPF')
            ),
            jsonb_build_object(
              'id','dmarc_record',
              'type','dns_query',
              'config', jsonb_build_object('query_type','DMARC')
            ),
            jsonb_build_object(
              'id','dkim_records',
              'type','dns_query',
              'config', jsonb_build_object(
                'query_type','DKIM',
                'selectors', jsonb_build_array(
                  'amazonses','ses','ses1','ses2','mailchimp','mc','k1','k2','k3','mailgun','mg','hubspot','hs','hs1','s1','s2','sendgrid','hs2','salesforce','sfmc','pardot','ex','cttarget','opendkim','postfix','mx1','mx2','cpanel','plesk','sendinblue','mailjet','mailcow','zimbra','icewarp','tiflux','selector1','selector2','default'
                ),
                'best_effort', true
              )
            ),
            jsonb_build_object(
              'id','dnssec_status',
              'type','dns_query',
              'config', jsonb_build_object('query_type','DNSSEC','best_effort', true)
            )
          )
        )
      )
    );
  END IF;
END $$;