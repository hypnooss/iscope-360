CREATE OR REPLACE FUNCTION public.get_ext_domain_dashboard_summary(p_domain_ids uuid[])
RETURNS TABLE(domain_id uuid, score integer, critical integer, high integer, medium integer, low integer, analyzed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    sub.domain_id, sub.score,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='critical' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='high' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='medium' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='low' THEN 1 ELSE 0 END), 0)::integer,
    sub.created_at
  FROM (
    SELECT DISTINCT ON (ah.domain_id)
      ah.domain_id, ah.score::integer, ah.report_data, ah.created_at
    FROM external_domain_analysis_history ah
    WHERE ah.domain_id = ANY(p_domain_ids) AND ah.status = 'completed'
    ORDER BY ah.domain_id, ah.created_at DESC
  ) sub
  LEFT JOIN LATERAL (
    SELECT jsonb_array_elements(cat_value) AS chk
    FROM jsonb_each(sub.report_data->'categories') AS cats(cat_key, cat_value)
  ) c ON true
  GROUP BY sub.domain_id, sub.score, sub.created_at;
$$;