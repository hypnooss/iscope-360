
-- RPC: retorna score + severidades do último relatório por firewall (server-side, sem transferir report_data)
CREATE OR REPLACE FUNCTION public.get_fw_dashboard_summary(p_firewall_ids uuid[])
RETURNS TABLE(firewall_id uuid, score integer, critical integer, high integer, medium integer, low integer, analyzed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (ah.firewall_id)
    ah.firewall_id,
    ah.score,
    COALESCE((ah.report_data->'summary'->>'critical')::integer, 0),
    COALESCE((ah.report_data->'summary'->>'high')::integer, 0),
    COALESCE((ah.report_data->'summary'->>'medium')::integer, 0),
    COALESCE((ah.report_data->'summary'->>'low')::integer, 0),
    ah.created_at
  FROM analysis_history ah
  WHERE ah.firewall_id = ANY(p_firewall_ids)
  ORDER BY ah.firewall_id, ah.created_at DESC;
$$;

-- RPC: retorna score + severidades do último relatório por domínio externo (server-side)
CREATE OR REPLACE FUNCTION public.get_ext_domain_dashboard_summary(p_domain_ids uuid[])
RETURNS TABLE(domain_id uuid, score integer, critical integer, high integer, medium integer, low integer, analyzed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (ah.domain_id)
    ah.domain_id,
    ah.score::integer,
    COALESCE((ah.report_data->'summary'->>'critical')::integer, 0),
    COALESCE((ah.report_data->'summary'->>'high')::integer, 0),
    COALESCE((ah.report_data->'summary'->>'medium')::integer, 0),
    COALESCE((ah.report_data->'summary'->>'low')::integer, 0),
    ah.created_at
  FROM external_domain_analysis_history ah
  WHERE ah.domain_id = ANY(p_domain_ids)
    AND ah.status = 'completed'
  ORDER BY ah.domain_id, ah.created_at DESC;
$$;
