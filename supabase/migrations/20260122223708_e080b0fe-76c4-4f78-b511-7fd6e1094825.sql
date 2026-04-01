-- Create table to store M365 multi-tenant configuration
CREATE TABLE IF NOT EXISTS public.m365_global_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.m365_global_config ENABLE ROW LEVEL SECURITY;

-- Only super_admins can access this table
CREATE POLICY "Super admins can view global config" 
ON public.m365_global_config 
FOR SELECT 
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert global config" 
ON public.m365_global_config 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update global config" 
ON public.m365_global_config 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete global config" 
ON public.m365_global_config 
FOR DELETE 
USING (public.has_role(auth.uid(), 'super_admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_m365_global_config_updated_at
BEFORE UPDATE ON public.m365_global_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.m365_global_config IS 'Stores the global M365 multi-tenant app configuration';