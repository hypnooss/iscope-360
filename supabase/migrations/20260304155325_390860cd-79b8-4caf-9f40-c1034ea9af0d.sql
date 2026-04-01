CREATE OR REPLACE FUNCTION public.cleanup_stuck_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE agent_tasks
  SET 
    status = 'timeout',
    error_message = 'Task excedeu tempo máximo de execução (30 min)',
    completed_at = NOW()
  WHERE status = 'running'
    AND (
      timeout_at IS NOT NULL AND timeout_at < NOW()
      OR
      timeout_at IS NULL AND started_at < NOW() - INTERVAL '30 minutes'
    );
END;
$$;