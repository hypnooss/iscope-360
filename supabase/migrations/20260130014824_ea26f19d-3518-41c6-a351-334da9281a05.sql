-- Fix linter: RLS enabled with no policies

-- rate_limits: should be service_role-only (used internally for throttling)
alter table public.rate_limits enable row level security;

drop policy if exists "Service role can manage rate limits" on public.rate_limits;
create policy "Service role can manage rate limits"
on public.rate_limits
for all
using ((auth.jwt() ->> 'role') = 'service_role')
with check ((auth.jwt() ->> 'role') = 'service_role');

-- task_step_results: tied to agent_tasks; allow service_role, and admins who can access the underlying task via agent/client
-- ESTA TABELA NÃO FOI CRIADA NO V1 E FOI SUBSTITUIDA POR UMA COLUNA JSONB.
-- alter table public.task_step_results enable row level security;
-- drop policy if exists "Service role can manage task step results" on public.task_step_results;
-- create policy "Service role can manage task step results"
-- on public.task_step_results
-- for all
-- using ((auth.jwt() ->> 'role') = 'service_role')
-- with check ((auth.jwt() ->> 'role') = 'service_role');
-- drop policy if exists "Admins can view task step results" on public.task_step_results;
-- create policy "Admins can view task step results"
-- on public.task_step_results
-- for select
-- using (
--   exists (
--     select 1
--     from public.agent_tasks t
--     join public.agents a on a.id = t.agent_id
--     where t.id = task_step_results.task_id
--       and (
--         public.has_role(auth.uid(), 'super_admin')
--         or (public.has_role(auth.uid(), 'workspace_admin') and public.has_client_access(auth.uid(), a.client_id))
--       )
--   )
-- );
