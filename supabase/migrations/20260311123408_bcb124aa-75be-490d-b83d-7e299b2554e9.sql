-- Cleanup stale partial records that have no completed_at and are older than 30 min
UPDATE m365_posture_history
SET status = 'failed', completed_at = NOW()
WHERE status = 'partial'
  AND completed_at IS NULL
  AND created_at < NOW() - INTERVAL '30 minutes';