alter table public.players
  add column if not exists identity_number text;

comment on column public.players.identity_number is
  'Identificación normalizada del jugador. Debe ser única dentro de cada torneo.';

create index if not exists idx_players_identity_number
  on public.players(identity_number)
  where identity_number is not null;

create or replace function public.prevent_duplicate_player_identity_in_tournament()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_tournament_id uuid;
begin
  if new.identity_number is null or trim(new.identity_number) = '' then
    return new;
  end if;

  new.identity_number := upper(regexp_replace(trim(new.identity_number), '[^A-Z0-9]', '', 'g'));

  select c.tournament_id
    into target_tournament_id
  from public.teams t
  join public.categories c on c.id = t.category_id
  where t.id = new.team_id;

  perform pg_advisory_xact_lock(hashtextextended(target_tournament_id::text || ':' || new.identity_number, 0));

  if exists (
    select 1
    from public.players p
    join public.teams t on t.id = p.team_id
    join public.categories c on c.id = t.category_id
    where c.tournament_id = target_tournament_id
      and p.identity_number = new.identity_number
      and p.id is distinct from new.id
  ) then
    raise exception 'La identidad % ya está inscrita en este torneo.', new.identity_number
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_player_identity_in_tournament on public.players;
create trigger prevent_duplicate_player_identity_in_tournament
before insert or update of identity_number, team_id on public.players
for each row execute function public.prevent_duplicate_player_identity_in_tournament();
