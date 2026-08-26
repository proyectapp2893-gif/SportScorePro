import { getDelegateSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import DelegatePortalClient from './DelegatePortalClient';
import { inferMissingTeamByes } from '@/app/lib/tournaments/byes';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import DemoDelegatePortal from './DemoDelegatePortal';

async function loadTeamAccess(supabase: ReturnType<typeof createServerSupabaseAdminClient>, delegateId: string) {
  const fullQuery = await supabase
    .from('delegate_team_access')
    .select(`
      teams!inner(
        id, name, school_id, category_id,
        schools(name, logo_url),
        categories(
          id, name, gender, registration_open, registration_deadline, min_roster_size, max_roster_size, roster_locked_message,
          sports(name),
          tournaments(name, fair_play_enabled, fine_yellow_amount, fine_red_amount, fp_yellow_deduction, fp_red_deduction, schedule_dates, fixture_visible_to_delegates)
        )
      )
    `)
    .eq('delegate_user_id', delegateId);

  if (!fullQuery.error) return { rows: fullQuery.data || [], schemaReady: true };

  const fallbackQuery = await supabase
    .from('delegate_team_access')
    .select(`
      teams!inner(
        id, name, school_id, category_id,
        schools(name, logo_url),
        categories(
          id, name, gender,
          sports(name),
          tournaments(name, fair_play_enabled, fine_yellow_amount, fine_red_amount, fp_yellow_deduction, fp_red_deduction)
        )
      )
    `)
    .eq('delegate_user_id', delegateId);

  return { rows: fallbackQuery.data || [], schemaReady: false };
}

async function loadDelegatePortalData(slug: string) {
  const delegateId = await getDelegateSession(slug);
  if (!delegateId) return null;

  const supabase = createServerSupabaseAdminClient();
  const delegateQuery = await supabase
    .from('delegate_users')
    .select('id, name, username, client_id, school_id, is_active, must_change_password, clients!inner(slug, is_active)')
    .eq('id', delegateId)
    .eq('is_active', true)
    .eq('clients.slug', slug)
    .eq('clients.is_active', true)
    .maybeSingle();

  let delegate = delegateQuery.data;
  if (delegateQuery.error?.code === '42703') {
    const fallbackDelegateQuery = await supabase
      .from('delegate_users')
      .select('id, name, username, client_id, school_id, is_active, clients!inner(slug, is_active)')
      .eq('id', delegateId)
      .eq('is_active', true)
      .eq('clients.slug', slug)
      .eq('clients.is_active', true)
      .maybeSingle();

    delegate = fallbackDelegateQuery.data ? { ...fallbackDelegateQuery.data, must_change_password: false } : null;
  }

  if (!delegate) return null;

  const accessLoad = await loadTeamAccess(supabase, delegate.id);

  const teams = (accessLoad.rows || []).map((row: any) => ({
    ...row.teams,
    categories: {
      ...row.teams?.categories,
      registration_open: accessLoad.schemaReady ? row.teams?.categories?.registration_open : false,
      registration_deadline: accessLoad.schemaReady ? row.teams?.categories?.registration_deadline : null,
      min_roster_size: accessLoad.schemaReady ? row.teams?.categories?.min_roster_size : null,
      max_roster_size: accessLoad.schemaReady ? row.teams?.categories?.max_roster_size : null,
      roster_locked_message: accessLoad.schemaReady ? row.teams?.categories?.roster_locked_message : 'La configuración de inscripción aún no está aplicada.',
    },
  })).filter((team: any) => team?.id);
  const teamIds = teams.map((team: any) => team.id);
  const categoryIds = Array.from(new Set(teams.map((team: any) => team.category_id).filter(Boolean)));

  const playersByTeam: Record<string, any[]> = {};
  const eventsByTeam: Record<string, any[]> = {};
  const matchesByTeam: Record<string, any[]> = {};
  const eventsByMatch: Record<string, any[]> = {};
  const schedulesByTeam: Record<string, any[]> = {};
  const staffByTeam: Record<string, any[]> = {};

  if (teamIds.length > 0) {
    const playersQuery = await supabase
      .from('players')
      .select('id, team_id, name, identity_number, shirt_number, birth_year, birth_date, vinculo, relationship_detail, player_documents(id, document_type, status, rejection_reason, original_filename, updated_at)')
      .in('team_id', teamIds)
      .order('name');
    const players = playersQuery.error?.code === '42703'
      ? (await supabase.from('players').select('id, team_id, name, identity_number, shirt_number, birth_year, vinculo, player_documents(id, document_type, status, rejection_reason, original_filename, updated_at)').in('team_id', teamIds).order('name')).data
      : playersQuery.data;

    (players || []).forEach((player: any) => {
      if (!playersByTeam[player.team_id]) playersByTeam[player.team_id] = [];
      playersByTeam[player.team_id].push(player);
    });

    const { data: staff } = await supabase.from('team_staff').select('id, team_id, role, full_name').in('team_id', teamIds);
    (staff || []).forEach((member: any) => {
      if (!staffByTeam[member.team_id]) staffByTeam[member.team_id] = [];
      staffByTeam[member.team_id].push(member);
    });

    const eventsQuery = await supabase
      .from('match_events')
      .select('id, match_id, team_id, player_id, event_type, period, minute_record, fine_amount, fine_status, players(name, shirt_number), teams(name, schools(name, logo_url)), matches(status, matchdays(round_number))')
      .in('team_id', teamIds);

    const events = eventsQuery.error
      ? (await supabase
        .from('match_events')
        .select('id, match_id, team_id, player_id, event_type, period, minute_record, players(name, shirt_number), teams(name, schools(name, logo_url)), matches(status, matchdays(round_number))')
        .in('team_id', teamIds)).data
      : eventsQuery.data;

    (events || []).forEach((event: any) => {
      if (!eventsByTeam[event.team_id]) eventsByTeam[event.team_id] = [];
      eventsByTeam[event.team_id].push(event);
    });

    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time,
        home_team_id,
        away_team_id,
        home_team:teams!home_team_id(id, name, schools(name, logo_url)),
        away_team:teams!away_team_id(id, name, schools(name, logo_url)),
        matchdays!inner(scheduled_date, round_number, category_id)
      `)
      .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
      .order('matchdays(scheduled_date)', { ascending: true });

    (matches || []).forEach((match: any) => {
      [match.home_team?.id, match.away_team?.id].forEach((teamId) => {
        if (!teamId || !teamIds.includes(teamId)) return;
        if (!matchesByTeam[teamId]) matchesByTeam[teamId] = [];
        matchesByTeam[teamId].push(match);
      });
    });

    const matchIds = (matches || []).map((match: any) => match.id);
    if (matchIds.length > 0) {
      const { data: matchEvents } = await supabase
        .from('match_events')
        .select('id, match_id, team_id, player_id, event_type, period, minute_record, created_at, players(name, shirt_number), teams(name, schools(name, logo_url))')
        .in('match_id', matchIds)
        .in('event_type', ['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3', 'YELLOW', 'RED'])
        .order('created_at', { ascending: true });

      (matchEvents || []).forEach((event: any) => {
        if (!eventsByMatch[event.match_id]) eventsByMatch[event.match_id] = [];
        eventsByMatch[event.match_id].push(event);
      });
    }
  }

  if (categoryIds.length > 0) {
    const { data: categoryMatches } = await supabase
      .from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time,
        home_team_id,
        away_team_id,
        home_team:teams!home_team_id(id, name, schools(name, logo_url)),
        away_team:teams!away_team_id(id, name, schools(name, logo_url)),
        matchdays!inner(id, scheduled_date, round_number, category_id)
      `)
      .in('matchdays.category_id', categoryIds)
      .order('matchdays(scheduled_date)', { ascending: true });

    for (const team of teams) {
      const categorySchedule = (categoryMatches || []).filter((match: any) => match.matchdays?.category_id === team.category_id);
      const inferredByes = inferMissingTeamByes(categorySchedule, [team]);
      schedulesByTeam[team.id] = [...categorySchedule, ...inferredByes];
      if (inferredByes.length > 0) matchesByTeam[team.id] = [...(matchesByTeam[team.id] || []), ...inferredByes];
    }
  }

  return {
    delegate: {
      id: delegate.id,
      name: delegate.name,
      username: delegate.username,
      must_change_password: Boolean((delegate as any).must_change_password),
    },
    teams,
    playersByTeam,
    staffByTeam,
    eventsByTeam,
    matchesByTeam,
    eventsByMatch,
    schedulesByTeam,
    schemaReady: accessLoad.schemaReady,
  };
}

export default async function DelegatePortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === DEMO_SLUG) return <DemoDelegatePortal slug={slug} />;
  const initialData = await loadDelegatePortalData(slug);
  return <DelegatePortalClient slug={slug} initialData={initialData} />;
}
