-- Add UNIQUE constraint for task_id and step_id combination
-- This allows the upsert with onConflict to work correctly in agent-step-result function
ALTER TABLE task_step_results 
ADD CONSTRAINT task_step_results_task_id_step_id_unique 
UNIQUE (task_id, step_id);