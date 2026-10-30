'use client';

import { useState } from 'react';
import { CalendarDays, ShieldCheck, Trophy } from 'lucide-react';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '../../lib/sports/rules';
import { calculateLoyolaCumulativeStats, calculateLoyolaFairPlayDeductions, calculateLoyolaGroupStandings, type LoyolaCardEvent } from '../../lib/tournaments/loyola-phase-standings';

type Props = {
  selectedTeamId: string;
  teams: any[];
  matches: any[];
  eventsByMatch: Record<string, any[]>;
  drawEvents: Array<{ id: string; created_at: string; action: string; metadata?: { teamName?: string; groupName?: string | null } }>;
  tournament: any;
  sportName: string;
};

function phaseOf(round: number) { return round === 100 ? 3 : Math.max(1, Math.floor((round - 1) / 100) + 1); }
function roundLabel(round: number) {
  if (round === 100) return 'Finales';
  if (round === 201) return 'Semifinales';
  if (round === 202) return 'Final';
  return `Jornada ${((round - 1) % 100) + 1}`;
}
function dateLabel(value: string | null | undefined) { return value ? value.split('-').reverse().join('/') : 'Fecha pendiente'; }

export default function DelegateLoyolaProgress({ selectedTeamId, teams, matches, eventsByMatch, drawEvents, tournament, sportName }: Props) {
  const [selectedPhase, setSelectedPhase] = useState(2);
  const rules = getSportRules(sportName);
  const startingPoints = Number(tournament?.fp_starting_points ?? 0);
  const fairPlayEnabled = Boolean(tournament?.fair_play_enabled);
  const yellowDeduction = Number(tournament?.fp_yellow_deduction ?? 100);
  const redDeduction = Number(tournament?.fp_red_deduction ?? 300);
  const normalizedMatches = matches.map((match) => ({
    id: match.id, round_number: Number(match.matchdays?.round_number || 0), status: match.status,
    home_team_id: match.home_team_id, away_team_id: match.away_team_id,
    home_score: match.home_score, away_score: match.away_score, home_sets: match.home_sets, away_sets: match.away_sets,
  }));
  const allEvents = Object.values(eventsByMatch).flat();
  const cards: LoyolaCardEvent[] = allEvents.filter((event) => event.event_type === 'YELLOW' || event.event_type === 'RED').map((event) => ({
    match_id: event.match_id, team_id: event.team_id, event_type: event.event_type,
    player_id: event.player_id, created_at: event.created_at, period: event.period,
    match_second: event.match_second, minute_record: event.minute_record,
  }));
  const regularMatches = normalizedMatches.filter((match) => match.round_number < 100);
  const cumulativeTeams = calculateLoyolaCumulativeStats(teams, normalizedMatches, sportName);
  const leastConceded = cumulativeTeams.filter((team) => team.played > 0).sort((a, b) => a.goals_against - b.goals_against || a.name.localeCompare(b.name, 'es')).slice(0, 5);
  const activeMatchIds = new Set(normalizedMatches.filter((match) => match.status === 'LIVE' || match.status === 'FINISHED').map((match) => match.id));
  const scorersByPlayer = new Map<string, { id: string; name: string; total: number }>();
  for (const event of allEvents) {
    if (event.event_type !== 'GOAL' || !event.player_id || !activeMatchIds.has(event.match_id)) continue;
    const player = scorersByPlayer.get(event.player_id) || { id: event.player_id, name: event.players?.name || 'Jugador', total: 0 };
    player.total += 1;
    scorersByPlayer.set(event.player_id, player);
  }
  const scorers = [...scorersByPlayer.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es')).slice(0, 5);
  const regularDeductions = calculateLoyolaFairPlayDeductions(regularMatches, cards, yellowDeduction, redDeduction);
  const regularById = new Map(teams.map((team) => [team.id, {
    ...team, fair_play_points: fairPlayEnabled ? startingPoints - (regularDeductions.get(team.id) || 0) : startingPoints,
    played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0,
  }]));
  for (const match of regularMatches) {
    if (match.status !== 'FINISHED') continue;
    const home = regularById.get(match.home_team_id);
    const away = match.away_team_id ? regularById.get(match.away_team_id) : null;
    if (!home || !away) continue;
    const score = getMatchScoreForStandings(match, rules);
    const points = getResultPoints(score.home, score.away, rules);
    home.played++; away.played++; home.points += points.home; away.points += points.away;
    if (score.countsForScoreColumns) {
      home.goals_for += score.home; home.goals_against += score.away;
      away.goals_for += score.away; away.goals_against += score.home;
    }
    if (score.home > score.away) { home.won++; away.lost++; }
    else if (score.away > score.home) { away.won++; home.lost++; }
    else { home.drawn++; away.drawn++; }
  }
  const regularStandings = [...regularById.values()].sort((a, b) => compareTeamsForStandings(a, b, rules, fairPlayEnabled, startingPoints) || a.name.localeCompare(b.name, 'es'));
  const hasGroupFixture = normalizedMatches.some((match) => match.round_number >= 101 && match.round_number <= 106);
  const groupStandings = hasGroupFixture ? calculateLoyolaGroupStandings(teams, normalizedMatches, cards, sportName, {
    fairPlayEnabled, startingPoints, yellowDeduction, redDeduction,
  }) : null;
  const assigned = teams.filter((team) => team.group_name === 'A' || team.group_name === 'B');
  const drawComplete = assigned.length === 8 && assigned.filter((team) => team.group_name === 'A').length === 4 && assigned.filter((team) => team.group_name === 'B').length === 4;
  const eliminated = drawComplete ? teams.filter((team) => team.group_name !== 'A' && team.group_name !== 'B') : [];
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const phases = [...new Set(normalizedMatches.map((match) => phaseOf(match.round_number)))].sort((a, b) => a - b);
  const activePhase = phases.includes(selectedPhase) ? selectedPhase : phases.at(-1) || 1;
  const phaseMatches = matches.filter((match) => phaseOf(Number(match.matchdays?.round_number || 0)) === activePhase);
  const rounds = [...new Set(phaseMatches.map((match) => Number(match.matchdays?.round_number || 0)))].sort((a, b) => a - b);

  const table = (title: string, rows: typeof regularStandings, description: string) => <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4"><h3 className="text-sm font-black uppercase text-slate-900">{title}</h3><p className="mt-1 text-[10px] font-bold text-slate-500">{description}</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[590px] text-center text-[10px]"><thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-500"><tr><th className="p-2">#</th><th className="p-2 text-left">Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th>{fairPlayEnabled && <th>FP</th>}<th>PTS</th></tr></thead><tbody>{rows.map((team, index) => <tr key={team.id} className={`border-t border-slate-100 ${team.id === selectedTeamId ? 'bg-blue-50' : ''}`}><td className="p-2 font-black">{index + 1}</td><td className="p-2 text-left font-bold uppercase">{team.name}</td><td>{team.played}</td><td>{team.won}</td><td>{team.drawn}</td><td>{team.lost}</td><td>{team.goals_for}</td><td>{team.goals_against}</td><td>{team.goals_for - team.goals_against}</td>{fairPlayEnabled && <td className="font-bold text-blue-700">{team.fair_play_points}</td>}<td className="font-black text-slate-950">{team.points}</td></tr>)}</tbody></table></div>
  </section>;

  if (teams.length === 0) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs font-bold text-amber-800">No se pudieron cargar los equipos de Loyola. Actualiza el portal para consultar la clasificación.</section>;

  return <section className="delegate-module space-y-5 rounded-[2rem] border border-blue-100 bg-blue-50/30 p-4 sm:p-6" aria-label="Seguimiento completo de Loyola Soccer Cup">
    <div><p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Loyola Soccer Cup</p><h2 className="mt-1 text-xl font-black uppercase">Seguimiento del torneo</h2><p className="mt-1 text-xs font-semibold text-slate-500">Clasificación, sorteo de grupos y programación completa de todas las fases.</p></div>
    {drawComplete && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Resultado de la fase regular</p><p className="mt-1 text-sm font-black text-slate-900">{eliminated.length ? `Eliminado: ${eliminated.map((team) => team.name).join(', ')}` : 'Ocho equipos clasificados'}</p>{selectedTeam && <p className="mt-1 text-xs font-semibold text-slate-600">{selectedTeam.group_name ? `Tu equipo avanzó al Grupo ${selectedTeam.group_name}.` : 'Tu equipo terminó su participación en la fase regular.'}</p>}</div>}
    {drawEvents.length > 0 && <details className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4"><summary className="cursor-pointer text-xs font-black uppercase text-indigo-800">Acta del sorteo manual · {drawEvents.length} movimientos</summary><ol className="mt-3 space-y-2">{drawEvents.map((event) => <li key={event.id} className="rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-slate-700"><time className="mr-2 font-bold text-slate-400">{new Date(event.created_at).toLocaleString('es-CO')}</time>{event.action === 'admin.loyola.draw_prepared' ? 'Bombo preparado con los ocho clasificados' : `${event.metadata?.teamName || 'Equipo'} ${event.metadata?.groupName ? `→ Grupo ${event.metadata.groupName}` : '→ Bombo'}`}</li>)}</ol></details>}
    {table('Posiciones · Fase 1', regularStandings, 'Fase regular · incluye a todos los equipos; aquí se definieron los ocho clasificados.')}
    {groupStandings && <><div className="flex items-center gap-2"><Trophy size={18} className="text-blue-600" /><h3 className="text-sm font-black uppercase">Fase 2 · Grupos A y B</h3></div><p className="text-xs font-semibold text-slate-500">Cada grupo inició con estadísticas en cero y Fair Play completo. Solo cuentan sus propios partidos y tarjetas.</p><div className="grid gap-4 xl:grid-cols-2">{table('Grupo A', groupStandings.A, 'Clasificación independiente de la Fase 2.')}{table('Grupo B', groupStandings.B, 'Clasificación independiente de la Fase 2.')}</div></>}
    <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-2xl border border-emerald-200 bg-white p-4"><h3 className="text-sm font-black uppercase text-emerald-800">Goleadores · acumulado</h3><p className="mt-1 text-[10px] font-semibold text-slate-500">Goles de todas las fases, incluidos los partidos en vivo.</p><ol className="mt-3 space-y-2">{scorers.map((player, index) => <li key={player.id} className="flex justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs"><span className="font-bold">{index + 1}. {player.name}</span><strong className="text-emerald-700">{player.total}</strong></li>)}</ol>{scorers.length === 0 && <p className="mt-3 text-xs text-slate-400">Sin goles registrados.</p>}</section><section className="rounded-2xl border border-cyan-200 bg-white p-4"><h3 className="text-sm font-black uppercase text-cyan-800">Valla menos vencida · acumulado</h3><p className="mt-1 text-[10px] font-semibold text-slate-500">Goles recibidos en todos los partidos finalizados.</p><ol className="mt-3 space-y-2">{leastConceded.map((team, index) => <li key={team.id} className="flex justify-between gap-3 rounded-lg bg-cyan-50 px-3 py-2 text-xs"><span className="font-bold">{index + 1}. {team.name}</span><strong className="text-cyan-700">{team.goals_against} GC</strong></li>)}</ol>{leastConceded.length === 0 && <p className="mt-3 text-xs text-slate-400">Sin partidos finalizados.</p>}</section></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><CalendarDays size={18} className="text-blue-600" /><h3 className="text-sm font-black uppercase">Calendario y resultados</h3></div><div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Fases del calendario">{phases.map((phase) => <button key={phase} type="button" role="tab" aria-selected={activePhase === phase} onClick={() => setSelectedPhase(phase)} className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase ${activePhase === phase ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50'}`}>Fase {phase}</button>)}</div><div className="space-y-3">{rounds.map((round) => { const games = phaseMatches.filter((match) => Number(match.matchdays?.round_number || 0) === round).sort((a, b) => String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || ''))); return <details key={round} className="rounded-xl border border-slate-200 bg-slate-50" open={round === rounds[0]}><summary className="cursor-pointer list-none p-3 text-xs font-black uppercase text-slate-800">{roundLabel(round)} · {dateLabel(games[0]?.matchdays?.scheduled_date)} <span className="ml-2 text-blue-600">{games.length} partidos</span></summary><div className="grid gap-2 border-t border-slate-200 p-3 md:grid-cols-2">{games.map((match) => <div key={match.id} className="rounded-xl bg-white p-3 text-xs"><p className="font-black uppercase text-slate-900">{match.status === 'BYE' ? `${match.home_team?.name || match.away_team?.name || 'Equipo'} descansa` : <>{match.home_team?.name || 'Por definir'} <span className="text-slate-400">vs.</span> {match.away_team?.name || 'Por definir'}</>}</p><p className="mt-1 font-semibold text-slate-500">{dateLabel(match.matchdays?.scheduled_date)}{match.status !== 'BYE' && ` · ${match.scheduled_time?.slice(0, 5) || 'Hora pendiente'} · ${match.venue || 'Cancha pendiente'}`}</p><p className={`mt-2 font-black uppercase ${match.status === 'FINISHED' ? 'text-emerald-700' : match.status === 'LIVE' ? 'text-red-600' : 'text-blue-600'}`}>{match.status === 'FINISHED' ? `${match.home_score ?? 0} - ${match.away_score ?? 0} · Finalizado` : match.status === 'LIVE' ? `${match.home_score ?? 0} - ${match.away_score ?? 0} · En vivo` : match.status === 'BYE' ? 'Descansa' : 'Programado'}</p></div>)}</div></details>; })}</div></div>
    {!phases.includes(3) && <p className="flex items-center gap-2 text-[10px] font-semibold text-slate-500"><ShieldCheck size={14} /> Las semifinales aparecerán cuando se cierre la fase de grupos y se conozcan los clasificados.</p>}
  </section>;
}
