-- Create enum for task types
CREATE TYPE agent_task_type AS ENUM (
  'fortigate_compliance',
  'fortigate_cve',
  'ssh_command',
  'snmp_query',
  'ping_check'
);

-- Create enum for task status
CREATE TYPE agent_task_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled'
);

-- Create agent_tasks table
CREATE TABLE public.agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  task_type agent_task_type NOT NULL,
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'firewall',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status agent_task_status NOT NULL DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '1 hour'),
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3
);

-- Create indexes for efficient queries
CREATE INDEX idx_agent_tasks_agent_id ON public.agent_tasks(agent_id);
CREATE INDEX idx_agent_tasks_status ON public.agent_tasks(status);
CREATE INDEX idx_agent_tasks_agent_pending ON public.agent_tasks(agent_id, status) WHERE status = 'pending';
CREATE INDEX idx_agent_tasks_expires_at ON public.agent_tasks(expires_at) WHERE status IN ('pending', 'running');

-- Enable RLS
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (for edge functions)
CREATE POLICY "Service role can manage all tasks"
ON public.agent_tasks
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Policy: Admins can view tasks of agents they manage
CREATE POLICY "Admins can view agent tasks"
ON public.agent_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_tasks.agent_id
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        has_role(auth.uid(), 'workspace_admin'::app_role)
        AND has_client_access(auth.uid(), a.client_id)
      )
    )
  )
);

-- Policy: Admins can manage tasks of agents they manage
CREATE POLICY "Admins can manage agent tasks"
ON public.agent_tasks
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_tasks.agent_id
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        has_role(auth.uid(), 'workspace_admin'::app_role)
        AND has_client_access(auth.uid(), a.client_id)
      )
    )
  )
);

-- Comment on table
COMMENT ON TABLE public.agent_tasks IS 'Queue of tasks for agents to execute';