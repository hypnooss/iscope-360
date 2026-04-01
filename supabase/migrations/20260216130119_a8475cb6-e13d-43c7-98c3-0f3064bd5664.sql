
-- Step 1: Add fortigate_analyzer to agent_task_type enum
ALTER TYPE public.agent_task_type ADD VALUE IF NOT EXISTS 'fortigate_analyzer';
