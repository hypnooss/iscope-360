
-- 1. Create device_type_api_docs table
CREATE TABLE public.device_type_api_docs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_type_id uuid NOT NULL REFERENCES public.device_types(id) ON DELETE CASCADE,
  title text NOT NULL,
  version text NOT NULL,
  doc_type text NOT NULL DEFAULT 'log_api',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.device_type_api_docs ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "Super admins can manage api docs"
  ON public.device_type_api_docs
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated users can view api docs"
  ON public.device_type_api_docs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. Updated_at trigger
CREATE TRIGGER update_device_type_api_docs_updated_at
  BEFORE UPDATE ON public.device_type_api_docs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Update blueprint config_changes path
UPDATE public.device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'config_changes' 
        THEN jsonb_set(
          step, 
          '{config,path}', 
          '"/api/v2/log/memory/event/system/?filter=subtype==system&rows=500"'::jsonb
        )
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
