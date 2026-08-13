create unique index if not exists idx_match_events_one_mvp_per_match
  on public.match_events(match_id)
  where event_type = 'MVP';

create table if not exists public.tournament_awards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  award_type text not null check (award_type in ('CHAMPION', 'RUNNER_UP', 'THIRD_PLACE', 'TOP_SCORER', 'BEST_GOALKEEPER', 'MVP', 'FAIR_PLAY', 'CUSTOM')),
  title text not null,
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  description text,
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (team_id is not null or player_id is not null)
);

create index if not exists idx_tournament_awards_tournament on public.tournament_awards(tournament_id);
create index if not exists idx_tournament_awards_category on public.tournament_awards(category_id);

alter table public.tournament_awards enable row level security;
revoke all on table public.tournament_awards from public, anon, authenticated;
grant select, insert, update, delete on table public.tournament_awards to service_role;

comment on table public.tournament_awards is
  'Premiaciones oficiales por torneo o categoría para ceremonia y publicación de resultados.';
