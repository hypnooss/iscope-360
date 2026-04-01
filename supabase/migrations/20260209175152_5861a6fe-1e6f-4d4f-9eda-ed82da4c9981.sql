
-- Add status tracking and source fields to external_domain_analysis_history
-- to support dual-task pattern (API + Agent) like M365

-- Add status column (default 'completed' for existing records)
ALTER TABLE public.external_domain_analysis_history
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

-- Add source column to distinguish API vs Agent analyses
ALTER TABLE public.external_domain_analysis_history
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'agent';

-- Add timing columns
ALTER TABLE public.external_domain_analysis_history
ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.external_domain_analysis_history
ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.external_domain_analysis_history
ADD COLUMN IF NOT EXISTS execution_time_ms integer;

-- Make score nullable (pending records won't have a score yet)
ALTER TABLE public.external_domain_analysis_history
ALTER COLUMN score DROP NOT NULL;

-- Make report_data nullable (pending records won't have report data yet)
ALTER TABLE public.external_domain_analysis_history
ALTER COLUMN report_data DROP NOT NULL;

-- Add index for status-based queries
CREATE INDEX IF NOT EXISTS idx_ext_domain_analysis_status ON public.external_domain_analysis_history (status);
CREATE INDEX IF NOT EXISTS idx_ext_domain_analysis_source ON public.external_domain_analysis_history (source);
