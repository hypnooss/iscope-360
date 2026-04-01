-- Create table for M365 posture analysis history
CREATE TABLE public.m365_posture_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_record_id UUID NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  score INTEGER,
  classification TEXT,
  summary JSONB,
  category_breakdown JSONB,
  insights JSONB,
  errors JSONB,
  analyzed_by UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_m365_posture_history_tenant ON public.m365_posture_history(tenant_record_id);
CREATE INDEX idx_m365_posture_history_client ON public.m365_posture_history(client_id);
CREATE INDEX idx_m365_posture_history_status ON public.m365_posture_history(status);
CREATE INDEX idx_m365_posture_history_created ON public.m365_posture_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.m365_posture_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view history of accessible tenants
CREATE POLICY "Users can view posture history of accessible tenants"
ON public.m365_posture_history
FOR SELECT
USING (has_client_access(auth.uid(), client_id));

-- Policy: Users with edit permission can insert history
CREATE POLICY "Users with edit permission can insert posture history"
ON public.m365_posture_history
FOR INSERT
WITH CHECK (
  has_client_access(auth.uid(), client_id) 
  AND get_module_permission(auth.uid(), 'm365') = ANY (ARRAY['edit'::module_permission, 'full'::module_permission])
);

-- Policy: Users with edit permission can update history
CREATE POLICY "Users with edit permission can update posture history"
ON public.m365_posture_history
FOR UPDATE
USING (
  has_client_access(auth.uid(), client_id) 
  AND get_module_permission(auth.uid(), 'm365') = ANY (ARRAY['edit'::module_permission, 'full'::module_permission])
);

-- Policy: Service role can manage all history
CREATE POLICY "Service role can manage posture history"
ON public.m365_posture_history
FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');