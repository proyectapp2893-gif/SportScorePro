do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'audit_logs_actor_type_check'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs drop constraint audit_logs_actor_type_check;
  end if;

  alter table public.audit_logs
  add constraint audit_logs_actor_type_check
  check (actor_type in ('master', 'client', 'delegate', 'scorekeeper', 'system'));
end $$;

create table if not exists public.scorekeeper_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  role text not null default 'SCOREKEEPER',
  email text,
  username text not null,
  password_hash text not null,
  assigned_password text,
  must_change_password boolean not null default true,
  password_changed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, username),
  constraint scorekeeper_users_role_check check (role in ('JUDGE', 'SCOREKEEPER', 'SUPERVISOR'))
);

create table if not exists public.scorekeeper_match_access (
  id uuid primary key default gen_random_uuid(),
  scorekeeper_user_id uuid not null references public.scorekeeper_users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (scorekeeper_user_id, match_id)
);

alter table public.scorekeeper_users enable row level security;
alter table public.scorekeeper_match_access enable row level security;

drop policy if exists "scorekeeper_users_no_public_access" on public.scorekeeper_users;
drop policy if exists "scorekeeper_match_access_no_public_access" on public.scorekeeper_match_access;

revoke all on table public.scorekeeper_users from public, anon, authenticated;
revoke all on table public.scorekeeper_match_access from public, anon, authenticated;

grant select, insert, update, delete on table public.scorekeeper_users to service_role;
grant select, insert, update, delete on table public.scorekeeper_match_access to service_role;

create index if not exists idx_scorekeeper_users_client_id on public.scorekeeper_users(client_id);
create index if not exists idx_scorekeeper_match_access_user on public.scorekeeper_match_access(scorekeeper_user_id);
create index if not exists idx_scorekeeper_match_access_match on public.scorekeeper_match_access(match_id);
