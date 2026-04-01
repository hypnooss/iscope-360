
-- Create table for persistent config change history
CREATE TABLE public.analyzer_config_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firewall_id uuid NOT NULL REFERENCES public.firewalls(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.analyzer_snapshots(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  action text NOT NULL DEFAULT '',
  cfgpath text NOT NULL DEFAULT '',
  cfgobj text DEFAULT '',
  cfgattr text DEFAULT '',
  msg text DEFAULT '',
  category text DEFAULT 'Outros',
  severity text DEFAULT 'low',
  changed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_analyzer_config_changes_firewall ON public.analyzer_config_changes(firewall_id);
CREATE INDEX idx_analyzer_config_changes_client ON public.analyzer_config_changes(client_id);
CREATE INDEX idx_analyzer_config_changes_changed_at ON public.analyzer_config_changes(changed_at DESC);
CREATE INDEX idx_analyzer_config_changes_firewall_changed ON public.analyzer_config_changes(firewall_id, changed_at DESC);

-- Unique constraint to prevent duplicates across collections
CREATE UNIQUE INDEX idx_analyzer_config_changes_dedup 
  ON public.analyzer_config_changes(firewall_id, user_name, action, cfgpath, cfgobj, changed_at);

-- Enable RLS
ALTER TABLE public.analyzer_config_changes ENABLE ROW LEVEL SECURITY;

-- RLS: users can view config changes for firewalls they have access to
CREATE POLICY "Users can view config changes of accessible firewalls"
  ON public.analyzer_config_changes
  FOR SELECT
  USING (has_client_access(auth.uid(), client_id));

-- RLS: service role can manage all records (edge function inserts)
CREATE POLICY "Service role can manage config changes"
  ON public.analyzer_config_changes
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);
