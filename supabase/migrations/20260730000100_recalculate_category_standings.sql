create or replace function public.sportscore_recalculate_category_standings(
  p_category_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if p_category_id is null then
    raise exception 'Category id is required';
  end if;

  update public.teams
  set played = 0,
      won = 0,
      drawn = 0,
      lost = 0,
      goals_for = 0,
      goals_against = 0,
      points = 0
  where category_id = p_category_id;

  with finished_matches as (
    select
      m.id,
      m.home_team_id,
      m.away_team_id,
      coalesce(m.home_score, 0) as home_score,
      coalesce(m.away_score, 0) as away_score
    from public.matches m
    join public.matchdays md on md.id = m.matchday_id
    where md.category_id = p_category_id
      and m.status = 'FINISHED'
      and m.home_team_id is not null
      and m.away_team_id is not null
  ),
  team_rows as (
    select
      home_team_id as team_id,
      1 as played,
      case when home_score > away_score then 1 else 0 end as won,
      case when home_score = away_score then 1 else 0 end as drawn,
      case when home_score < away_score then 1 else 0 end as lost,
      home_score as goals_for,
      away_score as goals_against,
      case when home_score > away_score then 3 when home_score = away_score then 1 else 0 end as points
    from finished_matches
    union all
    select
      away_team_id as team_id,
      1 as played,
      case when away_score > home_score then 1 else 0 end as won,
      case when away_score = home_score then 1 else 0 end as drawn,
      case when away_score < home_score then 1 else 0 end as lost,
      away_score as goals_for,
      home_score as goals_against,
      case when away_score > home_score then 3 when away_score = home_score then 1 else 0 end as points
    from finished_matches
  ),
  aggregated as (
    select
      team_id,
      sum(played)::integer as played,
      sum(won)::integer as won,
      sum(drawn)::integer as drawn,
      sum(lost)::integer as lost,
      sum(goals_for)::integer as goals_for,
      sum(goals_against)::integer as goals_against,
      sum(points)::integer as points
    from team_rows
    group by team_id
  ),
  updated as (
    update public.teams t
    set played = a.played,
        won = a.won,
        drawn = a.drawn,
        lost = a.lost,
        goals_for = a.goals_for,
        goals_against = a.goals_against,
        points = a.points
    from aggregated a
    where t.id = a.team_id
      and t.category_id = p_category_id
    returning t.id
  )
  select count(*) into v_updated_count from updated;

  return jsonb_build_object(
    'category_id', p_category_id,
    'updated_teams', v_updated_count
  );
end;
$$;

revoke all on function public.sportscore_recalculate_category_standings(uuid) from public;
revoke all on function public.sportscore_recalculate_category_standings(uuid) from anon;
revoke all on function public.sportscore_recalculate_category_standings(uuid) from authenticated;
grant execute on function public.sportscore_recalculate_category_standings(uuid) to service_role;
