-- External Domains (Domínio Externo)

-- 1) Tables
create table if not exists public.external_domains (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,

  client_id uuid not null references public.clients(id) on delete cascade,
  agent_id uuid null references public.agents(id) on delete set null,

  name text not null,
  domain text not null,
  description text null,

  status text not null default 'pending',
  last_scan_at timestamptz null,
  last_score integer null
);

create table if not exists public.external_domain_schedules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,

  domain_id uuid not null references public.external_domains(id) on delete cascade,
  frequency public.schedule_frequency not null,
  is_active boolean not null default true,
  next_run_at timestamptz null
);

-- 2) Indexes
create index if not exists idx_external_domains_client_id on public.external_domains(client_id);
create index if not exists idx_external_domains_agent_id on public.external_domains(agent_id);
create index if not exists idx_external_domain_schedules_domain_id on public.external_domain_schedules(domain_id);

-- 3) updated_at triggers
-- (function public.update_updated_at_column() already exists)

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_external_domains_updated_at'
  ) then
    create trigger trg_external_domains_updated_at
    before update on public.external_domains
    for each row execute function public.update_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_external_domain_schedules_updated_at'
  ) then
    create trigger trg_external_domain_schedules_updated_at
    before update on public.external_domain_schedules
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- 4) RLS
alter table public.external_domains enable row level security;
alter table public.external_domain_schedules enable row level security;

-- external_domains

drop policy if exists "Users can view external domains of accessible clients" on public.external_domains;
create policy "Users can view external domains of accessible clients"
on public.external_domains
for select
using (public.has_client_access(auth.uid(), client_id));

drop policy if exists "Users with edit permission can manage external domains" on public.external_domains;
create policy "Users with edit permission can manage external domains"
on public.external_domains
for all
using (
  public.has_client_access(auth.uid(), client_id)
  and public.get_module_permission(auth.uid(), 'external_domain') in ('edit', 'full')
)
with check (
  public.has_client_access(auth.uid(), client_id)
  and public.get_module_permission(auth.uid(), 'external_domain') in ('edit', 'full')
);

-- external_domain_schedules

drop policy if exists "Users can view schedules of accessible external domains" on public.external_domain_schedules;
create policy "Users can view schedules of accessible external domains"
on public.external_domain_schedules
for select
using (
  exists (
    select 1
    from public.external_domains d
    where d.id = external_domain_schedules.domain_id
      and public.has_client_access(auth.uid(), d.client_id)
  )
);

drop policy if exists "Users with edit permission can manage external domain schedules" on public.external_domain_schedules;
create policy "Users with edit permission can manage external domain schedules"
on public.external_domain_schedules
for all
using (
  exists (
    select 1
    from public.external_domains d
    where d.id = external_domain_schedules.domain_id
      and public.has_client_access(auth.uid(), d.client_id)
      and public.get_module_permission(auth.uid(), 'external_domain') in ('edit', 'full')
  )
)
with check (
  exists (
    select 1
    from public.external_domains d
    where d.id = external_domain_schedules.domain_id
      and public.has_client_access(auth.uid(), d.client_id)
      and public.get_module_permission(auth.uid(), 'external_domain') in ('edit', 'full')
  )
);
