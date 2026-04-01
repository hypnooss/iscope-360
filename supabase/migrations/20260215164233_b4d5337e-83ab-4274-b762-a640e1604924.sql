UPDATE cve_sources cs
SET next_run_at = sub.new_next_run
FROM (
  SELECT id, NOW() + (ROW_NUMBER() OVER (ORDER BY id)) * INTERVAL '5 minutes' AS new_next_run
  FROM cve_sources
  WHERE next_run_at IS NULL
) sub
WHERE cs.id = sub.id;