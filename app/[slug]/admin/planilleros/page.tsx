import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import PlanillerosClient from './PlanillerosClient';
import { DEMO_SLUG } from '@/app/lib/demo/config';

function demoScorekeeperData() {
  const demoMatches = [
    ['demo-match-1-1', 'EQUIPO AURORA', 'EQUIPO HORIZONTE', '2026-09-05', '14:00'],
    ['demo-match-1-2', 'EQUIPO CENTRAL', 'EQUIPO CAPITAL', '2026-09-05', '14:00'],
    ['demo-match-1-3', 'EQUIPO NORTE', 'EQUIPO SUR', '2026-09-05', '16:00'],
    ['demo-match-2-1', 'EQUIPO ÉLITE', 'EQUIPO UNIÓN', '2026-09-12', '14:00'],
    ['demo-match-2-2', 'EQUIPO VANGUARDIA', 'EQUIPO AURORA', '2026-09-12', '14:00'],
    ['demo-match-2-3', 'EQUIPO HORIZONTE', 'EQUIPO CENTRAL', '2026-09-12', '16:00'],
  ].map(([id, home, away, date, time], index) => ({ id, status: index < 3 ? 'FINISHED' : 'SCHEDULED', scheduled_time: time, home_team: { id: `${id}-home`, name: home }, away_team: { id: `${id}-away`, name: away }, matchdays: { scheduled_date: date, round_number: index < 3 ? 1 : 2, categories: { id: 'demo-category', name: 'CATEGORÍA DEMO', sports: { name: 'FÚTBOL' }, tournaments: { id: 'demo-tournament', name: 'TORNEO DEMOSTRATIVO' } } } }));
  const scorekeepers = ['JUEZ DEMO NORTE', 'JUEZ DEMO CENTRAL', 'PLANILLERO DEMO SUR'].map((name, index) => ({ id: `demo-scorekeeper-${index + 1}`, name, role: index === 2 ? 'PLANILLERO' : 'JUEZ', username: `juez.demo${index + 1}`, assigned_password: 'demo1234', must_change_password: false, is_active: true, created_at: '2026-08-26T12:00:00Z', scorekeeper_match_access: demoMatches.filter((_, matchIndex) => matchIndex % 3 === index).map((match) => ({ match_id: match.id, matches: match })) }));
  return { schemaReady: true, scorekeepers, tournaments: [{ id: 'demo-tournament', name: 'TORNEO DEMOSTRATIVO', created_at: '2026-08-26T12:00:00Z' }], matches: demoMatches };
}

async function loadScorekeeperRows(supabase: ReturnType<typeof createServerSupabaseAdminClient>, clientId: string) {
  const query = await supabase
    .from('scorekeeper_users')
    .select(`
      id,
      name,
      role,
      username,
      email,
      assigned_password,
      must_change_password,
      password_changed_at,
      is_active,
      created_at,
      scorekeeper_match_access(
        match_id,
        matches(
          id,
          status,
          scheduled_time,
          home_team:teams!home_team_id(id, name),
          away_team:teams!away_team_id(id, name),
          matchdays(
            scheduled_date,
            round_number,
            categories(
              id,
              name,
              sports(name),
              tournaments(id, name)
            )
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  return { rows: query.data || [], schemaReady: !query.error };
}

export default async function PlanillerosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === DEMO_SLUG) return <PlanillerosClient slug={slug} initialData={demoScorekeeperData()} />;
  if (!(await hasAdminSession(slug))) redirect(`/${slug}/login`);

  const clientId = await getClientIdBySlug(slug);
  if (!clientId) redirect('/');

  const supabase = createServerSupabaseAdminClient();
  const [scorekeeperLoad, { data: tournaments }, { data: matches }] = await Promise.all([
    loadScorekeeperRows(supabase, clientId),
    supabase
      .from('tournaments')
      .select('id, name, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    supabase
      .from('matches')
      .select(`
        id,
        status,
        scheduled_time,
        home_team:teams!home_team_id(id, name),
        away_team:teams!away_team_id(id, name),
        matchdays!inner(
          scheduled_date,
          round_number,
          categories!inner(
            id,
            name,
            sports(name),
            tournaments!inner(id, name, client_id)
          )
        )
      `)
      .eq('matchdays.categories.tournaments.client_id', clientId)
      .order('matchdays(scheduled_date)', { ascending: true }),
  ]);

  return (
    <PlanillerosClient
      slug={slug}
      initialData={{
        schemaReady: scorekeeperLoad.schemaReady,
        scorekeepers: scorekeeperLoad.rows,
        tournaments: tournaments || [],
        matches: matches || [],
      }}
    />
  );
}
