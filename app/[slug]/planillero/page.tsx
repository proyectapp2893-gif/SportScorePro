import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import PlanilleroPortalClient from './PlanilleroPortalClient';

async function loadOperationalData(slug: string) {
  if (!(await hasAdminSession(slug))) return null;

  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return null;

  const supabase = createServerSupabaseAdminClient();
  const scorekeepersQuery = await supabase
    .from('scorekeeper_users')
    .select(`
      id,
      name,
      role,
      username,
      is_active,
      scorekeeper_match_access(
        match_id,
        matches(
          id,
          status,
          home_score,
          away_score,
          home_sets,
          away_sets,
          current_period,
          scheduled_time,
          is_timer_running,
          timer_start_time,
          timer_accumulated_seconds,
          match_duration_seconds,
          match_phase,
          home_team:teams!home_team_id(id, name, schools(name, logo_url)),
          away_team:teams!away_team_id(id, name, schools(name, logo_url)),
          matchdays(
            scheduled_date,
            round_number,
            categories(
              id,
              name,
              gender,
              match_duration,
              sports(name, scoring_system),
              tournaments(
                id,
                name,
                fair_play_enabled,
                fp_yellow_deduction,
                fp_red_deduction,
                fp_no_show_deduction,
                fine_yellow_amount,
                fine_red_amount
              )
            )
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (scorekeepersQuery.error) {
    return { scorekeepers: [], schemaReady: false };
  }

  const scorekeepers = (scorekeepersQuery.data || []).map((user: any) => ({
    ...user,
    matches: (user.scorekeeper_match_access || [])
      .map((access: any) => access.matches)
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const dateA = `${a.matchdays?.scheduled_date || ''} ${a.scheduled_time || ''}`;
        const dateB = `${b.matchdays?.scheduled_date || ''} ${b.scheduled_time || ''}`;
        return dateA.localeCompare(dateB);
      }),
  }));

  return { scorekeepers, schemaReady: true };
}

export default async function PlanilleroPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const initialData = await loadOperationalData(slug);
  if (!initialData) redirect(`/${slug}/login`);

  return <PlanilleroPortalClient slug={slug} initialData={initialData} />;
}
