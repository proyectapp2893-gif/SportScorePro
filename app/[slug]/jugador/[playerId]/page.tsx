import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, BarChart3, Shield, Shirt, Square, Trophy } from 'lucide-react';
import PublicQrCard from '@/app/components/PublicQrCard';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { toTeamSlug } from '@/app/lib/team-slug';

export const dynamic = 'force-dynamic';

export default async function PublicPlayerPage({ params }: { params: Promise<{ slug: string; playerId: string }> }) {
  const { slug, playerId } = await params;
  const supabase = createServerSupabaseAdminClient();
  const { data: player } = await supabase
    .from('players')
    .select('id, name, shirt_number, team_id, teams!inner(id, name, schools(name, logo_url), categories!inner(id, name, sports(name), tournaments!inner(name, fixture_visible_to_public, clients!inner(slug, is_active))))')
    .eq('id', playerId)
    .eq('teams.categories.tournaments.clients.slug', slug)
    .eq('teams.categories.tournaments.clients.is_active', true)
    .maybeSingle();

  if (!player) notFound();
  const team: any = player.teams;
  const category: any = team.categories;
  if (category?.tournaments?.fixture_visible_to_public !== true) notFound();
  const { data: events } = await supabase
    .from('match_events')
    .select('event_type, matches!inner(status, matchdays!inner(category_id))')
    .eq('player_id', player.id)
    .eq('matches.matchdays.category_id', category.id)
    .in('matches.status', ['LIVE', 'FINISHED']);

  const totals = (events || []).reduce((result: Record<string, number>, event: any) => {
    result[event.event_type] = (result[event.event_type] || 0) + 1;
    return result;
  }, {});
  const points = (events || []).reduce((total, event: any) => total + (event.event_type === 'BASKET_3' ? 3 : event.event_type === 'BASKET_2' ? 2 : ['GOAL', 'BASKET_1'].includes(event.event_type) ? 1 : 0), 0);
  const teamPath = `/${slug}/equipo/${toTeamSlug(team.name)}`;
  const playerPath = `/${slug}/jugador/${player.id}`;

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="relative overflow-hidden bg-slate-950 px-4 py-8 text-white">
      {team.schools?.logo_url && <img src={team.schools.logo_url} alt="" className="pointer-events-none absolute right-4 top-1/2 h-72 w-72 -translate-y-1/2 object-contain opacity-[0.05] grayscale" />}
      <div className="relative mx-auto flex max-w-5xl items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-xl">{team.schools?.logo_url ? <img src={team.schools.logo_url} alt={`Logo de ${team.name}`} className="max-h-full max-w-full object-contain" /> : <Shield className="text-slate-300" />}</div>
        <div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400">Carné deportivo digital</p><h1 className="text-2xl font-black uppercase tracking-tight sm:text-4xl">{player.name}</h1><p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{team.name} · {category?.name}</p></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-blue-500">Jugador inscrito</p><h2 className="mt-1 text-2xl font-black uppercase">{player.name}</h2></div><div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600 text-3xl font-black text-white"><Shirt size={22} className="mr-1" />{player.shirt_number || '-'}</div></div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat icon={<Trophy size={17} />} value={points} label="Goles / puntos" color="emerald" />
            <Stat icon={<Award size={17} />} value={totals.ASSIST || 0} label="Asistencias" color="cyan" />
            <Stat icon={<Square size={17} />} value={totals.YELLOW || 0} label="Amarillas" color="amber" />
            <Stat icon={<Square size={17} />} value={totals.RED || 0} label="Rojas" color="red" />
            <Stat icon={<Award size={17} />} value={totals.MVP || 0} label="MVP" color="violet" />
          </div>
        </section>
        <section className="rounded-[2rem] border border-indigo-100 bg-indigo-50/50 p-5"><h2 className="font-black uppercase">Competencia</h2><p className="mt-2 text-sm font-semibold text-slate-600">{category?.tournaments?.name}</p><p className="text-sm font-semibold text-slate-600">{category?.sports?.name} · {category?.name}</p></section>
        <Link href={teamPath} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white"><BarChart3 size={16} /> Ver página del equipo</Link>
      </div>
      <PublicQrCard path={playerPath} title="QR del jugador" fileName={`jugador-${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />
    </div>
  </main>;
}

function Stat({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: 'emerald' | 'cyan' | 'amber' | 'red' | 'violet' }) {
  const styles = { emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700', cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700', amber: 'border-amber-100 bg-amber-50 text-amber-700', red: 'border-red-100 bg-red-50 text-red-700', violet: 'border-violet-100 bg-violet-50 text-violet-700' };
  return <div className={`rounded-2xl border p-4 ${styles[color]}`}>{icon}<p className="mt-2 text-2xl font-black">{value}</p><p className="text-[8px] font-black uppercase tracking-widest">{label}</p></div>;
}
