import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, GitBranch, Shield, Trophy } from 'lucide-react';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';

export const dynamic = 'force-dynamic';

function Logo({ team }: { team: any }) {
  return <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5">{team?.schools?.logo_url ? <img src={team.schools.logo_url} alt={`Logo de ${team.name}`} className="max-h-full max-w-full object-contain" /> : <Shield size={20} className="text-slate-300" />}</div>;
}

export default async function PublicStagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServerSupabaseAdminClient();
  const { data: stages } = await supabase
    .from('competition_stages')
    .select('id, stage_number, name, stage_type, status, categories!inner(id, name, tournaments!inner(id, name, is_active, fixture_visible_to_public, clients!inner(slug, is_active)))')
    .eq('categories.tournaments.clients.slug', slug)
    .eq('categories.tournaments.clients.is_active', true)
    .order('stage_number');
  if (!stages?.length) notFound();

  const visibleStages = stages.filter((stage: any) => stage.categories?.tournaments?.is_active);
  const stageIds = visibleStages.map((stage: any) => stage.id);
  const { data: matches } = stageIds.length ? await supabase
    .from('matches')
    .select('id, status, home_score, away_score, home_sets, away_sets, match_type, group_name, leg, scheduled_time, home_team:teams!home_team_id(id, name, schools(logo_url)), away_team:teams!away_team_id(id, name, schools(logo_url)), matchdays!inner(stage_id, round_number, scheduled_date)')
    .in('matchdays.stage_id', stageIds)
    .order('matchdays(round_number)') : { data: [] };

  const tournament: any = (visibleStages[0] as any)?.categories?.tournaments;
  if (tournament?.fixture_visible_to_public !== true) return <main className="min-h-screen bg-slate-50 p-8 text-center"><div className="mx-auto max-w-xl rounded-[2rem] border border-indigo-100 bg-indigo-50 p-10"><Trophy className="mx-auto text-indigo-400" size={34} /><h1 className="mt-4 text-xl font-black uppercase text-indigo-800">Competencia aún no publicada</h1><p className="mt-2 text-sm font-semibold text-indigo-500">Las fases y finales estarán disponibles próximamente.</p></div></main>;
  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="bg-slate-950 px-4 py-8 text-white"><div className="mx-auto max-w-6xl"><Link href={`/${slug}/resultados`} className="mb-5 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-blue-400"><ArrowLeft size={14} /> Resultados generales</Link><p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-400">Formato oficial</p><h1 className="text-3xl font-black uppercase sm:text-5xl">Fases y finales</h1><p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">{tournament?.name}</p></div></header>
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {visibleStages.map((stage: any) => {
        const stageMatches = (matches || []).filter((match: any) => match.matchdays?.stage_id === stage.id);
        const groups = stage.stage_type === 'GROUPS' ? ['A', 'B'] : ['GENERAL'];
        return <section key={stage.id} className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-black text-white">{stage.stage_number}</div><div><p className="text-[9px] font-black uppercase tracking-widest text-blue-500">Fase {stage.stage_number}</p><h2 className="text-lg font-black uppercase">{stage.name.replace(/^Fase \d+\s*·\s*/i, '')}</h2></div></div><span className={`rounded-full px-4 py-2 text-[9px] font-black uppercase tracking-widest ${stage.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{stage.status === 'ACTIVE' ? 'En curso' : stage.status === 'COMPLETED' ? 'Finalizada' : 'Pendiente'}</span></div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">{groups.map((group) => { const groupMatches = group === 'GENERAL' ? stageMatches : stageMatches.filter((match: any) => match.group_name === group); return <div key={group} className="space-y-3">{group !== 'GENERAL' && <h3 className="flex items-center gap-2 text-sm font-black uppercase text-indigo-700"><GitBranch size={16} /> Grupo {group}</h3>}{groupMatches.map((match: any) => <article key={match.id} className={`rounded-2xl border p-4 ${match.match_type?.includes('FINAL') ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50'}`}><div className="mb-3 flex flex-wrap justify-between gap-2 text-[8px] font-black uppercase tracking-widest text-slate-400"><span>{match.match_type === 'GOLD_FINAL' ? 'Final Copa Oro' : match.match_type === 'SILVER_FINAL' ? 'Final segundo lugar' : `Jornada ${match.matchdays?.round_number}`}</span><span className="flex items-center gap-1"><CalendarDays size={11} /> {match.matchdays?.scheduled_date || 'Por asignar'} · {match.scheduled_time?.slice(0, 5) || '--:--'}</span></div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div className="flex min-w-0 items-center gap-2"><Logo team={match.home_team} /><span className="truncate text-xs font-black uppercase">{match.home_team?.name}</span></div><div className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">{match.status === 'SCHEDULED' ? 'VS' : `${match.home_score || 0} - ${match.away_score || 0}`}</div><div className="flex min-w-0 items-center justify-end gap-2 text-right"><span className="truncate text-xs font-black uppercase">{match.away_team?.name}</span><Logo team={match.away_team} /></div></div></article>)}{groupMatches.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">Aún no hay partidos generados</p>}</div>})}</div>
        </section>;
      })}
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-50 p-5 text-xs font-bold text-amber-800"><Trophy size={18} /> Las finales se crean automáticamente al cerrar la clasificación de los grupos.</div>
    </div>
  </main>;
}
