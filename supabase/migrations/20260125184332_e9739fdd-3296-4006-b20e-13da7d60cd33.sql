-- Remove a constraint existente
ALTER TABLE public.system_alerts DROP CONSTRAINT valid_severity;

-- Recria com o novo valor 'success'
ALTER TABLE public.system_alerts 
ADD CONSTRAINT valid_severity 
CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'success'::text]));