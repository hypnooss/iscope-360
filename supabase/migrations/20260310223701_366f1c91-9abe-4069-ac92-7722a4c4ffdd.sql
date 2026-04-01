
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  m365_analyzer_critical boolean not null default true,
  m365_general boolean not null default true,
  firewall_analysis boolean not null default true,
  external_domain_analysis boolean not null default true,
  attack_surface boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notification_preferences enable row level security;

create policy "Users can read own preferences"
  on public.notification_preferences for select
  to authenticated using (auth.uid() = user_id);

create policy "Users can insert own preferences"
  on public.notification_preferences for insert
  to authenticated with check (auth.uid() = user_id);

create policy "Users can update own preferences"
  on public.notification_preferences for update
  to authenticated using (auth.uid() = user_id);
