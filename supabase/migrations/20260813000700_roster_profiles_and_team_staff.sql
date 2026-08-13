alter table public.players
  add column if not exists birth_date date,
  add column if not exists relationship_detail text;

comment on column public.players.relationship_detail is
  'Promoción para EX-ALUMNO o nombre completo del estudiante para PADRE DE FAMILIA.';

alter table public.player_documents
  drop constraint if exists player_documents_document_type_check;

alter table public.player_documents
  add constraint player_documents_document_type_check
  check (document_type in ('FACE_PHOTO', 'IDENTITY_FRONT', 'IDENTITY_BACK'));

create table if not exists public.team_staff (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  role text not null check (role in ('HEAD_COACH', 'ASSISTANT_COACH')),
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, role)
);

create index if not exists idx_team_staff_team on public.team_staff(team_id);
alter table public.team_staff enable row level security;
revoke all on table public.team_staff from public, anon, authenticated;
grant select, insert, update, delete on table public.team_staff to service_role;

comment on table public.team_staff is
  'Cuerpo técnico oficial inscrito por cada delegación.';
