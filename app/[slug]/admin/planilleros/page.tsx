import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import PlanillerosClient from './PlanillerosClient';

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
