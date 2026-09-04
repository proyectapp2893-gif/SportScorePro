create table if not exists public.tournament_bulletins (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  bulletin_number integer not null check (bulletin_number > 0),
  snapshot jsonb not null,
  confirmed_at timestamptz not null default now(),
  unique (tournament_id, bulletin_number)
);

create index if not exists idx_tournament_bulletins_tournament on public.tournament_bulletins(tournament_id, bulletin_number desc);
alter table public.tournament_bulletins enable row level security;
revoke all on table public.tournament_bulletins from public, anon, authenticated;
grant select, insert, delete on table public.tournament_bulletins to service_role;

create or replace function public.prevent_confirmed_bulletin_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'Los boletines confirmados son inmutables';
end;
$$;

drop trigger if exists tournament_bulletins_immutable_update on public.tournament_bulletins;
create trigger tournament_bulletins_immutable_update before update on public.tournament_bulletins
for each row execute function public.prevent_confirmed_bulletin_changes();

drop trigger if exists tournament_bulletins_immutable_delete on public.tournament_bulletins;
create trigger tournament_bulletins_immutable_delete before delete on public.tournament_bulletins
for each row when (pg_trigger_depth() = 0) execute function public.prevent_confirmed_bulletin_changes();
