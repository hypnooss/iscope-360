-- Tabela para rate limiting
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para consultas rápidas por chave e tempo
CREATE INDEX idx_rate_limits_key_time ON public.rate_limits(key, created_at DESC);

-- Index para limpeza automática
CREATE INDEX idx_rate_limits_created_at ON public.rate_limits(created_at);

-- Função de limpeza de registros antigos (24h)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limits 
  WHERE created_at < now() - INTERVAL '24 hours';
  RETURN NEW;
END;
$$;

-- Trigger para limpeza automática após inserções
CREATE TRIGGER trigger_cleanup_rate_limits
AFTER INSERT ON public.rate_limits
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_rate_limits();

-- Habilitar RLS (sem políticas = apenas service_role pode acessar)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Comentário para documentação
COMMENT ON TABLE public.rate_limits IS 'Tabela para controle de rate limiting em endpoints públicos. Apenas service_role tem acesso.';