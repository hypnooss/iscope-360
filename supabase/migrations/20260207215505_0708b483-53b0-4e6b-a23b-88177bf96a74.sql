-- Add check_components column to agents table
ALTER TABLE agents 
ADD COLUMN check_components boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN agents.check_components IS 'Flag to trigger system component verification on next heartbeat';