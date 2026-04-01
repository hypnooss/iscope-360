-- Add a specific task_type for external domain analysis
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'agent_task_type'
      AND e.enumlabel = 'external_domain_analysis'
  ) THEN
    ALTER TYPE public.agent_task_type ADD VALUE 'external_domain_analysis';
  END IF;
END $$;
