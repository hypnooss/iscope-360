
CREATE OR REPLACE FUNCTION public.get_fw_dashboard_summary(p_firewall_ids uuid[])
RETURNS TABLE(
  firewall_id uuid, score integer,
  critical integer, high integer, medium integer, low integer,
  analyzed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sub.firewall_id,
    sub.score,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='critical' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='high' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='medium' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='low' THEN 1 ELSE 0 END), 0)::integer,
    sub.created_at
  FROM (
    SELECT DISTINCT ON (ah.firewall_id)
      ah.firewall_id, ah.score, ah.report_data, ah.created_at
    FROM analysis_history ah
    WHERE ah.firewall_id = ANY(p_firewall_ids)
    ORDER BY ah.firewall_id, ah.created_at DESC
  ) sub
  LEFT JOIN LATERAL (
    SELECT jsonb_array_elements(cat_value) AS chk
    FROM jsonb_each(sub.report_data->'categories') AS cats(cat_key, cat_value)
  ) c ON true
  GROUP BY sub.firewall_id, sub.score, sub.created_at;
$$;
