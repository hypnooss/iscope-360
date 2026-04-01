-- Create agents table
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activation_code TEXT,
  activation_code_expires_at TIMESTAMP WITH TIME ZONE,
  jwt_secret TEXT
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- RLS policies for agents
CREATE POLICY "Admins can manage all agents"
ON public.agents
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "Client admins can view their agents"
ON public.agents
FOR SELECT
USING (
  client_id IN (
    SELECT client_id FROM public.user_clients 
    WHERE user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX idx_agents_client_id ON public.agents(client_id);
CREATE INDEX idx_agents_created_by ON public.agents(created_by);