
-- Create dehashed_cache table for storing leaked credentials results
CREATE TABLE public.dehashed_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  domain text NOT NULL,
  total_entries integer NOT NULL DEFAULT 0,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  databases jsonb NOT NULL DEFAULT '[]'::jsonb,
  queried_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dehashed_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view dehashed cache of accessible clients"
ON public.dehashed_cache
FOR SELECT
USING (has_client_access(auth.uid(), client_id));

CREATE POLICY "Service role can manage dehashed cache"
ON public.dehashed_cache
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Super admins can manage dehashed cache"
ON public.dehashed_cache
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Index for quick lookups
CREATE INDEX idx_dehashed_cache_client_domain ON public.dehashed_cache (client_id, domain);
