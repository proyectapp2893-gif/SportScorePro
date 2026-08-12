alter table public.categories
add column if not exists registration_open boolean not null default true,
add column if not exists registration_deadline timestamptz,
add column if not exists min_roster_size integer,
add column if not exists max_roster_size integer,
add column if not exists roster_locked_message text;

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
  check (actor_type in ('master', 'client', 'delegate', 'system'));
end $$;

create table if not exists public.delegate_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  name text not null,
  email text,
  username text not null,
  password_hash text not null,
  assigned_password text,
  must_change_password boolean not null default true,
  password_changed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, username)
);

alter table public.delegate_users
add column if not exists assigned_password text,
add column if not exists must_change_password boolean not null default true,
add column if not exists password_changed_at timestamptz;

create table if not exists public.delegate_team_access (
  id uuid primary key default gen_random_uuid(),
  delegate_user_id uuid not null references public.delegate_users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (delegate_user_id, team_id)
);

alter table public.delegate_users enable row level security;
alter table public.delegate_team_access enable row level security;

drop policy if exists "delegate_users_no_public_access" on public.delegate_users;
drop policy if exists "delegate_team_access_no_public_access" on public.delegate_team_access;

revoke all on table public.delegate_users from public, anon, authenticated;
revoke all on table public.delegate_team_access from public, anon, authenticated;

grant select, insert, update, delete on table public.delegate_users to service_role;
grant select, insert, update, delete on table public.delegate_team_access to service_role;

create index if not exists idx_delegate_users_client_id on public.delegate_users(client_id);
create index if not exists idx_delegate_users_school_id on public.delegate_users(school_id);
create index if not exists idx_delegate_team_access_delegate on public.delegate_team_access(delegate_user_id);
create index if not exists idx_delegate_team_access_team on public.delegate_team_access(team_id);
