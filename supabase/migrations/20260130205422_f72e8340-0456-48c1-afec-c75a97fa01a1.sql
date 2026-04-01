-- Ensure system_alerts is included in Supabase Realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_alerts;
  END IF;
END $$;

-- Keep REPLICA IDENTITY default (PK exists). If you later need full row payloads on UPDATE/DELETE, consider:
-- ALTER TABLE public.system_alerts REPLICA IDENTITY FULL;