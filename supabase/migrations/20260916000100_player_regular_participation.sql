create table if not exists public.player_match_participation (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  stage_id uuid references public.competition_stages(id) on delete set null,
  source text not null default 'MANUAL' check (source in ('EVENT','MANUAL','PLANILLERO')),
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED','VOIDED')),
  comment text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id, match_id)
);

create index if not exists player_participation_player_idx on public.player_match_participation(player_id, status);
create index if not exists player_participation_match_idx on public.player_match_participation(match_id, status);
alter table public.player_match_participation enable row level security;
revoke all on table public.player_match_participation from public, anon, authenticated;
grant select, insert, update, delete on table public.player_match_participation to service_role;
