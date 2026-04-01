-- External Domain: analysis history table
create table if not exists public.external_domain_analysis_history (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.external_domains(id) on delete cascade,
  score integer not null,
  report_data jsonb not null,
  analyzed_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_ext_domain_history_domain_created_at
  on public.external_domain_analysis_history (domain_id, created_at desc);

alter table public.external_domain_analysis_history enable row level security;

-- SELECT: users can view history for external domains they can access via client
create policy "Users can view history of accessible external domains"
on public.external_domain_analysis_history
for select
using (
  exists (
    select 1
    from public.external_domains d
    where d.id = external_domain_analysis_history.domain_id
      and has_client_access(auth.uid(), d.client_id)
  )
);

-- INSERT: users with edit/full permission for external_domain can insert history
create policy "Users with edit permission can insert external domain history"
on public.external_domain_analysis_history
for insert
with check (
  exists (
    select 1
    from public.external_domains d
    where d.id = external_domain_analysis_history.domain_id
      and has_client_access(auth.uid(), d.client_id)
      and get_module_permission(auth.uid(), 'external_domain') = any (array['edit'::module_permission, 'full'::module_permission])
  )
);

-- Service role can manage all history (for edge functions / backend jobs)
create policy "Service role can manage external domain history"
on public.external_domain_analysis_history
for all
using ((auth.jwt() ->> 'role') = 'service_role')
with check ((auth.jwt() ->> 'role') = 'service_role');
