-- Adicionar colunas para controle de configuração na tabela agents
ALTER TABLE public.agents 
ADD COLUMN config_updated_at timestamp with time zone DEFAULT now(),
ADD COLUMN config_fetched_at timestamp with time zone DEFAULT now();

-- Comentários para documentação
COMMENT ON COLUMN public.agents.config_updated_at IS 'Timestamp da última alteração de configuração do agent';
COMMENT ON COLUMN public.agents.config_fetched_at IS 'Timestamp da última vez que o agent buscou as configurações';