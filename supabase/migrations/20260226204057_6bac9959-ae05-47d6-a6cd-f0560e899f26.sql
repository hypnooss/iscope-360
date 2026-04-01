-- Fix orphan snapshot: mark as failed since its agent_task already failed
UPDATE m365_analyzer_snapshots 
SET status = 'failed', 
    metrics = jsonb_set(COALESCE(metrics, '{}'::jsonb), '{recovered_reason}', '"orphan_task_failed"')
WHERE id = 'e35b0fd4-69fe-4ddf-bcc2-751e63feb02b' 
  AND status IN ('pending', 'processing');