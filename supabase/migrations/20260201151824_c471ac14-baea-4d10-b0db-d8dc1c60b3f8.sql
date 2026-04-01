-- Create enum for parse types
CREATE TYPE public.parse_type AS ENUM ('text', 'boolean', 'time', 'list', 'json', 'number');

-- Create evidence_parses table
CREATE TABLE public.evidence_parses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_type_id uuid NOT NULL REFERENCES public.device_types(id) ON DELETE CASCADE,
  source_field text NOT NULL,
  display_label text NOT NULL,
  parse_type public.parse_type NOT NULL DEFAULT 'text',
  value_transformations jsonb DEFAULT '{}'::jsonb,
  format_options jsonb DEFAULT '{}'::jsonb,
  is_hidden boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_type_id, source_field)
);

-- Create index for common queries
CREATE INDEX idx_evidence_parses_device_type ON public.evidence_parses(device_type_id);
CREATE INDEX idx_evidence_parses_active ON public.evidence_parses(device_type_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.evidence_parses ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view active parses"
ON public.evidence_parses
FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage parses"
ON public.evidence_parses
FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- Create updated_at trigger
CREATE TRIGGER update_evidence_parses_updated_at
BEFORE UPDATE ON public.evidence_parses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.evidence_parses IS 'Stores translation/humanization rules for technical evidence fields';
COMMENT ON COLUMN public.evidence_parses.source_field IS 'The technical field path (e.g., data.has_dnskey)';
COMMENT ON COLUMN public.evidence_parses.display_label IS 'Human-readable label to display in UI';
COMMENT ON COLUMN public.evidence_parses.parse_type IS 'How to parse/format the value';
COMMENT ON COLUMN public.evidence_parses.value_transformations IS 'Map of value transformations (e.g., {true: "Ativado", false: "Desativado"})';
COMMENT ON COLUMN public.evidence_parses.format_options IS 'Additional formatting options (e.g., {time_unit: "seconds"})';