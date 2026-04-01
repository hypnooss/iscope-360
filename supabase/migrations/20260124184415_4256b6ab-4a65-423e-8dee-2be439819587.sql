-- Add recommendation and description fields to compliance_rules for richer output
ALTER TABLE public.compliance_rules
ADD COLUMN IF NOT EXISTS recommendation TEXT,
ADD COLUMN IF NOT EXISTS pass_description TEXT,
ADD COLUMN IF NOT EXISTS fail_description TEXT;

-- Add comment explaining the new columns
COMMENT ON COLUMN public.compliance_rules.recommendation IS 'Recommended action when the rule fails';
COMMENT ON COLUMN public.compliance_rules.pass_description IS 'Description to show when the rule passes';
COMMENT ON COLUMN public.compliance_rules.fail_description IS 'Description to show when the rule fails';