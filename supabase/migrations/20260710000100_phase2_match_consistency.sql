create or replace function public.sportscore_record_match_event(
  p_match_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_event_type text,
  p_period text,
  p_match_second integer default null,
  p_minute_record integer default null,
  p_score_delta integer default 0,
  p_fair_play_delta integer default 0,
  p_generated_red boolean default false,
  p_sub_out_player_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_home_score integer;
  v_away_score integer;
  v_inserted_events integer := 0;
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

  v_home_score := coalesce(v_match.home_score, 0);
  v_away_score := coalesce(v_match.away_score, 0);

  if coalesce(p_score_delta, 0) <> 0 then
    if p_team_id = v_match.home_team_id then
      v_home_score := greatest(0, v_home_score + p_score_delta);
    else
      v_away_score := greatest(0, v_away_score + p_score_delta);
    end if;

    update public.matches
    set home_score = v_home_score,
        away_score = v_away_score
    where id = p_match_id;
  end if;

  if coalesce(p_fair_play_delta, 0) <> 0 then
    update public.teams
    set fair_play_points = coalesce(fair_play_points, 1000) - p_fair_play_delta
    where id = p_team_id;
  end if;

  if p_event_type = 'SUB' then
    if p_sub_out_player_id is null or p_player_id is null then
      raise exception 'Substitution requires both outgoing and incoming players';
    end if;

    insert into public.match_events(match_id, player_id, team_id, event_type, period, match_second, minute_record)
    values
      (p_match_id, p_sub_out_player_id, p_team_id, 'SUB_OUT', p_period, p_match_second, p_minute_record),
      (p_match_id, p_player_id, p_team_id, 'SUB_IN', p_period, p_match_second, p_minute_record);

    v_inserted_events := 2;
  elsif p_event_type <> 'SCORE_ADJUST' then
    insert into public.match_events(match_id, player_id, team_id, event_type, period, match_second, minute_record)
    values (p_match_id, p_player_id, p_team_id, p_event_type, p_period, p_match_second, p_minute_record);

    v_inserted_events := 1;

    if p_generated_red then
      insert into public.match_events(match_id, player_id, team_id, event_type, period, match_second, minute_record)
      values (p_match_id, p_player_id, p_team_id, 'RED', p_period, p_match_second, p_minute_record);

      v_inserted_events := v_inserted_events + 1;
    end if;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'home_score', v_home_score,
    'away_score', v_away_score,
    'inserted_events', v_inserted_events
  );
end;
$$;

