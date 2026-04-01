
-- Update firewall severity cache with top CVEs from cve_cache
WITH firewall_top AS (
  SELECT cve_id, score, severity
  FROM cve_cache
  WHERE module_code = 'firewall' AND score IS NOT NULL
  ORDER BY score DESC
  LIMIT 2
),
firewall_counts AS (
  SELECT
    COUNT(*) FILTER (WHERE UPPER(severity) = 'CRITICAL') AS critical,
    COUNT(*) FILTER (WHERE UPPER(severity) = 'HIGH') AS high,
    COUNT(*) FILTER (WHERE UPPER(severity) = 'MEDIUM') AS medium,
    COUNT(*) FILTER (WHERE UPPER(severity) = 'LOW') AS low
  FROM cve_cache
  WHERE module_code = 'firewall' AND score IS NOT NULL
)
UPDATE cve_severity_cache
SET
  top_cves = (SELECT jsonb_agg(jsonb_build_object('id', cve_id, 'score', score, 'severity', UPPER(severity))) FROM firewall_top),
  critical = (SELECT critical FROM firewall_counts),
  high = (SELECT high FROM firewall_counts),
  medium = (SELECT medium FROM firewall_counts),
  low = (SELECT low FROM firewall_counts),
  updated_at = now()
WHERE module_code = 'firewall';

-- Update external_domain severity cache with top CVEs from cve_cache
WITH ed_top AS (
  SELECT cve_id, score, severity
  FROM cve_cache
  WHERE module_code = 'external_domain' AND score IS NOT NULL
  ORDER BY score DESC
  LIMIT 2
),
ed_counts AS (
  SELECT
    COUNT(*) FILTER (WHERE UPPER(severity) = 'CRITICAL') AS critical,
    COUNT(*) FILTER (WHERE UPPER(severity) = 'HIGH') AS high,
    COUNT(*) FILTER (WHERE UPPER(severity) = 'MEDIUM') AS medium,
    COUNT(*) FILTER (WHERE UPPER(severity) = 'LOW') AS low
  FROM cve_cache
  WHERE module_code = 'external_domain' AND score IS NOT NULL
)
UPDATE cve_severity_cache
SET
  top_cves = (SELECT jsonb_agg(jsonb_build_object('id', cve_id, 'score', score, 'severity', UPPER(severity))) FROM ed_top),
  critical = (SELECT critical FROM ed_counts),
  high = (SELECT high FROM ed_counts),
  medium = (SELECT medium FROM ed_counts),
  low = (SELECT low FROM ed_counts),
  updated_at = now()
WHERE module_code = 'external_domain';
