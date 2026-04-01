-- Reset sources that had sync_offset to restart with cursor-based sync
-- Also clear any stale sync_offset from config
UPDATE public.cve_sources
SET 
  last_sync_at = NULL,
  last_sync_error = NULL,
  last_sync_status = 'pending',
  config = config - 'sync_offset' - 'sync_cursor_date'
WHERE source_type IN ('nist_nvd', 'nist_nvd_web');