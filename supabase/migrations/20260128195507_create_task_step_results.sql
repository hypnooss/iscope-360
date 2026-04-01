-- =======================================================================================
-- CRIAÇÃO DA TABELA task_step_results QUE FOI SUPRIMIDA DURANTE OS DUMPS DO V1
-- Extraído diretamente pelo output fornecido pelo usuário a partir do Schema ativo.
-- =======================================================================================

CREATE TABLE IF NOT EXISTS public.task_step_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  step_id text NOT NULL,
  status text NOT NULL,
  data jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_step_results_pkey PRIMARY KEY (id),
  CONSTRAINT task_step_results_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.agent_tasks(id)
);

-- Ativação nativa de RLS
ALTER TABLE public.task_step_results ENABLE ROW LEVEL SECURITY;
