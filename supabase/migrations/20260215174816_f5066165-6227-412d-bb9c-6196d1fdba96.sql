
-- Reset fonte History: limpar CVEs e estado
DELETE FROM cve_cache
WHERE source_id = (SELECT id FROM cve_sources WHERE source_label = 'History');

UPDATE cve_sources
SET
  config = config - 'sync_cursor_date' - 'sync_offset',
  last_sync_at = NULL,
  last_sync_count = 0,
  last_sync_status = 'pending',
  last_sync_error = NULL
WHERE source_label = 'History';

-- Reset fonte Node.js: limpar CVEs e estado
DELETE FROM cve_cache
WHERE source_id = (SELECT id FROM cve_sources WHERE source_label = 'Node.js');

UPDATE cve_sources
SET
  config = config - 'sync_cursor_date' - 'sync_offset',
  last_sync_at = NULL,
  last_sync_count = 0,
  last_sync_status = 'pending',
  last_sync_error = NULL
WHERE source_label = 'Node.js';
