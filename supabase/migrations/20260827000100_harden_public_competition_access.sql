-- Sprint 2.2: expose only the public competition projection through the existing tables.
-- Administrative/delegate server actions use service_role and are unaffected by these grants.

-- Players: public pages need only the sporting identity, never civil/document data.
revoke select on table public.players from anon, authenticated;
grant select (id, name, shirt_number, team_id) on table public.players to anon, authenticated;

drop policy if exists "public_read_players" on public.players;
create policy "public_read_players"
on public.players for select to anon, authenticated
using (
  exists (
    select 1
    from public.teams t
    join public.categories c on c.id = t.category_id
    join public.tournaments tr on tr.id = c.tournament_id
    where t.id = players.team_id
      and tr.fixture_visible_to_delegates = true
  )
);

-- Match events: public consumers may see sporting events, never fines or internal status fields.
revoke select on table public.match_events from anon, authenticated;
grant select (id, match_id, team_id, player_id, event_type, period, minute_record, created_at)
on table public.match_events to anon, authenticated;

drop policy if exists "public_read_match_events" on public.match_events;
create policy "public_read_match_events"
on public.match_events for select to anon, authenticated
using (
  event_type in ('GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3', 'YELLOW', 'RED', 'ASSIST', 'MVP', 'SUB_IN', 'SUB_OUT', 'FOUL')
  and exists (
    select 1
    from public.matches m
    join public.matchdays md on md.id = m.matchday_id
    join public.categories c on c.id = md.category_id
    join public.tournaments tr on tr.id = c.tournament_id
    where m.id = match_events.match_id
      and tr.fixture_visible_to_delegates = true
  )
);

-- Public fixture rows must respect the existing publication switch.
drop policy if exists "public_read_matches" on public.matches;
create policy "public_read_matches"
on public.matches for select to anon, authenticated
using (
  exists (
    select 1
    from public.matchdays md
    join public.categories c on c.id = md.category_id
    join public.tournaments tr on tr.id = c.tournament_id
    where md.id = matches.matchday_id
      and tr.fixture_visible_to_delegates = true
  )
);

drop policy if exists "public_read_matchdays" on public.matchdays;
create policy "public_read_matchdays"
on public.matchdays for select to anon, authenticated
using (
  exists (
    select 1
    from public.categories c
    join public.tournaments tr on tr.id = c.tournament_id
    where c.id = matchdays.category_id
      and tr.fixture_visible_to_delegates = true
  )
);
