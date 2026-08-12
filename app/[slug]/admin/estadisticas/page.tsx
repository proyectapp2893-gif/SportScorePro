'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../../supabase';
import { ArrowLeft, ArrowRight, Trophy, BarChart3, Medal, Crown, School, Activity, Shield, Flame, GitMerge, Scale, Search, Hash } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '../../../lib/sports/rules';

function EstadisticasContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const urlCategory = searchParams.get('cat'); 

  const [categories, setCategories] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [teams, setTeams] = useState<any[]>([]);
  const [topScorers, setTopScorers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tournamentSettings, setTournamentSettings] = useState<any>(null); // NUEVO: Para guardar las reglas del torneo
  const [searchTerm, setSearchTerm] = useState(''); // NUEVO: Buscador de equipos

  const [bestDefense, setBestDefense] = useState<any>(null);
  const [bestOffense, setBestOffense] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'STANDINGS' | 'SCORERS'>('STANDINGS');

  useEffect(() => {
    async function initializeHub() {
      if (!slug) return;
      
      const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
      
      if (client) {
        setClientId(client.id);
        // MEJORA: Obtenemos también las reglas del torneo (Fair Play)
        const { data: catData } = await supabase
          .from('categories')
          .select('*, tournaments!inner(client_id, name, fair_play_enabled, fp_starting_points), sports(name)')
          .eq('tournaments.client_id', client.id)
          .order('name');
          
        if (catData) setCategories(catData);
      }
    }
    initializeHub();
  }, [slug]);

  useEffect(() => {
    if (urlCategory && categories.length > 0) {
      const cat = categories.find(c => c.id === urlCategory);
      if (cat) {
        setSelectedCategory(urlCategory);
        setSelectedSport(cat.sports?.name);
        setTournamentSettings(cat.tournaments); // Guardamos la config del torneo activo
      }
    }
  }, [urlCategory, categories]);

  useEffect(() => {
    if (selectedCategory) {
      loadStatsData();
    } else {
      setTeams([]);
      setTopScorers([]);
      setBestDefense(null);
      setBestOffense(null);
    }
  }, [selectedCategory]);

  async function loadStatsData() {
    setLoading(true);
    
    const activeCat = categories.find(c => c.id === selectedCategory);
    const sportName = activeCat?.sports?.name?.toUpperCase() || '';
    
    const isBasketball = sportName.includes('BALONCESTO') || sportName.includes('BASKET');
    const isVolleyball = sportName.includes('VOLEIBOL') || sportName.includes('VOLEY');
    const isBaseball = sportName.includes('BÉISBOL') || sportName.includes('BEISBOL') || sportName.includes('SOFTBALL') || sportName.includes('BASEBALL');
    const isSoccer = !isBasketball && !isVolleyball && !isBaseball; 
    
    const { data: teamsData } = await supabase.from('teams')
      .select('*, schools(logo_url)')
      .eq('category_id', selectedCategory);
    
    if (teamsData) {
      const isFairPlayActive = tournamentSettings?.fair_play_enabled;
      const sportRules = getSportRules(activeCat?.sports?.name);
      const teamStats: Record<string, any> = {};

      teamsData.forEach((team: any) => {
        teamStats[team.id] = { ...team, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0 };
      });

      const { data: finishedMatches } = await supabase
        .from('matches')
        .select(`
          home_score, away_score, home_sets, away_sets, status,
          home_team:teams!home_team_id(id),
          away_team:teams!away_team_id(id),
          matchdays!inner(category_id)
        `)
        .eq('matchdays.category_id', selectedCategory)
        .eq('status', 'FINISHED');

      (finishedMatches || []).forEach((match: any) => {
        const homeId = match.home_team?.id;
        const awayId = match.away_team?.id;
        if (!homeId || !awayId || !teamStats[homeId] || !teamStats[awayId]) return;

        teamStats[homeId].played += 1;
        teamStats[awayId].played += 1;

        const matchScore = getMatchScoreForStandings(match, sportRules);
        const homeScore = matchScore.home;
        const awayScore = matchScore.away;

        if (matchScore.countsForScoreColumns) {
          teamStats[homeId].goals_for += homeScore;
          teamStats[homeId].goals_against += awayScore;
          teamStats[awayId].goals_for += awayScore;
          teamStats[awayId].goals_against += homeScore;
        }

        const points = getResultPoints(homeScore, awayScore, sportRules);
        teamStats[homeId].points += points.home;
        teamStats[awayId].points += points.away;

        if (homeScore > awayScore) {
          teamStats[homeId].won += 1;
          teamStats[awayId].lost += 1;
        } else if (awayScore > homeScore) {
          teamStats[awayId].won += 1;
          teamStats[homeId].lost += 1;
        } else {
          teamStats[homeId].drawn += 1;
          teamStats[awayId].drawn += 1;
        }
      });

      const sortedTeams = Object.values(teamStats).sort((a: any, b: any) =>
        compareTeamsForStandings(a, b, sportRules, isFairPlayActive, tournamentSettings?.fp_starting_points || 0)
      );
      
      setTeams(sortedTeams);

      const activeTeams = sortedTeams.filter(t => (t.played || 0) > 0);
      if (activeTeams.length > 0) {
        const defense = [...activeTeams].sort((a, b) => (a.goals_against || 0) - (b.goals_against || 0))[0];
        const offense = [...activeTeams].sort((a, b) => (b.goals_for || 0) - (a.goals_for || 0))[0];
        setBestDefense(defense);
        setBestOffense(offense);
      } else {
        setBestDefense(null);
        setBestOffense(null);
      }
    }

    const { data: playersData } = await supabase.from('players')
      .select(`
        id, name, shirt_number,
        teams!inner(id, name, category_id, schools(logo_url))
      `)
      .eq('teams.category_id', selectedCategory);

    if (playersData) {
      const { data: scoringEvents } = await supabase
        .from('match_events')
        .select('player_id, event_type, matches!inner(status, matchdays!inner(category_id))')
        .eq('matches.matchdays.category_id', selectedCategory)
        .in('event_type', ['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3']);

      const scoringByPlayer: Record<string, number> = {};
      (scoringEvents || []).forEach((event: any) => {
        if (!event.player_id || !['LIVE', 'FINISHED'].includes(event.matches?.status)) return;
        if (!scoringByPlayer[event.player_id]) scoringByPlayer[event.player_id] = 0;
        if (event.event_type === 'GOAL' || event.event_type === 'BASKET_1') scoringByPlayer[event.player_id] += 1;
        else if (event.event_type === 'BASKET_2') scoringByPlayer[event.player_id] += 2;
        else if (event.event_type === 'BASKET_3') scoringByPlayer[event.player_id] += 3;
      });

      const scorers = playersData.map(player => {
        const totalScore = scoringByPlayer[player.id] || 0;
        return { ...player, totalScore };
      }).filter(p => p.totalScore > 0); 

      const sortedScorers = scorers.sort((a, b) => b.totalScore - a.totalScore).slice(0, 15);
      setTopScorers(sortedScorers);
    }

    setLoading(false);
  }

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol') || name.includes('soccer')) return <FaFutbol className="text-slate-600 group-hover:text-blue-500 transition-colors" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-slate-600 group-hover:text-blue-500 transition-colors" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-slate-600 group-hover:text-blue-500 transition-colors" size={size} />;
    if (name.includes('softball') || name.includes('béisbol') || name.includes('baseball')) return <FaBaseballBall className="text-slate-600 group-hover:text-blue-500 transition-colors" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  const activeSportName = selectedSport?.toUpperCase() || '';
  const activeCategoryName = categories.find(c => c.id === selectedCategory)?.name || '';
  const activeTournamentName = categories.find(c => c.id === selectedCategory)?.tournaments?.name || '';

  const uniqueSports = Array.from(new Set(categories.map(c => c.sports?.name).filter(Boolean)));

  const isBasketball = activeSportName.includes('BALONCESTO') || activeSportName.includes('BASKET');
  const isVolleyball = activeSportName.includes('VOLEIBOL') || activeSportName.includes('VOLEY');
  const isBaseball = activeSportName.includes('BÉISBOL') || activeSportName.includes('BEISBOL') || activeSportName.includes('SOFTBALL') || activeSportName.includes('BASEBALL');
  const isSoccer = !isBasketball && !isVolleyball && !isBaseball;
  
  let colFor = 'GF', colAgainst = 'GC', colDiff = 'DIF';
  let titleFor = 'Goles a Favor', titleAgainst = 'Goles en Contra', titleDiff = 'Diferencia de Goles';
  let scorersTabLabel = 'GOLEADORES';
  let scoreUnitLabel = 'GOLES';

  if (isBasketball) { 
    colFor = 'PF'; colAgainst = 'PC'; colDiff = 'AVG'; 
    titleFor = 'Puntos a Favor'; titleAgainst = 'Puntos en Contra'; titleDiff = 'Average (Anotados / Recibidos)';
    scorersTabLabel = 'TOP ANOTADORES'; scoreUnitLabel = 'PUNTOS';
  }
  if (isVolleyball) { 
    colFor = 'SF'; colAgainst = 'SC'; colDiff = 'RATIO'; 
    titleFor = 'Sets a Favor'; titleAgainst = 'Sets en Contra'; titleDiff = 'Set Ratio (A Favor / En Contra)';
    scorersTabLabel = 'TOP ANOTADORES'; scoreUnitLabel = 'PUNTOS';
  }
  if (isBaseball) { 
    colFor = 'CF'; colAgainst = 'CC'; colDiff = 'PCT'; 
    titleFor = 'Carreras a Favor'; titleAgainst = 'Carreras en Contra'; titleDiff = 'Porcentaje de Victorias (Win/Loss PCT)';
    scorersTabLabel = 'ANOTADORES'; scoreUnitLabel = 'CARRERAS';
  }

  // Filtrado de equipos por buscador
  const filteredTeams = teams.filter(team => 
    team.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    team.group_name?.toLowerCase() === searchTerm.toLowerCase()
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <div className="max-w-6xl mx-auto px-4 py-12">
        
        {/* CABECERA (Sobria y elegante) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 sm:mb-12 gap-5 sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Centro de <span className="text-blue-600">Estadísticas</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Analítica avanzada</p>
          </div>
          
          {selectedCategory ? (
            <button onClick={() => { setSelectedCategory(null); router.replace(`/${slug}/admin/estadisticas`, { scroll: false }); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Categorías
            </button>
          ) : selectedSport ? (
            <button onClick={() => setSelectedSport(null)} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Deportes
            </button>
          ) : (
            <Link href={`/${slug}/admin`} className="w-full sm:w-fit p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Volver al inicio
            </Link>
          )}
        </div>

        {/* VISTA 1: SELECCIONAR DEPORTE */}
        {!selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-5 sm:p-8 bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] hover:border-blue-300 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden h-full"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left text-slate-300">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2 break-words">{sport as string}</h3>
                   <div className="mt-auto flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors w-full justify-between pt-4">
                     Análisis por Deporte <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
               {uniqueSports.length === 0 && <div className="col-span-full p-8 sm:p-12 text-center text-slate-400 font-black text-xs uppercase tracking-[0.3em] bg-white rounded-[2rem] sm:rounded-[2.5rem] border border-slate-200 shadow-sm">No hay datos registrados aún.</div>}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIONAR CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => {
                     setSelectedCategory(c.id);
                     router.replace(`/${slug}/admin/estadisticas?cat=${c.id}`, { scroll: false });
                   }}
                   className="group flex flex-col p-5 sm:p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2 break-words">{c.name}</h3>
                   <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 w-full justify-between">
                     Ver Tablas de Rendimiento <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: PANTALLA DE ESTADÍSTICAS */}
        {selectedCategory && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500 space-y-8">
            
            {/* HEADER INFO */}
            <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
              
              <div className="relative z-10 flex items-center gap-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                  {getSportIcon(activeSportName, 32)}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{activeCategoryName}</h2>
                  <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">Torneo: {activeTournamentName}</p>
                </div>
              </div>

              {/* BARRA DE BÚSQUEDA */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl shadow-sm focus-within:border-blue-500 transition-all sm:w-64 w-full relative z-10">
                <Search size={16} className="text-slate-400" />
                <input type="text" placeholder="Buscar equipo..." className="bg-transparent text-sm font-bold text-slate-900 outline-none w-full placeholder:text-slate-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>

            {/* HIGHLIGHTS DEPORTIVOS */}
            {((isSoccer && bestDefense) || (isBasketball && bestOffense) || (isBaseball && bestOffense)) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {isSoccer && bestDefense && (
                  <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-slate-300 transition-all">
                    <div className="absolute -right-6 -top-6 text-slate-50 rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
                      <Shield size={120} />
                    </div>
                    <div className="flex items-center gap-4 z-10">
                      <div className="w-16 h-16 bg-white rounded-2xl border border-slate-100 flex items-center justify-center p-2 shrink-0 shadow-sm">
                        {bestDefense.schools?.logo_url ? <img src={bestDefense.schools.logo_url} className="w-full h-full object-contain" /> : <School size={24} className="text-slate-300"/>}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{bestDefense.name}</h3>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1 mt-1"><Shield size={12}/> Valla Menos Vencida</p>
                      </div>
                    </div>
                    <div className="text-right z-10">
                      <span className="text-4xl font-black text-slate-800 drop-shadow-sm">{bestDefense.goals_against || 0}</span>
                      <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Goles en contra</p>
                    </div>
                  </div>
                )}

                {(isBasketball || isBaseball) && bestOffense && (
                  <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-slate-300 transition-all">
                    <div className="absolute -right-6 -top-6 text-slate-50 rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
                      <Flame size={120} />
                    </div>
                    <div className="flex items-center gap-4 z-10">
                      <div className="w-16 h-16 bg-white rounded-2xl border border-slate-100 flex items-center justify-center p-2 shrink-0 shadow-sm">
                        {bestOffense.schools?.logo_url ? <img src={bestOffense.schools.logo_url} className="w-full h-full object-contain" /> : <School size={24} className="text-slate-300"/>}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{bestOffense.name}</h3>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1 mt-1">
                          <Flame size={12}/> {isBaseball ? 'Novena Más Anotadora' : 'Equipo Más Ofensivo'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right z-10">
                      <span className="text-4xl font-black text-slate-800 drop-shadow-sm">{bestOffense.goals_for || 0}</span>
                      <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">{isBaseball ? 'Carreras a favor' : 'Puntos a favor'}</p>
                    </div>
                  </div>
                )}
                
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col min-h-[500px]">
              
              {/* TABS NAVEGACIÓN DINÁMICOS */}
              <div className="flex overflow-x-auto bg-slate-50 px-4 pt-4 border-b border-slate-100 gap-2 scrollbar-hide flex-wrap sm:flex-nowrap">
                {[
                  { id: 'STANDINGS', label: 'TABLA DE POSICIONES', icon: <Trophy size={14}/> },
                  { id: 'SCORERS', label: scorersTabLabel, icon: <Activity size={14}/> }
                ].filter(tab => {
                   if (tab.id === 'SCORERS' && (isVolleyball || isBaseball)) return false;
                   return true;
                }).map(tab => (
                  <button
                    key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                    className={`px-8 py-4 rounded-t-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all whitespace-nowrap flex items-center gap-2
                      ${activeTab === tab.id 
                        ? 'bg-white text-blue-600 border-t-2 border-x border-slate-100 shadow-sm z-10 -mb-[1px]' 
                        : 'bg-slate-100 text-slate-400 hover:bg-white hover:text-slate-600 border-t border-transparent'}
                    `}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-0 flex-1">
                {loading ? (
                  <div className="flex flex-col items-center justify-center p-20 gap-4">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-center text-slate-400 font-black text-[10px] uppercase tracking-[0.3em]">Procesando métricas...</p>
                  </div>
                ) : (
                  <>
                    {/* TABLA DE POSICIONES */}
                    {activeTab === 'STANDINGS' && (
                      <div className="overflow-x-auto flex flex-col h-full">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                          <thead>
                            <tr className="bg-white text-[9px] text-slate-400 uppercase font-black tracking-[0.2em] border-b-2 border-slate-100">
                              <th className="p-4 pl-8 text-center w-12"><Hash size={14}/></th>
                              <th className="p-4">Delegación</th>
                              <th className="p-4 text-center" title="Partidos Jugados">PJ</th>
                              <th className="p-4 text-center text-emerald-600" title="Partidos Ganados">PG</th>
                              {isSoccer && <th className="p-4 text-center text-amber-500" title="Partidos Empatados">PE</th>}
                              <th className="p-4 text-center text-red-500" title="Partidos Perdidos">PP</th>
                              <th className="p-4 text-center" title={titleFor}>{colFor}</th>
                              <th className="p-4 text-center" title={titleAgainst}>{colAgainst}</th>
                              <th className="p-4 text-center" title={titleDiff}>{colDiff}</th>
                              
                              {/* COLUMNA FAIR PLAY DINÁMICA */}
                              {tournamentSettings?.fair_play_enabled && (
                                <th className="p-4 text-center text-blue-600 bg-blue-50/50 border-l border-blue-100" title="Puntos Fair Play (Juego Limpio)">
                                  <div className="flex items-center justify-center gap-1"><Scale size={10}/> FP</div>
                                </th>
                              )}
                              
                              <th className="p-4 pr-8 text-center text-blue-600 text-xs">PTS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {filteredTeams.length === 0 ? (
                              <tr><td colSpan={11} className="p-16 text-center text-slate-400 font-black text-xs uppercase tracking-[0.3em] bg-slate-50/50">Sin datos registrados</td></tr>
                            ) : (
                              filteredTeams.map((team, index) => {
                                const isFirst = index === 0;
                                const isTop4 = index < 4;
                                
                                let diffDisplay: string | number = '';
                                let isPositive = false;
                                let isNegative = false;

                                if (isBasketball || isVolleyball) {
                                  const ratio = (team.goals_against || 0) === 0 ? (team.goals_for || 0) : (team.goals_for || 0) / (team.goals_against || 0);
                                  diffDisplay = ratio.toFixed(2);
                                  isPositive = ratio > 1;
                                  isNegative = ratio < 1;
                                } else if (isBaseball) {
                                  const pct = team.played ? ((team.won || 0) / team.played).toFixed(3) : '.000';
                                  diffDisplay = pct.replace(/^0+/, ''); 
                                  isPositive = (team.won || 0) > (team.lost || 0);
                                  isNegative = (team.lost || 0) > (team.won || 0);
                                } else {
                                  const diff = (team.goals_for || 0) - (team.goals_against || 0);
                                  diffDisplay = diff > 0 ? `+${diff}` : diff;
                                  isPositive = diff > 0;
                                  isNegative = diff < 0;
                                }

                                return (
                                  <tr key={team.id} className={`hover:bg-slate-50/80 transition-colors ${isFirst ? 'bg-blue-50/20' : ''}`}>
                                    <td className="p-4 pl-8 text-center">
                                      <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center font-black text-sm
                                        ${isFirst ? 'bg-slate-900 text-white shadow-sm' 
                                        : isTop4 ? 'bg-slate-200 text-slate-700' : 'bg-transparent text-slate-400'}
                                      `}>
                                        {index + 1}
                                      </div>
                                    </td>
                                    
                                    <td className="p-4">
                                      <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-full border border-slate-100 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-sm">
                                          {team.schools?.logo_url ? <img src={team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={16} className="text-slate-200"/>}
                                        </div>
                                        <div className="flex flex-col">
                                          <span className={`font-black uppercase tracking-tight text-sm ${isFirst ? 'text-slate-900' : 'text-slate-700'}`}>
                                            {team.name}
                                          </span>
                                          {team.group_name && <span className="text-[9px] text-slate-400 font-black tracking-widest">Grupo {team.group_name}</span>}
                                        </div>
                                      </div>
                                    </td>

                                    <td className="p-4 text-center font-bold text-slate-500">{team.played || 0}</td>
                                    <td className="p-4 text-center font-bold text-emerald-600">{team.won || 0}</td>
                                    {isSoccer && <td className="p-4 text-center font-bold text-amber-500">{team.drawn || 0}</td>}
                                    <td className="p-4 text-center font-bold text-red-500">{team.lost || 0}</td>
                                    <td className="p-4 text-center font-bold text-slate-600">{team.goals_for || 0}</td>
                                    <td className="p-4 text-center font-bold text-slate-600">{team.goals_against || 0}</td>
                                    
                                    <td className="p-4 text-center font-black">
                                      <span className={isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-slate-400'}>
                                        {diffDisplay}
                                      </span>
                                    </td>

                                    {/* CELDA DE FAIR PLAY */}
                                    {tournamentSettings?.fair_play_enabled && (
                                      <td className="p-4 text-center font-black text-blue-600 bg-blue-50/30 border-l border-blue-50">
                                        {team.fair_play_points ?? tournamentSettings.fp_starting_points}
                                      </td>
                                    )}

                                    <td className="p-4 pr-8 text-center font-black text-xl text-blue-600 bg-slate-50/50">{team.points || 0}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                        
                        {/* LEYENDA */}
                        <div className="bg-slate-50 p-4 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-2 justify-center text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-auto">
                          <span title="Partidos Jugados"><strong>PJ:</strong> Partidos Jugados</span>
                          <span title="Partidos Ganados"><strong>PG:</strong> Ganados</span>
                          {isSoccer && <span title="Partidos Empatados"><strong>PE:</strong> Empatados</span>}
                          <span title="Partidos Perdidos"><strong>PP:</strong> Perdidos</span>
                          <span title={titleFor}><strong>{colFor}:</strong> {titleFor}</span>
                          <span title={titleAgainst}><strong>{colAgainst}:</strong> {titleAgainst}</span>
                          <span title={titleDiff}><strong>{colDiff}:</strong> {titleDiff}</span>
                          {tournamentSettings?.fair_play_enabled && <span className="text-blue-600"><strong>FP:</strong> Puntos de Juego Limpio</span>}
                          <span className="text-blue-500"><strong>PTS:</strong> Puntos Totales</span>
                        </div>

                      </div>
                    )}

                    {/* TABLA DE GOLEADORES / ANOTADORES */}
                    {activeTab === 'SCORERS' && (
                      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50/30 h-full">
                        {topScorers.length === 0 ? (
                          <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                            <Activity size={48} className="text-slate-200 mb-4" />
                            <p className="text-slate-400 font-black text-xs uppercase tracking-[0.3em]">Registro vacío</p>
                          </div>
                        ) : (
                          topScorers.map((player, index) => {
                            const isMVP = index === 0;
                            return (
                              <div key={player.id} className={`p-6 rounded-[2rem] border relative overflow-hidden flex items-center justify-between transition-all
                                ${isMVP ? 'bg-white border-amber-200 shadow-md' : 'bg-white border-slate-100 shadow-sm hover:shadow-md'}
                              `}>
                                
                                <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
                                  <span className="text-8xl font-black italic text-slate-900">{index + 1}</span>
                                </div>

                                <div className="flex items-center gap-4 z-10">
                                  <div className="relative">
                                    <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center p-2 bg-white overflow-hidden
                                      ${isMVP ? 'border-amber-300' : 'border-slate-100'}
                                    `}>
                                      {player.teams?.schools?.logo_url ? <img src={player.teams.schools.logo_url} className="w-full h-full object-contain" /> : <School size={24} className="text-slate-200"/>}
                                    </div>
                                    {isMVP && (
                                      <div className="absolute -top-3 -right-2 text-amber-500 drop-shadow-sm">
                                        <Crown size={24} className="fill-amber-400" />
                                      </div>
                                    )}
                                    <div className={`absolute -bottom-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white font-black text-xs ${isMVP ? 'bg-amber-500 text-white' : 'bg-slate-800 text-white'}`}>
                                      {player.shirt_number || '-'}
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <h4 className={`font-black uppercase tracking-tight text-sm leading-tight max-w-[120px] truncate ${isMVP ? 'text-amber-600' : 'text-slate-900'}`}>{player.name}</h4>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate max-w-[120px]">{player.teams?.name}</p>
                                  </div>
                                </div>

                                <div className="text-right z-10 flex flex-col items-end justify-center">
                                  <span className={`text-4xl font-black leading-none tracking-tighter ${isMVP ? 'text-amber-500' : 'text-slate-800'}`}>{player.totalScore}</span>
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{scoreUnitLabel}</span>
                                </div>
                                
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function EstadisticasPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-black tracking-[0.3em] uppercase text-xs">Accediendo a Analítica Central...</p>
      </div>
    }>
      <EstadisticasContent />
    </Suspense>
  );
}
