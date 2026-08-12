create or replace function public.sportscore_start_live_match(
  p_match_id uuid,
  p_period text,
  p_reset_scores boolean default false,
  p_lineups jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_invalid_lineups integer := 0;
  v_lineup_count integer := 0;
begin
  select id, home_team_id, away_team_id
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  with lineup_rows as (
    select *
    from jsonb_to_recordset(coalesce(p_lineups, '[]'::jsonb))
      as x(player_id uuid, team_id uuid, period text)
  )
  select count(*)
    into v_invalid_lineups
  from lineup_rows
  where team_id is distinct from v_match.home_team_id
    and team_id is distinct from v_match.away_team_id;

  if v_invalid_lineups > 0 then
    raise exception 'Lineup contains players for teams outside match %', p_match_id;
  end if;

  update public.matches
  set status = 'LIVE',
      current_period = p_period,
      home_score = case when p_reset_scores then 0 else home_score end,
      away_score = case when p_reset_scores then 0 else away_score end
  where id = p_match_id;

  insert into public.match_events(match_id, player_id, team_id, event_type, period)
  select p_match_id, player_id, team_id, 'STARTING_LINEUP', coalesce(period, '0')
  from jsonb_to_recordset(coalesce(p_lineups, '[]'::jsonb))
    as x(player_id uuid, team_id uuid, period text);

  get diagnostics v_lineup_count = row_count;

  return jsonb_build_object(
    'match_id', p_match_id,
    'lineups', v_lineup_count
  );
end;
$$;

create or replace function public.sportscore_revert_last_scoring_event(
  p_match_id uuid,
  p_team_id uuid,
  p_period text default null,
  p_update_match_score boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_event_id uuid;
  v_home_score integer;
  v_away_score integer;
begin
  select id, home_team_id, away_team_id, home_score, away_score
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  if p_team_id is distinct from v_match.home_team_id and p_team_id is distinct from v_match.away_team_id then
    raise exception 'Team % does not belong to match %', p_team_id, p_match_id;
  end if;

  select id
    into v_event_id
  from public.match_events
  where match_id = p_match_id
    and team_id = p_team_id
    and event_type = 'GOAL'
    and (p_period is null or period = p_period)
  order by created_at desc
  limit 1;

  if v_event_id is null then
    return jsonb_build_object('success', false, 'error', 'No hay puntos recientes para restar.');
  end if;

  delete from public.match_events where id = v_event_id;

  v_home_score := coalesce(v_match.home_score, 0);
  v_away_score := coalesce(v_match.away_score, 0);

  if p_update_match_score then
    if p_team_id = v_match.home_team_id then
      v_home_score := greatest(0, v_home_score - 1);
    else
      v_away_score := greatest(0, v_away_score - 1);
    end if;

    update public.matches
    set home_score = v_home_score,
        away_score = v_away_score
    where id = p_match_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'home_score', v_home_score,
    'away_score', v_away_score
  );
end;
$$;

create or replace function public.sportscore_finish_court_match(
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer,
  p_sport text,
  p_set_history jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_home_points integer := 0;
  v_away_points integer := 0;
  v_home_won integer := 0;
  v_home_drawn integer := 0;
  v_home_lost integer := 0;
  v_away_won integer := 0;
  v_away_drawn integer := 0;
  v_away_lost integer := 0;
  v_home_score integer := greatest(0, coalesce(p_home_score, 0));
  v_away_score integer := greatest(0, coalesce(p_away_score, 0));
begin
  select id, home_team_id, away_team_id, status
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  if v_match.status = 'FINISHED' then
    return jsonb_build_object('match_id', p_match_id, 'already_finished', true);
  end if;

  if p_sport = 'basketball' then
    if v_home_score > v_away_score then
      v_home_points := 2; v_away_points := 1; v_home_won := 1; v_away_lost := 1;
    elsif v_away_score > v_home_score then
      v_away_points := 2; v_home_points := 1; v_away_won := 1; v_home_lost := 1;
    else
      v_home_points := 1; v_away_points := 1; v_home_drawn := 1; v_away_drawn := 1;
    end if;
  elsif p_sport = 'volleyball' then
    if v_home_score > v_away_score then
      v_home_points := 3; v_home_won := 1; v_away_lost := 1;
    elsif v_away_score > v_home_score then
      v_away_points := 3; v_away_won := 1; v_home_lost := 1;
    end if;
  else
    if v_home_score > v_away_score then
      v_home_points := 3; v_home_won := 1; v_away_lost := 1;
    elsif v_away_score > v_home_score then
      v_away_points := 3; v_away_won := 1; v_home_lost := 1;
    else
      v_home_points := 1; v_away_points := 1; v_home_drawn := 1; v_away_drawn := 1;
    end if;
  end if;

  update public.matches
  set home_score = v_home_score,
      away_score = v_away_score,
      away_sets = case when p_sport = 'volleyball' then coalesce(p_set_history, '[]'::jsonb)::text else away_sets end,
      status = 'FINISHED',
      is_timer_running = false,
      timer_start_time = null,
      match_phase = 'FINISHED'
  where id = p_match_id;

  update public.teams
  set played = coalesce(played, 0) + 1,
      won = coalesce(won, 0) + v_home_won,
      drawn = coalesce(drawn, 0) + v_home_drawn,
      lost = coalesce(lost, 0) + v_home_lost,
      goals_for = coalesce(goals_for, 0) + v_home_score,
      goals_against = coalesce(goals_against, 0) + v_away_score,
      points = coalesce(points, 0) + v_home_points
  where id = v_match.home_team_id;

  update public.teams
  set played = coalesce(played, 0) + 1,
      won = coalesce(won, 0) + v_away_won,
      drawn = coalesce(drawn, 0) + v_away_drawn,
      lost = coalesce(lost, 0) + v_away_lost,
      goals_for = coalesce(goals_for, 0) + v_away_score,
      goals_against = coalesce(goals_against, 0) + v_home_score,
      points = coalesce(points, 0) + v_away_points
  where id = v_match.away_team_id;

  return jsonb_build_object(
    'match_id', p_match_id,
    'home_points', v_home_points,
    'away_points', v_away_points
  );
end;
$$;

revoke all on function public.sportscore_start_live_match(uuid, text, boolean, jsonb) from public;
revoke all on function public.sportscore_start_live_match(uuid, text, boolean, jsonb) from anon;
revoke all on function public.sportscore_start_live_match(uuid, text, boolean, jsonb) from authenticated;
grant execute on function public.sportscore_start_live_match(uuid, text, boolean, jsonb) to service_role;

revoke all on function public.sportscore_revert_last_scoring_event(uuid, uuid, text, boolean) from public;
revoke all on function public.sportscore_revert_last_scoring_event(uuid, uuid, text, boolean) from anon;
revoke all on function public.sportscore_revert_last_scoring_event(uuid, uuid, text, boolean) from authenticated;
grant execute on function public.sportscore_revert_last_scoring_event(uuid, uuid, text, boolean) to service_role;

revoke all on function public.sportscore_finish_court_match(uuid, integer, integer, text, jsonb) from public;
revoke all on function public.sportscore_finish_court_match(uuid, integer, integer, text, jsonb) from anon;
revoke all on function public.sportscore_finish_court_match(uuid, integer, integer, text, jsonb) from authenticated;
grant execute on function public.sportscore_finish_court_match(uuid, integer, integer, text, jsonb) to service_role;
