
CREATE TABLE public.agent_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  stdout text,
  stderr text,
  exit_code integer,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  timeout_seconds integer NOT NULL DEFAULT 60
);

ALTER TABLE public.agent_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage commands"
  ON public.agent_commands FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role can manage commands"
  ON public.agent_commands FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE INDEX idx_agent_commands_agent_status ON public.agent_commands (agent_id, status);
CREATE INDEX idx_agent_commands_created_at ON public.agent_commands (created_at DESC);
