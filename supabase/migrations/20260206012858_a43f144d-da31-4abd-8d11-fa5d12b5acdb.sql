-- Add environment_metrics column to m365_posture_history
ALTER TABLE public.m365_posture_history
ADD COLUMN IF NOT EXISTS environment_metrics JSONB DEFAULT NULL;