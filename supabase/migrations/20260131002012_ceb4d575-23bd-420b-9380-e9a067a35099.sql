-- Create public bucket for agent releases
insert into storage.buckets (id, name, public)
values ('agent-releases', 'agent-releases', true)
on conflict (id) do update set public = excluded.public;

-- Public read access to objects in agent-releases bucket
-- Note: storage.objects already has RLS; we add a SELECT policy only.
create policy "Public can read agent releases"
on storage.objects
for select
using (bucket_id = 'agent-releases');
