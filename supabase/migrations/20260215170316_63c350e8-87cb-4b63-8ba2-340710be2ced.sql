-- Remove 'months' from config and reset last_sync_at for full re-sync
UPDATE cve_sources 
SET config = config - 'months', 
    last_sync_at = NULL, 
    last_sync_status = 'pending'
WHERE id IN (
  '91a2fc5c-e116-4b3b-ad76-1f34a3624689',
  '4c36f29e-31a0-4e6f-8218-cf82a7fcfe8b',
  'a7123478-fd9c-49bf-8b52-c791573ff325'
);