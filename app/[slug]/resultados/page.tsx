'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase'; 
import { useParams, useSearchParams } from 'next/navigation';
import { Trophy, CalendarDays, Activity, Medal, ShieldCheck, School, ArrowLeft, BarChart3, Star, Shield, X, Flame, Square, RefreshCcw, Hash } from 'lucide-react';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall, FaTableTennis, FaGolfBall } from 'react-icons/fa';
import { GiTennisRacket } from 'react-icons/gi';

import { renderPosiciones, renderEstadisticas } from './components/SportRouter';
import {
  compareTeamsForStandings,
  getMatchScoreForStandings,
  getResultPoints,
  getSportKind,
  getSportRules,
  isBaseballSport,
  isBasketballSport,
  isSetBasedSport,
} from '../../lib/sports/rules';

const marqueeStyles = `
  @keyframes marquee {
    0% { transform: translateX(0%); }
    100% { transform: translateX(-100%); }
  }
  .animate-marquee {
    display: inline-flex;
    white-space: nowrap;
    animation: marquee 40s linear infinite;
  }
  .marquee-container:hover .animate-marquee {
    animation-play-state: paused;
  }
`;

function matchFilterLabel(filter: 'ALL' | 'LIVE' | 'SCHEDULED' | 'FINISHED') {
  if (filter === 'LIVE') return 'en vivo';
  if (filter === 'SCHEDULED') return 'programados';
  if (filter === 'FINISHED') return 'finalizados';
  return 'registrados';
}

