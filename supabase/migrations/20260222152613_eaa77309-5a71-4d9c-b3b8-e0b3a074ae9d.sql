
-- Cancel all pending/running attack surface snapshots
UPDATE attack_surface_snapshots 
SET status = 'cancelled', completed_at = NOW() 
WHERE status IN ('pending', 'running');

-- Cancel all pending/assigned/running attack surface tasks
UPDATE attack_surface_tasks 
SET status = 'cancelled', completed_at = NOW() 
WHERE status IN ('pending', 'assigned', 'running');
