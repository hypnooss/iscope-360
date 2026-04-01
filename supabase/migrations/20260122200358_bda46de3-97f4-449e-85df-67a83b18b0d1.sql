-- Create table for admin activity logs
CREATE TABLE public.admin_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  action TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'general',
  target_type TEXT,
  target_id UUID,
  target_name TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_admin_activity_logs_admin_id ON public.admin_activity_logs(admin_id);
CREATE INDEX idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);
CREATE INDEX idx_admin_activity_logs_action_type ON public.admin_activity_logs(action_type);

-- Enable RLS
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can view all logs
CREATE POLICY "Super admins can view all activity logs"
ON public.admin_activity_logs
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- Super admins can insert logs
CREATE POLICY "Super admins can insert activity logs"
ON public.admin_activity_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Add comment to describe the table
COMMENT ON TABLE public.admin_activity_logs IS 'Stores activity history for administrators';
COMMENT ON COLUMN public.admin_activity_logs.action IS 'Human readable description of the action';
COMMENT ON COLUMN public.admin_activity_logs.action_type IS 'Type category: user_management, client_management, system, etc';
COMMENT ON COLUMN public.admin_activity_logs.target_type IS 'Type of entity affected: user, client, firewall, etc';
COMMENT ON COLUMN public.admin_activity_logs.target_id IS 'ID of the affected entity';
COMMENT ON COLUMN public.admin_activity_logs.target_name IS 'Name/email of the affected entity for display';