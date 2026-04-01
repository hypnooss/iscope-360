
UPDATE cve_sources 
SET last_sync_at = NULL, 
    last_sync_status = NULL, 
    last_sync_count = 0
WHERE source_label = 'Microsoft IIS';
