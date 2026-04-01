-- Add authentication columns for session-based devices (SonicWall)
ALTER TABLE public.firewalls 
ADD COLUMN auth_username TEXT,
ADD COLUMN auth_password TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.firewalls.auth_username IS 'Username for session-based authentication (e.g., SonicWall)';
COMMENT ON COLUMN public.firewalls.auth_password IS 'Password for session-based authentication (e.g., SonicWall)';