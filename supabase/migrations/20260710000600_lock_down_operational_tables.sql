-- Read-heavy public tournament data remains visible to fans and registration forms.
-- Mutations are restricted to service_role and routed through Server Actions.

alter table public.sports enable row level security;
alter table public.schools enable row level security;
alter table public.tournaments enable row level security;
alter table public.categories enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matchdays enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;

drop policy if exists "public_read_sports" on public.sports;
drop policy if exists "public_read_schools" on public.schools;
drop policy if exists "public_read_tournaments" on public.tournaments;
drop policy if exists "public_read_categories" on public.categories;
drop policy if exists "public_read_teams" on public.teams;
drop policy if exists "public_read_players" on public.players;
drop policy if exists "public_read_matchdays" on public.matchdays;
drop policy if exists "public_read_matches" on public.matches;
drop policy if exists "public_read_match_events" on public.match_events;

create policy "public_read_sports" on public.sports for select to anon, authenticated using (true);
create policy "public_read_schools" on public.schools for select to anon, authenticated using (true);
create policy "public_read_tournaments" on public.tournaments for select to anon, authenticated using (true);
create policy "public_read_categories" on public.categories for select to anon, authenticated using (true);
create policy "public_read_teams" on public.teams for select to anon, authenticated using (true);
create policy "public_read_players" on public.players for select to anon, authenticated using (true);
create policy "public_read_matchdays" on public.matchdays for select to anon, authenticated using (true);
create policy "public_read_matches" on public.matches for select to anon, authenticated using (true);
create policy "public_read_match_events" on public.match_events for select to anon, authenticated using (true);

revoke all on table public.sports from public, anon, authenticated;
revoke all on table public.schools from public, anon, authenticated;
revoke all on table public.tournaments from public, anon, authenticated;
revoke all on table public.categories from public, anon, authenticated;
revoke all on table public.teams from public, anon, authenticated;
revoke all on table public.players from public, anon, authenticated;
revoke all on table public.matchdays from public, anon, authenticated;
revoke all on table public.matches from public, anon, authenticated;
revoke all on table public.match_events from public, anon, authenticated;

grant select on table public.sports to anon, authenticated;
grant select on table public.schools to anon, authenticated;
grant select on table public.tournaments to anon, authenticated;
grant select on table public.categories to anon, authenticated;
grant select on table public.teams to anon, authenticated;
grant select on table public.players to anon, authenticated;
grant select on table public.matchdays to anon, authenticated;
grant select on table public.matches to anon, authenticated;
grant select on table public.match_events to anon, authenticated;

grant select, insert, update, delete on table public.sports to service_role;
grant select, insert, update, delete on table public.schools to service_role;
grant select, insert, update, delete on table public.tournaments to service_role;
grant select, insert, update, delete on table public.categories to service_role;
grant select, insert, update, delete on table public.teams to service_role;
grant select, insert, update, delete on table public.players to service_role;
grant select, insert, update, delete on table public.matchdays to service_role;
grant select, insert, update, delete on table public.matches to service_role;
grant select, insert, update, delete on table public.match_events to service_role;
