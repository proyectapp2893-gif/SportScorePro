create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null,
  actor_type text not null check (actor_type in ('master', 'client', 'system')),
  actor_id text,
  client_id uuid references public.clients(id) on delete set null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_client_id_created_at_idx on public.audit_logs(client_id, created_at desc);
create index if not exists audit_logs_action_created_at_idx on public.audit_logs(action, created_at desc);

alter table public.audit_logs enable row level security;

revoke all on table public.audit_logs from public;
revoke all on table public.audit_logs from anon;
revoke all on table public.audit_logs from authenticated;

grant select, insert, update, delete
on table public.audit_logs
to service_role;
