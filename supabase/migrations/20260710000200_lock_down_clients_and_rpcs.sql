-- Lock down sensitive tenant credentials and privileged match RPCs.
-- Apply after 20260710000100_phase2_match_consistency.sql.

alter table public.clients enable row level security;

drop policy if exists "public_read_active_client_metadata" on public.clients;

create policy "public_read_active_client_metadata"
on public.clients
for select
to anon, authenticated
using (is_active = true);

revoke all on table public.clients from public;
revoke all on table public.clients from anon;
revoke all on table public.clients from authenticated;

grant select (id, name, slug, logo_url, is_active, created_at)
on table public.clients
to anon, authenticated;

grant select, insert, update, delete
on table public.clients
to service_role;

revoke all on function public.sportscore_record_match_event(uuid, uuid, uuid, text, text, integer, integer, integer, integer, boolean, uuid) from public;
revoke all on function public.sportscore_record_match_event(uuid, uuid, uuid, text, text, integer, integer, integer, integer, boolean, uuid) from anon;
revoke all on function public.sportscore_record_match_event(uuid, uuid, uuid, text, text, integer, integer, integer, integer, boolean, uuid) from authenticated;
grant execute on function public.sportscore_record_match_event(uuid, uuid, uuid, text, text, integer, integer, integer, integer, boolean, uuid) to service_role;

revoke all on function public.sportscore_finish_football_match(uuid, integer, integer, text, integer, integer) from public;
revoke all on function public.sportscore_finish_football_match(uuid, integer, integer, text, integer, integer) from anon;
revoke all on function public.sportscore_finish_football_match(uuid, integer, integer, text, integer, integer) from authenticated;
grant execute on function public.sportscore_finish_football_match(uuid, integer, integer, text, integer, integer) to service_role;

revoke all on function public.sportscore_apply_football_walkover(uuid, uuid, integer) from public;
revoke all on function public.sportscore_apply_football_walkover(uuid, uuid, integer) from anon;
revoke all on function public.sportscore_apply_football_walkover(uuid, uuid, integer) from authenticated;
grant execute on function public.sportscore_apply_football_walkover(uuid, uuid, integer) to service_role;

revoke all on function public.sportscore_start_countdown_clock(uuid, integer) from public;
revoke all on function public.sportscore_start_countdown_clock(uuid, integer) from anon;
revoke all on function public.sportscore_start_countdown_clock(uuid, integer) from authenticated;
grant execute on function public.sportscore_start_countdown_clock(uuid, integer) to service_role;

revoke all on function public.sportscore_pause_countdown_clock(uuid) from public;
revoke all on function public.sportscore_pause_countdown_clock(uuid) from anon;
revoke all on function public.sportscore_pause_countdown_clock(uuid) from authenticated;
grant execute on function public.sportscore_pause_countdown_clock(uuid) to service_role;

revoke all on function public.sportscore_reset_countdown_clock(uuid, integer, text) from public;
revoke all on function public.sportscore_reset_countdown_clock(uuid, integer, text) from anon;
revoke all on function public.sportscore_reset_countdown_clock(uuid, integer, text) from authenticated;
grant execute on function public.sportscore_reset_countdown_clock(uuid, integer, text) to service_role;

revoke all on function public.sportscore_start_elapsed_clock(uuid) from public;
revoke all on function public.sportscore_start_elapsed_clock(uuid) from anon;
revoke all on function public.sportscore_start_elapsed_clock(uuid) from authenticated;
grant execute on function public.sportscore_start_elapsed_clock(uuid) to service_role;

revoke all on function public.sportscore_pause_elapsed_clock(uuid) from public;
revoke all on function public.sportscore_pause_elapsed_clock(uuid) from anon;
revoke all on function public.sportscore_pause_elapsed_clock(uuid) from authenticated;
grant execute on function public.sportscore_pause_elapsed_clock(uuid) to service_role;

revoke all on function public.sportscore_reset_elapsed_clock(uuid, text) from public;
revoke all on function public.sportscore_reset_elapsed_clock(uuid, text) from anon;
revoke all on function public.sportscore_reset_elapsed_clock(uuid, text) from authenticated;
grant execute on function public.sportscore_reset_elapsed_clock(uuid, text) to service_role;