export default function ResultadosPublicos() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const requestedTournamentId = searchParams.get('tournament');

  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState<any>(null);
  
  const [view, setView] = useState<'WELCOME' | 'TOURNAMENT'>('WELCOME');
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [activeTournament, setActiveTournament] = useState<any>(null);
  
  const [allLogos, setAllLogos] = useState<string[]>([]); 

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [matches, setMatches] = useState<any[]>([]);
  const [liveMatches, setLiveMatches] = useState<any[]>([]); 
  const [teams, setTeams] = useState<any[]>([]);
  const [scorers, setScorers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'FIXTURE' | 'POSICIONES' | 'ESTADISTICAS'>('FIXTURE');

  const [matchFilter, setMatchFilter] = useState<'ALL' | 'LIVE' | 'SCHEDULED' | 'FINISHED'>('ALL');

  const [selectedMatchDetails, setSelectedMatchDetails] = useState<any | null>(null);
  const [matchEvents, setMatchEvents] = useState<any[]>([]);
  const isRefreshingResults = useRef(false);
  const [lastResultsRefresh, setLastResultsRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (slug) loadInitialData();
  }, [slug]);

  async function loadInitialData() {
    setLoading(true);
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, name, slug, logo_url, is_active')
      .eq('slug', slug)
      .single();
    
    if (clientData) {
      setClientInfo(clientData);

      const { data: trns } = await supabase
        .from('tournaments')
        .select('*, fair_play_enabled, fp_starting_points, fp_yellow_deduction, fp_red_deduction')
        .eq('client_id', clientData.id)
        .order('is_active', { ascending: false }) 
        .order('created_at', { ascending: false });

      if (trns) {
        setTournaments(trns);
        const requestedTournament = requestedTournamentId
          ? trns.find((tournament: any) => tournament.id === requestedTournamentId)
          : null;
        if (requestedTournament) {
          await selectTournament(requestedTournament);
        }
      }
    }
    setLoading(false);
  }

  const selectTournament = async (torneo: any) => {
    setActiveTournament(torneo);
    setView('TOURNAMENT');
    setLoading(true);

    const { data: tournamentTeams } = await supabase
      .from('teams')
      .select('schools(logo_url), categories!inner(tournament_id)')
      .eq('categories.tournament_id', torneo.id);

    const tournamentLogos = Array.from(
      new Set((tournamentTeams || []).map((team: any) => team.schools?.logo_url).filter(Boolean))
    );
    setAllLogos(tournamentLogos as string[]);

    const { data: catsData } = await supabase
      .from('categories')
      .select('*, sports(name, scoring_system)')
      .eq('tournament_id', torneo.id)
      .order('name');

    if (catsData && catsData.length > 0) {
      setCategories(catsData);
      setSelectedCategory(catsData[0].id); 
      setMatchFilter('ALL'); 
    } else {
      setCategories([]);
      setSelectedCategory(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedCategory) {
      fetchCategoryData(selectedCategory);
      setMatchFilter('ALL'); 
    }
  }, [selectedCategory]);

  async function fetchCategoryData(categoryId: string) {
    if (isRefreshingResults.current) return;
    isRefreshingResults.current = true;

    try {
    const activeCat = categories.find(c => c.id === categoryId);
    const sportName = activeCat?.sports?.name || '';
    const sportRules = getSportRules(sportName);
    const isFairPlayActive = activeTournament?.fair_play_enabled;
    const fpStartingPoints = activeTournament?.fp_starting_points || 0;
    const yellowDeduction = activeTournament?.fp_yellow_deduction || 100;
    const redDeduction = activeTournament?.fp_red_deduction || 300;
    const isFinishedMatch = (match: any) => match.status === 'FINISHED';
    const isPublicStatMatch = (match: any) => match.status === 'LIVE' || match.status === 'FINISHED';

    // 1. Obtener Partidos
    const { data: matchesData } = await supabase
      .from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time, current_period, venue,
        home_team:teams!home_team_id(id, name, schools(logo_url)),
        away_team:teams!away_team_id(id, name, schools(logo_url)),
        matchdays!inner(round_number, scheduled_date)
      `)
      .eq('matchdays.category_id', categoryId);

    if (matchesData) {
      const statusPriority: Record<string, number> = { 'LIVE': 1, 'SCHEDULED': 2, 'FINISHED': 3 };
      
      const sortedMatches = matchesData.sort((a: any, b: any) => {
        if (statusPriority[a.status] !== statusPriority[b.status]) {
          return statusPriority[a.status] - statusPriority[b.status];
        }
        if (a.matchdays.round_number !== b.matchdays.round_number) {
          return a.matchdays.round_number - b.matchdays.round_number;
        }
        const timeA = new Date(`${a.matchdays.scheduled_date}T${a.scheduled_time || '00:00:00'}`).getTime();
        const timeB = new Date(`${b.matchdays.scheduled_date}T${b.scheduled_time || '00:00:00'}`).getTime();
        return timeA - timeB;
      });
      
      setMatches(sortedMatches);
      setLiveMatches(sortedMatches.filter(m => m.status === 'LIVE'));
    }

    // 2. Obtener Equipos y RECALCULAR POSICIONES
    const { data: teamsData } = await supabase
      .from('teams')
      .select('*, schools(logo_url)')
      .eq('category_id', categoryId);

    if (teamsData && matchesData) {
      const cardDeductionsByTeam: Record<string, number> = {};
      teamsData.forEach((team: any) => {
        cardDeductionsByTeam[team.id] = 0;
      });

      if (isFairPlayActive) {
        const { data: cardEvents } = await supabase
          .from('match_events')
          .select('team_id, event_type, matches!inner(status, matchdays!inner(category_id, scheduled_date))')
          .eq('matches.matchdays.category_id', categoryId)
          .in('event_type', ['YELLOW', 'RED']);

        (cardEvents || []).forEach((event: any) => {
          const eventMatch = event.matches;
          const countsForPublicStats = isPublicStatMatch(eventMatch);
          if (!countsForPublicStats) return;
          if (!event.team_id || typeof cardDeductionsByTeam[event.team_id] !== 'number') return;
          const deduction = event.event_type === 'RED' ? redDeduction : yellowDeduction;
          cardDeductionsByTeam[event.team_id] += deduction;
        });
      }

      // a. Diccionario para iniciar todo en 0
      const teamStats: Record<string, any> = {};
      teamsData.forEach((t: any) => {
        const storedFairPlay = t.fair_play_points ?? fpStartingPoints;
        const calculatedFairPlay = fpStartingPoints - (cardDeductionsByTeam[t.id] || 0);
        const visibleFairPlay = isFairPlayActive ? Math.min(storedFairPlay, calculatedFairPlay) : storedFairPlay;
        teamStats[t.id] = { ...t, fair_play_points: visibleFairPlay, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0 };
      });

      // b. Solo procesar partidos FINALIZADOS
      const finishedMatches = matchesData.filter(isFinishedMatch);
      
      finishedMatches.forEach((m: any) => {
        const homeId = m.home_team?.id;
        const awayId = m.away_team?.id;
        
        if (homeId && awayId && teamStats[homeId] && teamStats[awayId]) {
          teamStats[homeId].played += 1;
          teamStats[awayId].played += 1;

          const matchScore = getMatchScoreForStandings(m, sportRules);
          const hScore = matchScore.home;
          const aScore = matchScore.away;

          if (matchScore.countsForScoreColumns) {
             teamStats[homeId].goals_for += hScore;
             teamStats[homeId].goals_against += aScore;
             teamStats[awayId].goals_for += aScore;
             teamStats[awayId].goals_against += hScore;
          }

          if (hScore > aScore) {
            teamStats[homeId].won += 1;
            teamStats[awayId].lost += 1;
            const points = getResultPoints(hScore, aScore, sportRules);
            teamStats[homeId].points += points.home;
            teamStats[awayId].points += points.away;
          } else if (aScore > hScore) {
            teamStats[awayId].won += 1;
            teamStats[homeId].lost += 1;
            const points = getResultPoints(hScore, aScore, sportRules);
            teamStats[awayId].points += points.away;
            teamStats[homeId].points += points.home;
          } else {
            teamStats[homeId].drawn += 1;
            teamStats[awayId].drawn += 1;
            const points = getResultPoints(hScore, aScore, sportRules);
            teamStats[homeId].points += points.home;
            teamStats[awayId].points += points.away;
          }
        }
      });

      const recalculatedTeams = Object.values(teamStats);

      // c. Ordenar los equipos con las estadísticas correctas
      const sortedTeams = recalculatedTeams.sort((a: any, b: any) =>
        compareTeamsForStandings(a, b, sportRules, isFairPlayActive, fpStartingPoints)
      );
      setTeams(sortedTeams);
    }

    // 3. Obtener Jugadores para Goleadores
    const { data: playersData } = await supabase
      .from('players')
      .select(`id, name, shirt_number, teams!inner(id, name, category_id, schools(logo_url))`)
      .eq('teams.category_id', categoryId);
    
    if (playersData) {
      const { data: scoringEvents } = await supabase
        .from('match_events')
        .select('player_id, event_type, matches!inner(status, matchdays!inner(category_id, scheduled_date))')
        .eq('matches.matchdays.category_id', categoryId)
        .in('event_type', ['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3']);

      const scoringByPlayer: Record<string, number> = {};
      (scoringEvents || []).forEach((event: any) => {
        const eventMatch = event.matches;
        const countsForPublicStats = isPublicStatMatch(eventMatch);
        if (!event.player_id || !countsForPublicStats) return;

        if (!scoringByPlayer[event.player_id]) scoringByPlayer[event.player_id] = 0;
        if (event.event_type === 'GOAL' || event.event_type === 'BASKET_1') scoringByPlayer[event.player_id] += 1;
        else if (event.event_type === 'BASKET_2') scoringByPlayer[event.player_id] += 2;
        else if (event.event_type === 'BASKET_3') scoringByPlayer[event.player_id] += 3;
      });

      const calculatedScorers = playersData.map((p: any) => {
        const total = scoringByPlayer[p.id] || 0;
        return { ...p, totalPoints: total };
      }).filter((p: any) => p.totalPoints > 0);

      setScorers(calculatedScorers.sort((a: any, b: any) => b.totalPoints - a.totalPoints)); 
    }
    } finally {
      isRefreshingResults.current = false;
      setLastResultsRefresh(new Date());
    }
  }

  useEffect(() => {
    if (view === 'TOURNAMENT' && selectedCategory) {
      fetchCategoryData(selectedCategory);
    }
  }, [activeTab]);

  useEffect(() => {
    const refreshVisibleResults = () => {
      if (document.visibilityState === 'visible' && view === 'TOURNAMENT' && selectedCategory) {
        fetchCategoryData(selectedCategory);
      }
    };

    window.addEventListener('focus', refreshVisibleResults);
    document.addEventListener('visibilitychange', refreshVisibleResults);

    return () => {
      window.removeEventListener('focus', refreshVisibleResults);
      document.removeEventListener('visibilitychange', refreshVisibleResults);
    };
  }, [view, selectedCategory]);

  useEffect(() => {
    if (view !== 'TOURNAMENT' || !selectedCategory) return;

    const refreshEveryMs = liveMatches.length > 0 ? 7000 : 30000;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchCategoryData(selectedCategory);
      }
    }, refreshEveryMs);

    return () => window.clearInterval(intervalId);
  }, [view, selectedCategory, liveMatches.length]);

  const handleOpenMatchDetails = async (match: any) => {
    if (match.status !== 'FINISHED') return; 
    
    setSelectedMatchDetails(match);
    const { data: events } = await supabase
      .from('match_events')
      .select('*, players(name, shirt_number)')
      .eq('match_id', match.id)
      .order('created_at', { ascending: true });
    
    setMatchEvents(events || []);
  };

  const getSportIcon = (sportName: string, size: number = 20) => {
    const sportKind = getSportKind(sportName);
    if (sportKind === 'soccer') return <FaFutbol className="text-emerald-500" size={size} />;
    if (sportKind === 'basketball') return <FaBasketballBall className="text-orange-500" size={size} />;
    if (sportKind === 'volleyball') return <FaVolleyballBall className="text-yellow-500" size={size} />;
    if (sportKind === 'baseball') return <FaBaseballBall className="text-red-500" size={size} />;
    if (sportKind === 'racket' && sportName?.toLowerCase().includes('mesa')) return <FaTableTennis className="text-emerald-400" size={size} />;
    if (sportKind === 'racket') return <GiTennisRacket className="text-lime-500" size={size} />;
    if (sportKind === 'golf') return <FaGolfBall className="text-slate-400" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  if (loading && view === 'WELCOME') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center animate-pulse">
          <Activity size={48} className="text-blue-600 mb-4" />
          <p className="text-slate-500 font-black tracking-widest uppercase text-xs">Cargando Portal de Resultados...</p>
        </div>
      </div>
    );
  }

  const activeCategoryData = categories.find(c => c.id === selectedCategory);
  const activeSportName = activeCategoryData?.sports?.name || '';
  const isVolleyball = isSetBasedSport(activeSportName);
  const isBasketball = isBasketballSport(activeSportName);
  const isBaseball = isBaseballSport(activeSportName);
  const isSoccer = !isBasketball && !isVolleyball && !isBaseball;

  const filteredMatches = matches.filter(match => {
    if (matchFilter === 'ALL') return true;
    return match.status === matchFilter;
  });

  const groupedMatches = filteredMatches.reduce((acc: any, match: any) => {
    const round = match.matchdays?.round_number || 0;
    const roundName = round === 100 || round >= 201 ? 'FASE 3 · FINALES' : round >= 101 ? `FASE 2 · JORNADA ${round - 100}` : `FASE 1 · JORNADA ${round}`;
    if (!acc[roundName]) acc[roundName] = [];
    acc[roundName].push(match);
    return acc;
  }, {});

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: marqueeStyles }} />
      
      {view === 'WELCOME' && (
        <main className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/bg-pattern.png')] opacity-10 bg-cover z-0 pointer-events-none"></div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none z-0"></div>

          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 relative z-10 w-full max-w-5xl mx-auto">
            <div className="text-center mb-10 md:mb-16 animate-in slide-in-from-bottom-8 duration-700 w-full">
              {clientInfo?.logo_url ? (
                <img src={clientInfo.logo_url} alt="Logo Cliente" className="h-24 md:h-36 mx-auto mb-6 md:mb-8 object-contain bg-white/5 p-4 rounded-[2rem] backdrop-blur-sm border border-white/5 shadow-2xl" />
              ) : (
                <Trophy size={60} className="text-blue-500 mx-auto mb-6 md:mb-6" />
              )}
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4 leading-none break-words">
                Portal de Resultados
              </h1>
              <p className="text-blue-400 font-bold uppercase tracking-[0.2em] md:tracking-[0.3em] text-[10px] md:text-sm flex items-center justify-center gap-2 flex-wrap">
                <ShieldCheck size={16} /> Competiciones Activas
              </p>
            </div>

            <div className="w-full flex flex-wrap justify-center gap-6 md:gap-8 z-10 animate-in slide-in-from-bottom-12 duration-1000 px-2">
              {tournaments.map(torneo => (
                <button 
                  key={torneo.id} 
                  onClick={() => selectTournament(torneo)}
                  className="w-full sm:w-[calc(50%-1rem)] lg:w-[calc(33%-1rem)] group flex flex-col items-center transition-all hover:scale-105 bg-white/5 md:bg-transparent p-6 md:p-0 rounded-[2rem] border border-white/10 md:border-transparent"
                >
                  <div className="w-20 h-20 md:w-32 md:h-32 bg-white rounded-3xl flex items-center justify-center p-3 md:p-4 shadow-xl shadow-blue-900/50 mb-4 transition-all border border-transparent group-hover:border-blue-400 shrink-0">
                    {torneo.logo_url ? <img src={torneo.logo_url} className="w-full h-full object-contain drop-shadow-md" /> : <Trophy className="text-slate-300" size={40}/>}
                  </div>
                  <h3 className="text-white font-black text-lg md:text-xl uppercase tracking-tighter leading-tight mb-2 group-hover:text-blue-300 transition-colors text-center w-full truncate">{torneo.name}</h3>
                  <span className={`px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest ${torneo.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}`}>
                    {torneo.is_active ? 'En Curso' : 'Finalizado'}
                  </span>
                </button>
              ))}
              {tournaments.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-white/20 rounded-[2rem] w-full max-w-lg mx-auto">
                   <p className="text-slate-400 font-bold uppercase tracking-widest text-xs md:text-sm">No hay eventos registrados</p>
                </div>
              )}
            </div>
          </div>

          {allLogos.length > 0 && (
            <div className="w-full overflow-hidden bg-slate-900/50 backdrop-blur-md py-6 md:py-8 relative z-20 marquee-container border-t border-white/5 mt-auto">
               <div className="absolute top-0 left-0 w-16 md:w-32 h-full bg-gradient-to-r from-slate-950 to-transparent z-10"></div>
               <div className="absolute top-0 right-0 w-16 md:w-32 h-full bg-gradient-to-l from-slate-950 to-transparent z-10"></div>
               
               <div className="whitespace-nowrap flex items-center animate-marquee">
                  {[...allLogos, ...allLogos, ...allLogos, ...allLogos].map((logo, idx) => (
                    <div key={idx} className="mx-4 md:mx-10 w-16 h-16 md:w-20 md:h-20 hover:scale-125 transition-transform cursor-pointer flex-shrink-0 flex items-center justify-center">
                      <img src={logo} className="max-w-full max-h-full object-contain drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]" alt="Escudo" />
                    </div>
                  ))}
               </div>
            </div>
          )}
        </main>
      )}

      {view === 'TOURNAMENT' && (
        <main className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-0 animate-in fade-in duration-500 flex flex-col relative overflow-x-hidden">
          
          {selectedMatchDetails && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
              <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[95vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative">
                
                <div className="bg-slate-900 text-white p-5 md:p-8 flex justify-between items-center shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('/bg-futbol.jpg')] opacity-20 bg-cover bg-center z-0"></div>
                    <div className="relative z-10">
                      <h2 className="text-xl md:text-3xl font-black uppercase tracking-tighter text-emerald-400">Resumen Oficial</h2>
                      <p className="text-slate-300 font-bold uppercase tracking-widest text-[9px] md:text-xs mt-1 flex items-center gap-2">
                        <Activity size={14}/> Estadísticas del Encuentro
                      </p>
                    </div>
                    <button onClick={() => setSelectedMatchDetails(null)} className="relative z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} className="md:w-6 md:h-6"/></button>
                </div>

                <div className="grid grid-cols-3 items-center gap-2 md:gap-6 py-6 md:py-8 px-2 md:px-8 border-b border-slate-100 bg-slate-50 shrink-0 relative">
                    
                    <div className="flex flex-col md:flex-row items-center justify-end gap-2 md:gap-4 z-10 text-center md:text-right overflow-hidden">
                      <div className="order-2 md:order-1 flex flex-col items-center md:items-end w-full">
                        <h3 className="text-xs md:text-xl font-black uppercase leading-tight truncate w-full text-slate-800">{selectedMatchDetails.home_team?.name}</h3>
                        {selectedMatchDetails.home_sets !== null && selectedMatchDetails.home_sets > selectedMatchDetails.away_sets && isSoccer ? (
                            <span className="text-[8px] md:text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest mt-1 shadow-sm inline-block">🏆 Gana (Pen)</span>
                        ) : selectedMatchDetails.home_score > selectedMatchDetails.away_score && selectedMatchDetails.home_sets === null ? (
                            <span className="text-[8px] md:text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest mt-1 shadow-sm inline-block">🏆 Ganador</span>
                        ) : null}
                      </div>
                      <div className="order-1 md:order-2 w-10 h-10 md:w-16 md:h-16 bg-white rounded-xl md:rounded-2xl p-1.5 md:p-2 border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                        {selectedMatchDetails.home_team?.schools?.logo_url ? <img src={selectedMatchDetails.home_team.schools.logo_url} className="max-w-full max-h-full object-contain" /> : <School className="text-slate-300 w-full h-full" />}
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center z-10">
                      <div className="bg-slate-900 text-white px-4 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl flex gap-3 md:gap-5 text-2xl md:text-4xl font-black tabular-nums shadow-lg border-2 md:border-4 border-slate-800">
                        <span>{isVolleyball ? selectedMatchDetails.home_sets : selectedMatchDetails.home_score}</span>
                        <span className="text-emerald-500 opacity-50">-</span>
                        <span>{isVolleyball ? selectedMatchDetails.away_sets : selectedMatchDetails.away_score}</span>
                      </div>
                      {isSoccer && selectedMatchDetails.home_sets !== null && (
                        <div className="mt-2 md:mt-3 text-[9px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest md:tracking-[0.2em] bg-slate-200 px-3 py-1 md:px-4 md:py-1 rounded-full border border-slate-300 shadow-sm whitespace-nowrap">
                            PEN: {selectedMatchDetails.home_sets} - {selectedMatchDetails.away_sets}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-start gap-2 md:gap-4 z-10 text-center md:text-left overflow-hidden">
                      <div className="w-10 h-10 md:w-16 md:h-16 bg-white rounded-xl md:rounded-2xl p-1.5 md:p-2 border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                        {selectedMatchDetails.away_team?.schools?.logo_url ? <img src={selectedMatchDetails.away_team.schools.logo_url} className="max-w-full max-h-full object-contain" /> : <School className="text-slate-300 w-full h-full" />}
                      </div>
                      <div className="flex flex-col items-center md:items-start w-full">
                        <h3 className="text-xs md:text-xl font-black uppercase leading-tight truncate w-full text-slate-800">{selectedMatchDetails.away_team?.name}</h3>
                        {selectedMatchDetails.away_sets !== null && selectedMatchDetails.away_sets > selectedMatchDetails.home_sets && isSoccer ? (
                            <span className="text-[8px] md:text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest mt-1 shadow-sm inline-block">🏆 Gana (Pen)</span>
                        ) : selectedMatchDetails.away_score > selectedMatchDetails.home_score && selectedMatchDetails.away_sets === null ? (
                            <span className="text-[8px] md:text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest mt-1 shadow-sm inline-block">🏆 Ganador</span>
                        ) : null}
                      </div>
                    </div>

                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-10 scrollbar-hide bg-white relative max-h-[50vh] md:max-h-[55vh]">
            <h4 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest md:tracking-[0.3em] mb-8 md:mb-10 flex items-center gap-2 md:gap-3 justify-center"><CalendarDays size={16}/> Secuencia de Eventos</h4>
            
            {matchEvents.length === 0 ? (
                <div className="text-center py-10 md:py-20 text-slate-400 font-bold italic text-xs md:text-sm px-4">El encuentro finalizó sin registros detallados de eventos.</div>
            ) : (
                <div className="space-y-6 md:space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-1 before:bg-slate-100 z-10 max-w-4xl mx-auto pb-4 md:pb-8">
                  {matchEvents.map((event, idx) => {
                      const isHome = event.team_id === selectedMatchDetails.home_team.id;
                      
                      const previousEvent = idx > 0 ? matchEvents[idx - 1] : null;
                      const showPeriodDivider = !previousEvent || previousEvent.period !== event.period;

                      let periodName = event.period;
                      if (event.period === 'T1') periodName = 'PRIMER TIEMPO';
                      if (event.period === 'T2') periodName = 'SEGUNDO TIEMPO';
                      if (event.period === 'T3') periodName = 'TERCER TIEMPO';
                      if (event.period === 'T4') periodName = 'CUARTO TIEMPO';
                      if (event.period === 'PEN') periodName = 'TANDA DE PENALES';
                      
                      return (
                        <React.Fragment key={idx}>
                            
                            {showPeriodDivider && (
                              <div className="relative z-20 flex justify-center py-4 md:py-6 ml-5 md:ml-0">
                                <span className="bg-slate-800 text-white text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] px-4 md:px-6 py-1.5 md:py-2 rounded-full shadow-md border-2 border-slate-700">
                                  {periodName}
                                </span>
                              </div>
                            )}

                            <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active z-10 mt-2`}>
                                
                                <div className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full border-2 md:border-4 border-white bg-slate-100 shadow-md shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 absolute left-0 md:left-1/2 md:transform md:-translate-x-1/2">
                                  {event.event_type === 'GOAL' && <FaFutbol className="text-emerald-500 w-4 h-4 md:w-5 md:h-5" />}
                                  {event.event_type === 'YELLOW' && <Square className="text-yellow-400 fill-yellow-400 w-3 h-3 md:w-4 md:h-4" />}
                                  {event.event_type === 'RED' && <Square className="text-red-600 fill-red-600 w-3 h-3 md:w-4 md:h-4" />}
                                  {(event.event_type === 'SUB_IN' || event.event_type === 'SUB_OUT') && <RefreshCcw className="text-blue-500 w-3 h-3 md:w-4 md:h-4" />}
                                </div>
                                
                                <div className={`w-[calc(100%-3.5rem)] md:w-[calc(50%-3rem)] p-4 md:p-5 rounded-2xl md:rounded-[1.5rem] border shadow-sm ml-auto md:ml-0 transition-all z-0
                                  ${event.event_type === 'GOAL' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100'}
                                `}>
                                  <div className={`flex flex-col ${isHome ? 'md:items-end' : 'md:items-start'}`}>
                                      <div className="flex items-center gap-2 mb-1 md:mb-1.5">
                                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 bg-white border border-slate-200 px-2 py-0.5 md:px-2 md:py-1 rounded-md md:rounded-lg uppercase tracking-widest">{event.period} • Min {event.minute_record}'</span>
                                      </div>
                                      <p className={`font-black text-sm md:text-base uppercase text-slate-800 ${isHome ? 'md:text-right' : 'md:text-left'} leading-tight`}>
                                        {event.event_type === 'GOAL' && <span className="text-emerald-600">GOL</span>}
                                        {event.event_type === 'YELLOW' && <span className="text-yellow-600">TAREJETA AMARILLA</span>}
                                        {event.event_type === 'RED' && <span className="text-red-600">TARJETA ROJA</span>}
                                        {event.event_type === 'SUB_IN' && <span className="text-blue-600">ENTRA JUGADOR</span>}
                                        {event.event_type === 'SUB_OUT' && <span className="text-slate-600">SALE JUGADOR</span>}
                                      </p>
                                      <p className={`text-slate-500 font-bold uppercase mt-1 text-[9px] md:text-[10px] ${isHome ? 'md:text-right' : 'md:text-left'}`}>
                                        {event.players ? `${event.players.shirt_number || '-'} • ${event.players.name}` : '(ACCIÓN DE EQUIPO)'}
                                      </p>
                                  </div>
                                </div>
                            </div>
                        </React.Fragment>
                      )
                  })}
                </div>
            )}
          </div>
                
                <div className="p-4 md:p-5 bg-slate-50 border-t border-slate-200 shrink-0 text-center">
                  <button onClick={() => setSelectedMatchDetails(null)} className="w-full md:w-auto px-8 py-3 bg-slate-900 text-white rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-800 transition-all shadow-md">
                      Cerrar Ventana
                  </button>
                </div>
              </div>
            </div>
          )}

          <header className="bg-slate-950 text-white pt-6 md:pt-8 pb-10 md:pb-12 px-4 md:px-6 relative overflow-hidden shrink-0 z-10">
            <div className="absolute top-0 left-0 w-full h-full bg-[url('/bg-pattern.png')] opacity-10 bg-cover"></div>
            <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-slate-50 to-transparent z-10"></div>
            
            <div className="max-w-6xl mx-auto relative z-20">
              <button onClick={() => { setView('WELCOME'); setActiveTournament(null); setAllLogos([]); }} className="mb-4 md:mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[10px] md:text-xs font-black uppercase tracking-widest bg-white/10 px-3 md:px-4 py-2 rounded-lg md:rounded-xl backdrop-blur-sm w-fit shadow-sm">
                <ArrowLeft size={16} /> Volver al Inicio
              </button>
              
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
                <div className="flex items-center gap-4 md:gap-5 w-full md:w-auto">
                  {activeTournament.logo_url ? (
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-white rounded-2xl p-2 shadow-xl shrink-0"><img src={activeTournament.logo_url} className="w-full h-full object-contain" /></div>
                  ) : (
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shrink-0"><Trophy size={32} className="text-white md:w-10 md:h-10" /></div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <h1 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase tracking-tighter mb-1 md:mb-2 drop-shadow-lg leading-none truncate">{activeTournament.name}</h1>
                    <p className="text-blue-400 font-bold uppercase tracking-widest md:tracking-[0.2em] text-[9px] md:text-xs flex items-center gap-1.5 md:gap-2">
                      <ShieldCheck size={14} /> Resultados Oficiales
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-6xl mx-auto px-2 sm:px-4 relative z-30 flex-1 flex flex-col w-full -mt-6">
            
            {liveMatches.length > 0 && (
              <div className="mb-6 animate-in slide-in-from-top-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {liveMatches.map(match => {
                     let homeScoreDisplay = match.home_score;
                     let awayScoreDisplay = match.away_score;
                     let periodDisplay = match.current_period;
                     let subtitle = '';

                     if (isVolleyball) {
                        subtitle = "Sets Globales";
                     } else if (match.current_period === 'PEN') {
                        homeScoreDisplay = match.home_sets || 0;
                        awayScoreDisplay = match.away_sets || 0;
                        subtitle = "Tiros Penales";
                        periodDisplay = "PENALES";
                     }

                     return (
                       <div key={match.id} className="bg-slate-900 rounded-[2rem] p-4 md:p-6 relative overflow-hidden flex items-center justify-between border border-slate-800 shadow-xl shadow-red-900/10">
                         <div className="absolute inset-0 bg-gradient-to-r from-slate-900/50 to-red-900/20 z-0"></div>
                         
                         <div className="flex flex-col items-center z-10 w-1/3">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-xl md:rounded-2xl flex items-center justify-center p-2 mb-2 backdrop-blur-sm border border-white/10 shadow-inner">
                              {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain drop-shadow-md" /> : <School className="text-white/50"/>}
                            </div>
                            <span className="text-white font-black text-[10px] md:text-xs uppercase text-center truncate w-full px-2">{match.home_team?.name}</span>
                         </div>

                         <div className="flex flex-col items-center justify-center z-10 w-1/3 shrink-0">
                            <div className="bg-black/60 px-4 md:px-8 py-2 rounded-xl md:rounded-2xl border border-white/10 flex items-center gap-3 shadow-inner">
                               <span className="text-3xl md:text-5xl font-black tabular-nums text-white drop-shadow-md">{homeScoreDisplay}</span>
                               <span className="text-slate-600 font-black">-</span>
                               <span className="text-3xl md:text-5xl font-black tabular-nums text-white drop-shadow-md">{awayScoreDisplay}</span>
                            </div>
                            <div className="mt-3 md:mt-4 text-center flex flex-col items-center">
                               <span className="text-[9px] md:text-[10px] font-black text-red-100 uppercase tracking-widest bg-red-600 px-3 py-1 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse flex items-center gap-1.5">
                                  <Flame size={12}/> {periodDisplay}
                               </span>
                               {subtitle && <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-2">{subtitle}</p>}
                            </div>
                         </div>

                         <div className="flex flex-col items-center z-10 w-1/3">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-xl md:rounded-2xl flex items-center justify-center p-2 mb-2 backdrop-blur-sm border border-white/10 shadow-inner">
                              {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain drop-shadow-md" /> : <School className="text-white/50"/>}
                            </div>
                            <span className="text-white font-black text-[10px] md:text-xs uppercase text-center truncate w-full px-2">{match.away_team?.name}</span>
                         </div>
                       </div>
                     )
                  })}
                </div>
              </div>
            )}

            <div className="flex overflow-x-auto scrollbar-hide gap-1 px-2 sm:px-4 items-end drop-shadow-sm mt-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 rounded-t-[1.5rem] transition-all relative border-x border-t
                    ${selectedCategory === cat.id 
                      ? 'bg-white text-slate-900 z-10 border-slate-200 border-b-transparent shadow-[0_-5px_15px_rgba(0,0,0,0.05)] pt-4 md:pt-5 -mb-[1px]' 
                      : 'bg-slate-200/60 text-slate-500 border-transparent hover:bg-slate-100 z-0'}
                  `}
                >
                  <div className={`${selectedCategory === cat.id ? 'text-blue-500' : 'text-slate-400'}`}>
                     {getSportIcon(cat.sports?.name, 16)}
                  </div>
                  <div className="text-left leading-tight">
                     <span className="block font-black uppercase text-[10px] md:text-[11px] tracking-widest">{cat.sports?.name}</span>
                     <span className={`block font-bold uppercase text-[8px] md:text-[9px] tracking-widest ${selectedCategory === cat.id ? 'text-blue-500' : 'text-slate-400'}`}>{cat.name}</span>
                  </div>
                </button>
              ))}
              {categories.length === 0 && <p className="p-4 text-xs font-bold text-slate-400 bg-white rounded-t-[1.5rem] border-x border-t border-slate-200">No hay categorías.</p>}
            </div>

            <div className="bg-white rounded-b-[2rem] md:rounded-b-[2.5rem] rounded-tr-[2rem] md:rounded-tr-[2.5rem] shadow-2xl border border-slate-200 flex-1 flex flex-col overflow-hidden z-20 relative mb-8 md:mb-12">
              
              {selectedCategory && (
                <div className="flex flex-col items-center pt-6 md:pt-8 pb-4 md:pb-6 border-b border-slate-100 px-2 sm:px-4 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                  <div className="bg-slate-100 p-1 md:p-1.5 rounded-xl md:rounded-2xl flex overflow-x-auto scrollbar-hide gap-1 shadow-inner w-full max-w-full justify-start md:justify-center">
                    <button onClick={() => setActiveTab('FIXTURE')} className={`flex-shrink-0 px-4 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] lg:text-xs transition-all flex items-center gap-1.5 md:gap-2 ${activeTab === 'FIXTURE' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>
                      <CalendarDays size={14} className="md:w-4 md:h-4" /> Partidos
                    </button>
                    <button onClick={() => setActiveTab('POSICIONES')} className={`flex-shrink-0 px-4 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] lg:text-xs transition-all flex items-center gap-1.5 md:gap-2 ${activeTab === 'POSICIONES' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>
                      <Medal size={14} className="md:w-4 md:h-4" /> Tabla General
                    </button>
                    {!isVolleyball && (
                      <button onClick={() => setActiveTab('ESTADISTICAS')} className={`flex-shrink-0 px-4 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] lg:text-xs transition-all flex items-center gap-1.5 md:gap-2 ${activeTab === 'ESTADISTICAS' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>
                        <BarChart3 size={14} className="md:w-4 md:h-4" /> Estadísticas
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {liveMatches.length > 0 && (
                      <span className="flex items-center gap-1.5 text-red-500 bg-red-50 border border-red-100 px-3 py-1.5 rounded-full">
                        <Activity size={12} className="animate-pulse" /> En directo
                      </span>
                    )}
                    {lastResultsRefresh && (
                      <span className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
                        Actualizado {lastResultsRefresh.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                    <button
                      onClick={() => fetchCategoryData(selectedCategory)}
                      className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 px-3 py-1.5 rounded-full transition-colors"
                    >
                      <RefreshCcw size={12} /> Actualizar
                    </button>
                  </div>

                  {activeTab === 'FIXTURE' && (
                    <div className="flex overflow-x-auto scrollbar-hide gap-2 mt-4 pt-2 w-full justify-start md:justify-center px-2">
                      <button onClick={() => setMatchFilter('ALL')} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border ${matchFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>Todos</button>
                      <button onClick={() => setMatchFilter('LIVE')} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-1.5 ${matchFilter === 'LIVE' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                        En Vivo {liveMatches.length > 0 && `(${liveMatches.length})`}
                      </button>
                      <button onClick={() => setMatchFilter('SCHEDULED')} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border ${matchFilter === 'SCHEDULED' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>Próximos</button>
                      <button onClick={() => setMatchFilter('FINISHED')} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border ${matchFilter === 'FINISHED' ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>Finalizados</button>
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 sm:p-6 md:p-10 bg-slate-50/50 flex-1 overflow-x-hidden">
                
                {activeTab === 'FIXTURE' && selectedCategory && (
                  <div className="max-w-6xl mx-auto w-full">
                    {filteredMatches.length === 0 ? (
                      <div className="text-center py-16 md:py-20 bg-white rounded-[2rem] border border-slate-200 shadow-sm">
                        <Trophy size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs md:text-sm px-4">
                          {matchFilter === 'ALL' ? 'Aún no hay partidos programados' : `No hay partidos ${matchFilterLabel(matchFilter)}`}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-12">
                        {Object.keys(groupedMatches).map((roundName) => (
                          <div key={roundName} className="space-y-4">
                            
                            <div className="flex items-center gap-4 mb-6">
                               <h3 className="text-sm md:text-base font-black text-slate-800 uppercase tracking-widest bg-white px-6 py-2 rounded-xl border border-slate-200 shadow-sm inline-block">
                                 {roundName}
                               </h3>
                               <div className="h-px bg-slate-200 flex-1"></div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                              {groupedMatches[roundName].map((match: any) => {
                                 
                                 // 🚨 PASO 2 INTEGRADO AQUÍ: LÓGICA DE DESCANSO 🚨
                                 const isDescanso = match.venue === 'Descansa' || !match.away_team || !match.home_team;
                                 const restingTeam = match.home_team || match.away_team; 

                                 if (isDescanso && restingTeam) {
                                   return (
                                     <div key={match.id} className="bg-slate-50/40 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 border-2 border-dashed border-slate-200 shadow-sm transition-all flex flex-col items-center justify-center gap-3 relative overflow-hidden h-full min-h-[140px]">
                                       <div className="w-14 h-14 md:w-16 md:h-16 bg-white rounded-[1rem] md:rounded-2xl p-2 border border-slate-100 shadow-sm flex items-center justify-center opacity-90">
                                         {restingTeam?.schools?.logo_url ? <img src={restingTeam.schools.logo_url} className="max-w-full max-h-full object-contain grayscale-[20%]" /> : <School className="w-full h-full text-slate-300 p-2"/>}
                                       </div>
                                       <div className="flex flex-col items-center text-center">
                                         <span className="font-black text-sm md:text-base uppercase leading-tight text-slate-600">{restingTeam?.name}</span>
                                         <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5 bg-slate-200/50 px-3 py-1 rounded-full">Jornada de Descanso</span>
                                       </div>
                                     </div>
                                   );
                                 }

                                 const isSoccerPenalty = isSoccer && match.status === 'FINISHED' && match.home_sets !== null && match.away_sets !== null;
                                 
                                 return (
                                  <div 
                                    key={match.id} 
                                    onClick={() => handleOpenMatchDetails(match)}
                                    className={`bg-white rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 border shadow-sm transition-all flex flex-col gap-4 relative overflow-hidden
                                      ${match.status === 'LIVE' ? 'border-red-200 shadow-red-100 ring-1 ring-red-100' : 'border-slate-200 hover:border-blue-300 hover:shadow-lg'}
                                      ${match.status === 'FINISHED' ? 'cursor-pointer group hover:-translate-y-1' : ''}
                                    `}
                                  >
                                    {match.status === 'LIVE' && <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>}

                                    <div className="flex flex-col flex-1 justify-center relative">
                                      
                                      <div className="flex items-center justify-between z-10 bg-white">
                                        <div className="flex items-center gap-3 md:gap-4 w-[75%]">
                                          <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-50 rounded-[1rem] md:rounded-2xl p-2 border border-slate-100 shadow-sm shrink-0 group-hover:border-blue-200 transition-colors flex items-center justify-center">
                                            {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="max-w-full max-h-full object-contain" /> : <School className="w-full h-full text-slate-300 p-2"/>}
                                          </div>
                                          <div className="flex flex-col overflow-hidden">
                                            <span className="font-black text-xs md:text-sm uppercase leading-tight truncate w-full text-slate-800">{match.home_team?.name}</span>
                                            <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Local</span>
                                          </div>
                                        </div>
                                        {(match.status === 'LIVE' || match.status === 'FINISHED') && (
                                          <span className={`text-2xl md:text-3xl font-black tabular-nums shrink-0 ${match.status === 'FINISHED' && (isVolleyball ? match.home_sets < match.away_sets : match.home_score < match.away_score) ? 'text-slate-300' : 'text-slate-900'}`}>
                                            {isVolleyball ? match.home_sets : match.home_score}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex justify-center items-center py-3 relative">
                                        <div className="absolute w-full h-[1px] bg-slate-100 left-0 top-1/2 -translate-y-1/2 z-0"></div>
                                        {match.status === 'SCHEDULED' ? (
                                          <div className="bg-slate-50 px-3 py-1.5 md:px-4 md:py-1.5 rounded-lg md:rounded-xl border border-slate-100 flex items-center gap-2 text-[9px] md:text-[10px] font-black text-slate-500 z-10 shadow-sm">
                                            <span>{match.matchdays?.scheduled_date ? new Date(match.matchdays.scheduled_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }).replace('.', '') : 'TBD'}</span>
                                            <span className="w-px h-3 bg-slate-300"></span>
                                            <span className="text-slate-800">{match.scheduled_time ? match.scheduled_time.substring(0, 5) : '--:--'}</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 z-10 bg-white px-2">
                                            {isSoccerPenalty && (
                                               <span className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] bg-slate-100 px-2 py-1 md:px-3 md:py-1 rounded-full border border-slate-200 shadow-sm whitespace-nowrap">
                                                 PEN: {match.home_sets} - {match.away_sets}
                                               </span>
                                            )}
                                            {match.status === 'LIVE' && (
                                               <span className="text-[8px] md:text-[9px] font-black text-red-500 uppercase tracking-[0.2em] bg-red-50 px-2 py-1 md:px-3 md:py-1 rounded-full border border-red-100 shadow-sm flex items-center gap-1 animate-pulse whitespace-nowrap">
                                                 <Activity size={10}/> {match.current_period}
                                               </span>
                                            )}
                                            {match.status === 'FINISHED' && !isSoccerPenalty && (
                                               <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] bg-slate-50 px-2 py-1 md:px-3 md:py-1 rounded-full border border-slate-100 whitespace-nowrap">
                                                 Finalizado
                                               </span>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-between z-10 bg-white">
                                        <div className="flex items-center gap-3 md:gap-4 w-[75%]">
                                          <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-50 rounded-[1rem] md:rounded-2xl p-2 border border-slate-100 shadow-sm shrink-0 group-hover:border-blue-200 transition-colors flex items-center justify-center">
                                            {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="max-w-full max-h-full object-contain" /> : <School className="w-full h-full text-slate-300 p-2"/>}
                                          </div>
                                          <div className="flex flex-col overflow-hidden">
                                            <span className="font-black text-xs md:text-sm uppercase leading-tight truncate w-full text-slate-800">{match.away_team?.name}</span>
                                            <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Visitante</span>
                                          </div>
                                        </div>
                                        {(match.status === 'LIVE' || match.status === 'FINISHED') && (
                                          <span className={`text-2xl md:text-3xl font-black tabular-nums shrink-0 ${match.status === 'FINISHED' && (isVolleyball ? match.away_sets < match.home_sets : match.away_score < match.home_score) ? 'text-slate-300' : 'text-slate-900'}`}>
                                            {isVolleyball ? match.away_sets : match.away_score}
                                          </span>
                                        )}
                                      </div>

                                    </div>

                                    {match.status === 'FINISHED' && (
                                       <div className="absolute inset-0 bg-blue-600/90 backdrop-blur-sm flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 rounded-[1.5rem] md:rounded-[2rem]">
                                          <Activity size={32} className="text-white mb-2"/>
                                          <span className="font-black text-white uppercase tracking-widest text-xs">Ver Resumen</span>
                                          <span className="font-bold text-blue-200 text-[10px] mt-1">Anotaciones y Detalles</span>
                                       </div>
                                    )}
                                  </div>
                                 )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'POSICIONES' && selectedCategory && 
                  renderPosiciones(activeSportName, teams, activeTournament)
                }

                {activeTab === 'ESTADISTICAS' && selectedCategory && 
                  renderEstadisticas(activeSportName, teams, scorers)
                }

              </div>
            </div>

          </div>

          {allLogos.length > 0 && (
            <div className="w-full overflow-hidden py-10 md:py-16 relative z-10 marquee-container mt-auto bg-slate-50">
               <div className="absolute top-0 left-0 w-16 md:w-32 h-full bg-gradient-to-r from-slate-50 to-transparent z-20 pointer-events-none"></div>
               <div className="absolute top-0 right-0 w-16 md:w-32 h-full bg-gradient-to-l from-slate-50 to-transparent z-20 pointer-events-none"></div>
               
               {/* 🚨 QUITAMOS LA OPACIDAD (opacity-50) Y AGREGAMOS PADDING (py-4) PARA QUE NO SE CORTEN AL CRECER 🚨 */}
               <div className="whitespace-nowrap flex items-center animate-marquee py-4">
                  {[...allLogos, ...allLogos, ...allLogos, ...allLogos].map((logo, idx) => (
                    // 🚨 AUMENTAMOS EL TAMAÑO A w-24 h-24 y en PC a w-32 h-32 🚨
                    <div key={idx} className="mx-6 md:mx-12 w-24 h-24 md:w-32 md:h-32 hover:scale-110 transition-transform cursor-pointer flex-shrink-0 flex items-center justify-center">
                      {/* 🚨 MEJORAMOS LA SOMBRA PARA QUE RESALTEN MÁS 🚨 */}
                      <img src={logo} className="max-w-full max-h-full object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.25)]" alt="Escudo" />
                    </div>
                  ))}
               </div>
            </div>
          )}
        </main>
      )}
    </>
  );
}
