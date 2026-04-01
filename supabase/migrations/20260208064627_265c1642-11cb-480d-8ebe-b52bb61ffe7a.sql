-- Add columns for agent-based insights in M365 posture analysis
-- This enables dual-task architecture: Graph API (Edge) + PowerShell (Agent)

-- Add agent task reference and agent-specific results
ALTER TABLE m365_posture_history 
ADD COLUMN IF NOT EXISTS agent_task_id uuid REFERENCES agent_tasks(id),
ADD COLUMN IF NOT EXISTS agent_insights jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS agent_status text DEFAULT NULL;

-- Add index for efficient querying of agent-linked analyses
CREATE INDEX IF NOT EXISTS idx_m365_posture_history_agent_task 
ON m365_posture_history(agent_task_id) 
WHERE agent_task_id IS NOT NULL;

-- Comment the new columns for documentation
COMMENT ON COLUMN m365_posture_history.agent_task_id IS 'Reference to the agent task that collects PowerShell-based data (Exchange, SharePoint)';
COMMENT ON COLUMN m365_posture_history.agent_insights IS 'Insights collected via PowerShell agent (Exchange Online, SharePoint Online)';
COMMENT ON COLUMN m365_posture_history.agent_status IS 'Status of the agent task: pending, running, completed, failed';