-- Add agent_version column to track last reported version
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS agent_version text DEFAULT NULL;

COMMENT ON COLUMN public.agents.agent_version IS 'Last reported agent version from heartbeat';