create or replace function public.sportscore_finish_football_match(
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer,
  p_current_period text,
  p_home_penalty_score integer default null,
  p_away_penalty_score integer default null
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
  v_decider_home integer;
  v_decider_away integer;
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

  v_decider_home := case when p_current_period = 'PEN' then coalesce(p_home_penalty_score, 0) else coalesce(p_home_score, 0) end;
  v_decider_away := case when p_current_period = 'PEN' then coalesce(p_away_penalty_score, 0) else coalesce(p_away_score, 0) end;

  if v_decider_home > v_decider_away then
    v_home_points := 3;
    v_home_won := 1;
    v_away_lost := 1;
  elsif v_decider_away > v_decider_home then
    v_away_points := 3;
    v_away_won := 1;
    v_home_lost := 1;
  else
    v_home_points := 1;
    v_away_points := 1;
    v_home_drawn := 1;
    v_away_drawn := 1;
  end if;

  update public.matches
  set home_score = coalesce(p_home_score, 0),
      away_score = coalesce(p_away_score, 0),
      home_sets = case when p_current_period = 'PEN' then coalesce(p_home_penalty_score, 0) else null end,
      away_sets = case when p_current_period = 'PEN' then coalesce(p_away_penalty_score, 0) else null end,
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
      goals_for = coalesce(goals_for, 0) + coalesce(p_home_score, 0),
      goals_against = coalesce(goals_against, 0) + coalesce(p_away_score, 0),
      points = coalesce(points, 0) + v_home_points
  where id = v_match.home_team_id;

  update public.teams
  set played = coalesce(played, 0) + 1,
      won = coalesce(won, 0) + v_away_won,
      drawn = coalesce(drawn, 0) + v_away_drawn,
      lost = coalesce(lost, 0) + v_away_lost,
      goals_for = coalesce(goals_for, 0) + coalesce(p_away_score, 0),
      goals_against = coalesce(goals_against, 0) + coalesce(p_home_score, 0),
      points = coalesce(points, 0) + v_away_points
  where id = v_match.away_team_id;

  return jsonb_build_object(
    'match_id', p_match_id,
    'already_finished', false,
    'home_points', v_home_points,
    'away_points', v_away_points
  );
end;
$$;

create or replace function public.sportscore_apply_football_walkover(
  p_match_id uuid,
  p_absent_team_id uuid,
  p_no_show_penalty integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_is_home_absent boolean;
  v_winning_team_id uuid;
  v_home_score integer;
  v_away_score integer;
  v_home_won integer := 0;
  v_home_lost integer := 0;
  v_away_won integer := 0;
  v_away_lost integer := 0;
  v_home_points integer := 0;
  v_away_points integer := 0;
begin
  select id, home_team_id, away_team_id, status
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  if p_absent_team_id is distinct from v_match.home_team_id and p_absent_team_id is distinct from v_match.away_team_id then
    raise exception 'Absent team % does not belong to match %', p_absent_team_id, p_match_id;
  end if;

  if v_match.status = 'FINISHED' then
    return jsonb_build_object('match_id', p_match_id, 'already_finished', true);
  end if;

  v_is_home_absent := p_absent_team_id = v_match.home_team_id;
  v_winning_team_id := case when v_is_home_absent then v_match.away_team_id else v_match.home_team_id end;
  v_home_score := case when v_is_home_absent then 0 else 3 end;
  v_away_score := case when v_is_home_absent then 3 else 0 end;

  if v_is_home_absent then
    v_home_lost := 1;
    v_away_won := 1;
    v_away_points := 3;
  else
    v_home_won := 1;
    v_home_points := 3;
    v_away_lost := 1;
  end if;

  update public.matches
  set home_score = v_home_score,
      away_score = v_away_score,
      status = 'FINISHED',
      current_period = 'FIN',
      is_timer_running = false,
      timer_start_time = null,
      match_phase = 'FINISHED'
  where id = p_match_id;

  insert into public.match_events(match_id, team_id, player_id, event_type, minute_record, period)
  values
    (p_match_id, v_winning_team_id, null, 'GOAL', 0, 'T1'),
    (p_match_id, v_winning_team_id, null, 'GOAL', 0, 'T1'),
    (p_match_id, v_winning_team_id, null, 'GOAL', 0, 'T1'),
    (p_match_id, p_absent_team_id, null, 'WO', 0, 'T1');

  update public.teams
  set played = coalesce(played, 0) + 1,
      won = coalesce(won, 0) + v_home_won,
      lost = coalesce(lost, 0) + v_home_lost,
      goals_for = coalesce(goals_for, 0) + v_home_score,
      goals_against = coalesce(goals_against, 0) + v_away_score,
      points = coalesce(points, 0) + v_home_points
  where id = v_match.home_team_id;

  update public.teams
  set played = coalesce(played, 0) + 1,
      won = coalesce(won, 0) + v_away_won,
      lost = coalesce(lost, 0) + v_away_lost,
      goals_for = coalesce(goals_for, 0) + v_away_score,
      goals_against = coalesce(goals_against, 0) + v_home_score,
      points = coalesce(points, 0) + v_away_points
  where id = v_match.away_team_id;

  update public.teams
  set fair_play_points = coalesce(fair_play_points, 1000) - coalesce(p_no_show_penalty, 0)
  where id = p_absent_team_id and coalesce(p_no_show_penalty, 0) <> 0;

  return jsonb_build_object(
    'match_id', p_match_id,
    'already_finished', false,
    'home_score', v_home_score,
    'away_score', v_away_score,
    'absent_team_id', p_absent_team_id
  );
end;
$$;

revoke all on function public.sportscore_record_match_event(uuid, uuid, uuid, text, text, integer, integer, integer, integer, boolean, uuid) from public;
revoke all on function public.sportscore_finish_football_match(uuid, integer, integer, text, integer, integer) from public;
revoke all on function public.sportscore_apply_football_walkover(uuid, uuid, integer) from public;

grant execute on function public.sportscore_record_match_event(uuid, uuid, uuid, text, text, integer, integer, integer, integer, boolean, uuid) to authenticated, service_role;
grant execute on function public.sportscore_finish_football_match(uuid, integer, integer, text, integer, integer) to authenticated, service_role;
grant execute on function public.sportscore_apply_football_walkover(uuid, uuid, integer) to authenticated, service_role;

create or replace function public.sportscore_start_countdown_clock(
  p_match_id uuid,
  p_duration integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_duration integer;
  v_elapsed integer;
  v_remaining integer;
begin
  select id, is_timer_running, timer_start_time, timer_accumulated_seconds, match_duration_seconds
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  v_duration := coalesce(p_duration, v_match.match_duration_seconds, 600);
  v_elapsed := least(coalesce(v_match.timer_accumulated_seconds, 0), v_duration);
  v_remaining := greatest(0, v_duration - v_elapsed);

  if v_remaining <= 0 then
    update public.matches
    set is_timer_running = false,
        timer_start_time = null,
        timer_accumulated_seconds = v_duration,
        match_duration_seconds = v_duration,
        home_sets = 0
    where id = p_match_id;
  elsif not coalesce(v_match.is_timer_running, false) then
    update public.matches
    set is_timer_running = true,
        timer_start_time = now(),
        timer_accumulated_seconds = v_elapsed,
        match_duration_seconds = v_duration,
        match_phase = 'REGULAR',
        home_sets = v_remaining
    where id = p_match_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'is_timer_running', v_remaining > 0,
    'timer_accumulated_seconds', v_elapsed,
    'match_duration_seconds', v_duration,
    'remaining_seconds', v_remaining
  );
end;
$$;

create or replace function public.sportscore_pause_countdown_clock(
  p_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_duration integer;
  v_elapsed integer;
  v_remaining integer;
begin
  select id, is_timer_running, timer_start_time, timer_accumulated_seconds, match_duration_seconds
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  v_duration := coalesce(v_match.match_duration_seconds, 600);
  v_elapsed := coalesce(v_match.timer_accumulated_seconds, 0);

  if coalesce(v_match.is_timer_running, false) and v_match.timer_start_time is not null then
    v_elapsed := v_elapsed + greatest(0, floor(extract(epoch from (now() - v_match.timer_start_time)))::integer);
  end if;

  v_elapsed := least(v_elapsed, v_duration);
  v_remaining := greatest(0, v_duration - v_elapsed);

  update public.matches
  set is_timer_running = false,
      timer_start_time = null,
      timer_accumulated_seconds = v_elapsed,
      match_duration_seconds = v_duration,
      home_sets = v_remaining
  where id = p_match_id;

  return jsonb_build_object(
    'match_id', p_match_id,
    'is_timer_running', false,
    'timer_accumulated_seconds', v_elapsed,
    'match_duration_seconds', v_duration,
    'remaining_seconds', v_remaining
  );
end;
$$;

create or replace function public.sportscore_reset_countdown_clock(
  p_match_id uuid,
  p_duration integer,
  p_period text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration integer;
begin
  if p_duration is null or p_duration <= 0 then
    raise exception 'Countdown duration must be positive';
  end if;

  v_duration := p_duration;

  update public.matches
  set is_timer_running = false,
      timer_start_time = null,
      timer_accumulated_seconds = 0,
      match_duration_seconds = v_duration,
      match_phase = 'REGULAR',
      home_sets = v_duration,
      current_period = coalesce(p_period, current_period)
  where id = p_match_id;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'is_timer_running', false,
    'timer_accumulated_seconds', 0,
    'match_duration_seconds', v_duration,
    'remaining_seconds', v_duration
  );
end;
$$;

revoke all on function public.sportscore_start_countdown_clock(uuid, integer) from public;
revoke all on function public.sportscore_pause_countdown_clock(uuid) from public;
revoke all on function public.sportscore_reset_countdown_clock(uuid, integer, text) from public;

grant execute on function public.sportscore_start_countdown_clock(uuid, integer) to authenticated, service_role;
grant execute on function public.sportscore_pause_countdown_clock(uuid) to authenticated, service_role;
grant execute on function public.sportscore_reset_countdown_clock(uuid, integer, text) to authenticated, service_role;

create or replace function public.sportscore_start_elapsed_clock(
  p_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_elapsed integer;
begin
  select id, is_timer_running, timer_accumulated_seconds
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  v_elapsed := coalesce(v_match.timer_accumulated_seconds, 0);

  if not coalesce(v_match.is_timer_running, false) then
    update public.matches
    set is_timer_running = true,
        timer_start_time = now(),
        timer_accumulated_seconds = v_elapsed,
        home_sets = v_elapsed
    where id = p_match_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'is_timer_running', true,
    'timer_accumulated_seconds', v_elapsed,
    'elapsed_seconds', v_elapsed
  );
end;
$$;

create or replace function public.sportscore_pause_elapsed_clock(
  p_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_elapsed integer;
begin
  select id, is_timer_running, timer_start_time, timer_accumulated_seconds
    into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  v_elapsed := coalesce(v_match.timer_accumulated_seconds, 0);

  if coalesce(v_match.is_timer_running, false) and v_match.timer_start_time is not null then
    v_elapsed := v_elapsed + greatest(0, floor(extract(epoch from (now() - v_match.timer_start_time)))::integer);
  end if;

  update public.matches
  set is_timer_running = false,
      timer_start_time = null,
      timer_accumulated_seconds = v_elapsed,
      home_sets = v_elapsed
  where id = p_match_id;

  return jsonb_build_object(
    'match_id', p_match_id,
    'is_timer_running', false,
    'timer_accumulated_seconds', v_elapsed,
    'elapsed_seconds', v_elapsed
  );
end;
$$;

create or replace function public.sportscore_reset_elapsed_clock(
  p_match_id uuid,
  p_period text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches
  set is_timer_running = false,
      timer_start_time = null,
      timer_accumulated_seconds = 0,
      match_phase = 'REGULAR',
      home_sets = 0,
      current_period = coalesce(p_period, current_period)
  where id = p_match_id;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'is_timer_running', false,
    'timer_accumulated_seconds', 0,
    'elapsed_seconds', 0
  );
end;
$$;

revoke all on function public.sportscore_start_elapsed_clock(uuid) from public;
revoke all on function public.sportscore_pause_elapsed_clock(uuid) from public;
revoke all on function public.sportscore_reset_elapsed_clock(uuid, text) from public;

grant execute on function public.sportscore_start_elapsed_clock(uuid) to authenticated, service_role;
grant execute on function public.sportscore_pause_elapsed_clock(uuid) to authenticated, service_role;
grant execute on function public.sportscore_reset_elapsed_clock(uuid, text) to authenticated, service_role;
