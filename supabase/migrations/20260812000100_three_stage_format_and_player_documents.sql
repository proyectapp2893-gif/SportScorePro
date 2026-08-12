alter table public.matchdays
add column if not exists stage_id uuid;

alter table public.matches
add column if not exists match_type text,
add column if not exists group_name text,
add column if not exists leg integer;

create table if not exists public.competition_stages (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 3),
  name text not null,
  stage_type text not null check (stage_type in ('LEAGUE', 'GROUPS', 'FINALS')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'COMPLETED')),
  legs integer not null default 1 check (legs in (1, 2)),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(category_id, stage_number)
);

alter table public.matchdays
drop constraint if exists matchdays_stage_id_fkey;
alter table public.matchdays
add constraint matchdays_stage_id_fkey foreign key (stage_id) references public.competition_stages(id) on delete cascade;

create table if not exists public.stage_team_entries (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.competition_stages(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  group_name text,
  seed integer,
  qualified_from_position integer,
  final_position integer,
  created_at timestamptz not null default now(),
  unique(stage_id, team_id)
);

create table if not exists public.player_documents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  document_type text not null check (document_type in ('IDENTITY_FRONT', 'IDENTITY_BACK')),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason text,
  uploaded_by_delegate_id uuid references public.delegate_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id, document_type)
);

create index if not exists idx_competition_stages_category on public.competition_stages(category_id);
create index if not exists idx_stage_entries_stage on public.stage_team_entries(stage_id);
create index if not exists idx_matchdays_stage on public.matchdays(stage_id);
create index if not exists idx_player_documents_player on public.player_documents(player_id);

alter table public.competition_stages enable row level security;
alter table public.stage_team_entries enable row level security;
alter table public.player_documents enable row level security;

revoke all on table public.competition_stages, public.stage_team_entries, public.player_documents from public, anon, authenticated;
grant select, insert, update, delete on table public.competition_stages, public.stage_team_entries, public.player_documents to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-documents', 'player-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "player_documents_no_public_access" on storage.objects;
create policy "player_documents_no_public_access"
on storage.objects for select to anon, authenticated
using (bucket_id = 'player-documents' and false);
