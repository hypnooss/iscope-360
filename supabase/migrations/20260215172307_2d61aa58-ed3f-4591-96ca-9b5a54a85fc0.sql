-- Reset sources that likely had partial syncs (500+ results) so they re-sync fully with offset logic
UPDATE cve_sources 
SET last_sync_at = NULL, 
    last_sync_status = 'pending',
    last_sync_error = NULL
WHERE id IN (
  '00ab9041-f66e-43d4-8f40-fc57defb58d6',  -- History
  '3df2a88b-c797-4a2c-a96f-46aab1b606fe'   -- Node.js
);