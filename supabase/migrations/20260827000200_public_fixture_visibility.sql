-- Sprint 2.4: separate delegate visibility from public publication.
alter table public.tournaments
  add column if not exists fixture_visible_to_public boolean not null default false;

comment on column public.tournaments.fixture_visible_to_public is
  'Controls publication of fixture, results and public competition statistics. Defaults to private.';

-- Authenticated delegates/admins keep the existing full-column grant; RLS remains
-- responsible for limiting them to their tenant/team. Anonymous access stays
-- restricted by the column grants established in the hardening migration.
grant select on public.players to authenticated;
grant select on public.match_events to authenticated;

-- Public competition metadata is visible only for explicitly published tournaments.
drop policy if exists "public_read_tournaments" on public.tournaments;
create policy "public_read_tournaments" on public.tournaments for select to anon
using (fixture_visible_to_public = true);

drop policy if exists "public_read_categories" on public.categories;
create policy "public_read_categories" on public.categories for select to anon
using (exists (select 1 from public.tournaments tr where tr.id = categories.tournament_id and tr.fixture_visible_to_public = true));

drop policy if exists "public_read_teams" on public.teams;
create policy "public_read_teams" on public.teams for select to anon
using (exists (select 1 from public.categories c join public.tournaments tr on tr.id = c.tournament_id where c.id = teams.category_id and tr.fixture_visible_to_public = true));

-- Replace the previous delegate-based public policies only after the new column exists.
drop policy if exists "public_read_players" on public.players;
create policy "public_read_players"
on public.players for select to anon
using (
  exists (
    select 1 from public.teams t
    join public.categories c on c.id = t.category_id
    join public.tournaments tr on tr.id = c.tournament_id
    where t.id = players.team_id and tr.fixture_visible_to_public = true
  )
);

drop policy if exists "public_read_match_events" on public.match_events;
create policy "public_read_match_events"
on public.match_events for select to anon
using (
  event_type in ('GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3', 'YELLOW', 'RED', 'ASSIST', 'MVP', 'SUB_IN', 'SUB_OUT', 'FOUL')
  and exists (
    select 1 from public.matches m
    join public.matchdays md on md.id = m.matchday_id
    join public.categories c on c.id = md.category_id
    join public.tournaments tr on tr.id = c.tournament_id
    where m.id = match_events.match_id and tr.fixture_visible_to_public = true
  )
);

drop policy if exists "public_read_matches" on public.matches;
create policy "public_read_matches"
on public.matches for select to anon
using (
  exists (
    select 1 from public.matchdays md
    join public.categories c on c.id = md.category_id
    join public.tournaments tr on tr.id = c.tournament_id
    where md.id = matches.matchday_id and tr.fixture_visible_to_public = true
  )
);

drop policy if exists "public_read_matchdays" on public.matchdays;
create policy "public_read_matchdays"
on public.matchdays for select to anon
using (
  exists (
    select 1 from public.categories c
    join public.tournaments tr on tr.id = c.tournament_id
    where c.id = matchdays.category_id and tr.fixture_visible_to_public = true
  )
);
