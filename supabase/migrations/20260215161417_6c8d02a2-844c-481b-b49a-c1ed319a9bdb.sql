-- Reset stuck CVE syncs
UPDATE cve_sources 
SET last_sync_status = 'error', 
    last_sync_error = 'Cancelado manualmente pelo administrador'
WHERE last_sync_status = 'syncing';