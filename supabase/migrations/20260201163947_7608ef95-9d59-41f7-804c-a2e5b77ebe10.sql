-- Create table for category visual configuration
CREATE TABLE public.rule_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id uuid NOT NULL REFERENCES public.device_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text,
  icon text NOT NULL DEFAULT 'shield',
  color text NOT NULL DEFAULT 'slate-500',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_type_id, name)
);

-- Enable RLS
ALTER TABLE public.rule_categories ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all categories
CREATE POLICY "Super admins can manage categories"
  ON public.rule_categories FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- All authenticated users can view active categories
CREATE POLICY "Users can view active categories"
  ON public.rule_categories FOR SELECT
  USING (is_active = true);

-- Create trigger for updated_at
CREATE TRIGGER update_rule_categories_updated_at
  BEFORE UPDATE ON public.rule_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.rule_categories IS 'Stores visual configuration (icon, color, display name) for compliance rule categories per device type';