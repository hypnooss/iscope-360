-- Adicionar política SELECT para service role (necessário para RPC SECURITY DEFINER)
-- A função rpc_agent_heartbeat já roda como SECURITY DEFINER então bypassa RLS,
-- mas adicionar esta política é boa prática para outros casos de uso
CREATE POLICY "Service role can read system settings"
    ON public.system_settings FOR SELECT
    USING (true);