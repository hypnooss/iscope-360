-- Add agent_id column to firewalls table
ALTER TABLE public.firewalls 
ADD COLUMN agent_id UUID REFERENCES public.agents(id);

-- Update existing firewalls with device_type_id (FortiGate)
UPDATE public.firewalls 
SET device_type_id = (SELECT id FROM public.device_types WHERE code = 'fortigate' LIMIT 1)
WHERE device_type_id IS NULL;

-- Update existing firewalls with agent_id from same client
UPDATE public.firewalls f
SET agent_id = (
  SELECT a.id FROM public.agents a 
  WHERE a.client_id = f.client_id 
  AND a.revoked = false 
  LIMIT 1
)
WHERE agent_id IS NULL;