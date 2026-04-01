
-- Create attack_surface_snapshots table
CREATE TABLE public.attack_surface_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source_ips JSONB DEFAULT '[]'::jsonb,
  results JSONB DEFAULT '{}'::jsonb,
  cve_matches JSONB DEFAULT '[]'::jsonb,
  summary JSONB DEFAULT '{"total_ips": 0, "open_ports": 0, "services": 0, "cves": 0}'::jsonb,
  score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.attack_surface_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT: users with client access
CREATE POLICY "Users can view attack surface snapshots of accessible clients"
ON public.attack_surface_snapshots
FOR SELECT
USING (has_client_access(auth.uid(), client_id));

-- INSERT: users with edit/full permission on external_domain
CREATE POLICY "Users with edit permission can insert attack surface snapshots"
ON public.attack_surface_snapshots
FOR INSERT
WITH CHECK (
  has_client_access(auth.uid(), client_id)
  AND get_module_permission(auth.uid(), 'external_domain') = ANY(ARRAY['edit'::module_permission, 'full'::module_permission])
);

-- ALL: service_role
CREATE POLICY "Service role can manage attack surface snapshots"
ON public.attack_surface_snapshots
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Index for client_id lookups
CREATE INDEX idx_attack_surface_snapshots_client_id ON public.attack_surface_snapshots(client_id);
CREATE INDEX idx_attack_surface_snapshots_status ON public.attack_surface_snapshots(status);
