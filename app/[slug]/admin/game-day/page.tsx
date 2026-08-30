import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import GameDayDashboard from './GameDayDashboard';
import { getGameDay } from './actions';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import DemoGameDayPage from '@/app/demo-7c9f3a-sportscore/admin/game-day/page';

export const dynamic = 'force-dynamic';

export default async function GameDayPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tournament?: string; date?: string }> }) {
  const { slug } = await params; const query = await searchParams;
  if (slug === DEMO_SLUG) return <DemoGameDayPage />;
  if (!(await hasAdminSession(slug))) redirect(`/${slug}/admin`);
  const supabase = createServerSupabaseAdminClient();
  const { data: tournaments } = await supabase.from('tournaments').select('id,name,is_active,schedule_dates').eq('client_id', (await supabase.from('clients').select('id').eq('slug', slug).single()).data?.id || '').order('is_active', { ascending: false }).order('created_at', { ascending: false });
  const tournament = tournaments?.find((item) => item.id === query.tournament) || tournaments?.[0];
  const fallbackDate = tournament?.schedule_dates?.find((value: unknown): value is string => typeof value === 'string') || new Date().toISOString().slice(0, 10);
  if (!tournament) return <GameDayDashboard tournamentName="Sin torneo seleccionado" slug={slug} date={query.date || fallbackDate} matches={[]} />;
  // Prefer the tournament's first configured date over the device date. This
  // avoids an apparently empty Game Day when the tournament is scheduled for a
  // different day than today; an explicit query date still always wins.
  const date = query.date || fallbackDate;
  const result = await getGameDay(slug, tournament.id, date);
  return <GameDayDashboard tournamentName={tournament.name} tournamentId={tournament.id} slug={slug} date={date} matches={result.success ? result.data.matches : []} />;
}
