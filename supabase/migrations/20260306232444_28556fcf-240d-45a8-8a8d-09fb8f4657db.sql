
-- Table for dismissing threat items (false positives)
create table public.m365_threat_dismissals (
  id uuid primary key default gen_random_uuid(),
  tenant_record_id uuid not null references public.m365_tenants(id) on delete cascade,
  type text not null,
  label text not null,
  dismissed_by uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (tenant_record_id, type, label)
);

alter table public.m365_threat_dismissals enable row level security;

-- RLS: Users with client access via tenant can read
create policy "Users can view dismissals of accessible tenants"
on public.m365_threat_dismissals
for select
to authenticated
using (
  exists (
    select 1 from public.m365_tenants t
    where t.id = m365_threat_dismissals.tenant_record_id
    and has_client_access(auth.uid(), t.client_id)
  )
);

-- RLS: Users with edit permission can insert
create policy "Users with edit permission can insert dismissals"
on public.m365_threat_dismissals
for insert
to authenticated
with check (
  exists (
    select 1 from public.m365_tenants t
    where t.id = m365_threat_dismissals.tenant_record_id
    and has_client_access(auth.uid(), t.client_id)
    and get_module_permission(auth.uid(), 'm365') in ('edit', 'full')
  )
);

-- RLS: Users with edit permission can delete (restore)
create policy "Users with edit permission can delete dismissals"
on public.m365_threat_dismissals
for delete
to authenticated
using (
  exists (
    select 1 from public.m365_tenants t
    where t.id = m365_threat_dismissals.tenant_record_id
    and has_client_access(auth.uid(), t.client_id)
    and get_module_permission(auth.uid(), 'm365') in ('edit', 'full')
  )
);
