import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart3, CalendarDays, Clock3, Shield, Square, Trophy } from 'lucide-react';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '@/app/lib/sports/rules';
import { toTeamSlug } from '@/app/lib/team-slug';
import PublicQrCard from '@/app/components/PublicQrCard';

export const dynamic = 'force-dynamic';

function TeamLogo({ team, size = 'h-14 w-14' }: { team: any; size?: string }) {
  return <div className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm`}>{team?.schools?.logo_url ? <img src={team.schools.logo_url} alt={`Logo de ${team.name}`} className="max-h-full max-w-full object-contain" /> : <Shield className="text-slate-300" />}</div>;
}

function MatchCard({ match, selectedTeamId }: { match: any; selectedTeamId: string }) {
  const isLive = match.status === 'LIVE';
  const status = isLive ? 'En vivo' : match.status === 'FINISHED' ? 'Finalizado' : 'Programado';
  return <article className={`rounded-2xl border p-4 ${isLive ? 'border-red-200 bg-red-50/70' : 'border-slate-200 bg-white'}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400"><span className="flex items-center gap-1"><CalendarDays size={12} />{match.matchdays?.scheduled_date || 'Fecha pendiente'}</span><span className={isLive ? 'text-red-600' : ''}>{status} · {match.scheduled_time?.slice(0, 5) || '--:--'}</span></div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs">
      <div className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left ${match.home_team_id === selectedTeamId ? 'text-blue-700' : ''}`}><TeamLogo team={match.home_team} size="h-11 w-11" /><span className="break-words font-black uppercase">{match.home_team?.name}</span></div>
      <div className="min-w-[62px] rounded-xl bg-slate-950 px-3 py-2 text-center font-black text-white">{match.status === 'SCHEDULED' ? 'VS' : `${match.home_score || 0} - ${match.away_score || 0}`}</div>
      <div className={`flex min-w-0 flex-col-reverse items-center gap-2 text-center sm:flex-row sm:justify-end sm:text-right ${match.away_team_id === selectedTeamId ? 'text-blue-700' : ''}`}><span className="break-words font-black uppercase">{match.away_team?.name}</span><TeamLogo team={match.away_team} size="h-11 w-11" /></div>
    </div>
  </article>;
}

export default async function PublicTeamPage({ params }: { params: Promise<{ slug: string; teamSlug: string }> }) {
  const { slug, teamSlug } = await params;
  const supabase = createServerSupabaseAdminClient();
  const { data: teams } = await supabase.from('teams').select('id, name, category_id, schools(name, logo_url), categories!inner(id, name, sports(name), tournaments!inner(id, name, client_id, clients!inner(slug, is_active)))').eq('categories.tournaments.clients.slug', slug).eq('categories.tournaments.clients.is_active', true);
  const team: any = (teams || []).find((item: any) => toTeamSlug(item.name) === teamSlug);
  if (!team) notFound();

  const category = team.categories as any;
  const sportRules = getSportRules(category?.sports?.name);
  const [{ data: categoryTeams }, { data: matches }, { data: events }] = await Promise.all([
    supabase.from('teams').select('id, name, schools(name, logo_url)').eq('category_id', team.category_id),
    supabase.from('matches').select('id, status, home_score, away_score, home_sets, away_sets, home_team_id, away_team_id, scheduled_time, home_team:teams!home_team_id(id, name, schools(name, logo_url)), away_team:teams!away_team_id(id, name, schools(name, logo_url)), matchdays!inner(scheduled_date, round_number, category_id)').eq('matchdays.category_id', team.category_id).order('matchdays(scheduled_date)', { ascending: true }),
    supabase.from('match_events').select('id, team_id, player_id, event_type, players(name, shirt_number), matches!inner(status, matchdays!inner(category_id))').eq('team_id', team.id).eq('matches.matchdays.category_id', team.category_id).in('event_type', ['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3', 'YELLOW', 'RED']),
  ]);

  const standingsById: Record<string, any> = {};
  (categoryTeams || []).forEach((item: any) => { standingsById[item.id] = { ...item, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0 }; });
  (matches || []).filter((match: any) => match.status === 'FINISHED').forEach((match: any) => {
    const home = standingsById[match.home_team_id]; const away = standingsById[match.away_team_id];
    if (!home || !away) return;
    const score = getMatchScoreForStandings(match, sportRules); const points = getResultPoints(score.home, score.away, sportRules);
    home.played++; away.played++; home.points += points.home; away.points += points.away;
    if (score.countsForScoreColumns) { home.goals_for += score.home; home.goals_against += score.away; away.goals_for += score.away; away.goals_against += score.home; }
    if (score.home > score.away) { home.won++; away.lost++; } else if (score.away > score.home) { away.won++; home.lost++; } else { home.drawn++; away.drawn++; }
  });
  const standings = Object.values(standingsById).sort((a: any, b: any) => compareTeamsForStandings(a, b, sportRules));
  const teamStanding = standings.find((item: any) => item.id === team.id);
  const teamMatches = (matches || []).filter((match: any) => match.home_team_id === team.id || match.away_team_id === team.id);
  const upcoming = teamMatches.filter((match: any) => match.status !== 'FINISHED');
  const history = teamMatches.filter((match: any) => match.status === 'FINISHED').reverse();
  const scorersById: Record<string, any> = {};
  (events || []).filter((event: any) => event.matches?.status === 'LIVE' || event.matches?.status === 'FINISHED').forEach((event: any) => {
    if (!['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3'].includes(event.event_type) || !event.player_id) return;
    if (!scorersById[event.player_id]) scorersById[event.player_id] = { id: event.player_id, ...event.players, total: 0 };
    scorersById[event.player_id].total += event.event_type === 'BASKET_3' ? 3 : event.event_type === 'BASKET_2' ? 2 : 1;
  });
  const scorers = Object.values(scorersById).sort((a: any, b: any) => b.total - a.total);
  const yellow = (events || []).filter((event: any) => event.event_type === 'YELLOW').length;
  const red = (events || []).filter((event: any) => event.event_type === 'RED').length;

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="relative overflow-hidden bg-slate-950 px-4 py-8 text-white">
      {team.schools?.logo_url && <img src={team.schools.logo_url} alt="" className="pointer-events-none absolute right-4 top-1/2 h-72 w-72 -translate-y-1/2 object-contain opacity-[0.05] grayscale" />}
      <div className="relative mx-auto max-w-6xl"><div className="flex items-center gap-4"><TeamLogo team={team} size="h-24 w-24 sm:h-28 sm:w-28" /><div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-400">Página oficial del equipo</p><h1 className="text-3xl font-black uppercase tracking-tight sm:text-5xl">{team.name}</h1><p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{category?.sports?.name} · {category?.name} · {category?.tournaments?.name}</p></div></div></div>
    </header>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex justify-end">
        <div className="grid w-full gap-2 sm:flex sm:w-auto"><Link href={`/${slug}/fases`} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-700 transition-colors hover:bg-indigo-100"><Trophy size={16} /> Ver fases y finales</Link><Link href={`/${slug}/resultados`} className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-blue-700 transition-colors hover:bg-blue-100"><BarChart3 size={16} /> Ver resultados generales</Link></div>
      </div>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><Trophy size={18} className="text-blue-600" /><p className="mt-2 text-2xl font-black">{teamStanding ? standings.indexOf(teamStanding) + 1 : '-'}</p><p className="text-[9px] font-black uppercase tracking-widest text-blue-400">Posición</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-2xl font-black">{teamStanding?.points || 0}</p><p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Puntos</p></div><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><Square size={17} className="fill-amber-400 text-amber-400" /><p className="mt-2 text-2xl font-black">{yellow}</p><p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Amarillas</p></div><div className="rounded-2xl border border-red-100 bg-red-50 p-4"><Square size={17} className="fill-red-500 text-red-500" /><p className="mt-2 text-2xl font-black">{red}</p><p className="text-[9px] font-black uppercase tracking-widest text-red-500">Rojas</p></div></section>
      <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-[2rem] border border-blue-100 bg-blue-50/40 p-5"><h2 className="text-xl font-black uppercase">Próximos partidos</h2><p className="mb-4 text-[9px] font-black uppercase tracking-widest text-slate-400"><Clock3 size={12} className="inline" /> Programación oficial</p><div className="space-y-3">{upcoming.map((match: any) => <MatchCard key={match.id} match={match} selectedTeamId={team.id} />)}{upcoming.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Sin partidos pendientes</p>}</div></div><div className="rounded-[2rem] border border-slate-200 bg-white p-5"><h2 className="text-xl font-black uppercase">Últimos resultados</h2><p className="mb-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Historial del equipo</p><div className="space-y-3">{history.slice(0, 6).map((match: any) => <MatchCard key={match.id} match={match} selectedTeamId={team.id} />)}{history.length === 0 && <p className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Sin resultados registrados</p>}</div></div></section>
      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"><div className="overflow-hidden rounded-[2rem] border border-indigo-100 bg-white"><div className="bg-indigo-50 p-5"><h2 className="text-xl font-black uppercase">Tabla de posiciones</h2></div><div className="overflow-x-auto"><table className="min-w-[580px] w-full text-xs"><thead className="bg-slate-950 text-[9px] uppercase tracking-widest text-white"><tr><th className="p-3">#</th><th className="p-3 text-left">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr></thead><tbody className="divide-y divide-slate-100">{standings.map((item: any, index: number) => <tr key={item.id} className={item.id === team.id ? 'bg-indigo-50' : ''}><td className="p-3 text-center font-black">{index + 1}</td><td className="p-3 font-black uppercase">{item.name}</td><td className="text-center">{item.played}</td><td className="text-center">{item.won}</td><td className="text-center">{item.drawn}</td><td className="text-center">{item.lost}</td><td className="text-center">{item.goals_for - item.goals_against}</td><td className="text-center font-black text-blue-600">{item.points}</td></tr>)}</tbody></table></div></div><div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/50 p-5"><h2 className="text-xl font-black uppercase">Goleadores</h2><div className="mt-4 divide-y divide-emerald-100">{scorers.map((player: any, index: number) => <Link href={`/${slug}/jugador/${player.id}`} key={player.id || `${player.name}-${index}`} className="flex items-center justify-between py-3 transition-colors hover:text-emerald-700"><div><p className="text-xs font-black uppercase">{player.name}</p><p className="text-[9px] font-bold uppercase text-slate-400">Dorsal #{player.shirt_number || '-'} · Ver carné</p></div><span className="text-xl font-black text-emerald-600">{player.total}</span></Link>)}{scorers.length === 0 && <p className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Sin anotaciones</p>}</div></div></section>
      <PublicQrCard path={`/${slug}/equipo/${teamSlug}`} title="QR del equipo" fileName={`equipo-${teamSlug}`} />
    </div>
  </main>;
}
