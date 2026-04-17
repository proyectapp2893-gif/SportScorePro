'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../supabase';
import { Trophy, CalendarDays, Clock, Medal, Crown, Activity, Shield, Flame, ChevronLeft, Radio, GitMerge, School } from 'lucide-react';
import Link from 'next/link';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';

function PublicPortalContent() {
  const [categories, setCategories] = useState<any[]>([]);
  const [sports, setSports] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [matches, setMatches] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [topScorers, setTopScorers] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState<'FIXTURE' | 'POSICIONES' | 'GOLEADORES' | 'LLAVES'>('FIXTURE');
  const [loading, setLoading] = useState(false);

  // 1. CARGA INICIAL DE DATOS BASE
  useEffect(() => {
    async function loadBaseData() {
      const { data: catData } = await supabase.from('categories').select('*, sports(name), tournaments(name, logo_url)').order('name');
      if (catData) setCategories(catData);
      
      const { data: schoolData } = await supabase.from('schools').select('*').order('name');
      if (schoolData) setSchools(schoolData);

      const uniqueSports = Array.from(new Set(catData?.map(c => c.sports?.name).filter(Boolean)));
      setSports(uniqueSports);
    }
    loadBaseData();
  }, []);

  // 2. CARGA DE DATOS DE LA CATEGORÍA SELECCIONADA
  useEffect(() => {
    if (selectedCategory) {
      loadCategoryData();
      
      // MAGIA: SUSCRIPCIÓN EN TIEMPO REAL PARA PARTIDOS EN VIVO
      const channel = supabase.channel('public-matches')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
          // Si hay un cambio en la base de datos, recargamos los datos silenciosamente
          loadCategoryData(true); 
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setMatches([]);
      setTeams([]);
      setTopScorers([]);
    }
  }, [selectedCategory]);

  async function loadCategoryData(isSilentRefresh = false) {
    if (!isSilentRefresh) setLoading(true);

    // Cargar Partidos
    const { data: matchesData } = await supabase.from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time, current_period,
        home_team:teams!home_team_id(id, name, schools(logo_url)), 
        away_team:teams!away_team_id(id, name, schools(logo_url)),
        matchdays!inner(category_id, round_number, scheduled_date)
      `)
      .eq('matchdays.category_id', selectedCategory)
      .order('scheduled_time', { ascending: true });
    if (matchesData) setMatches(matchesData);

    // Cargar Equipos (Posiciones)
    const { data: teamsData } = await supabase.from('teams')
      .select('*, schools(logo_url)')
      .eq('category_id', selectedCategory);
    if (teamsData) {
      const sortedTeams = teamsData.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffB = (b.goals_for || 0) - (b.goals_against || 0);
        const diffA = (a.goals_for || 0) - (a.goals_against || 0);
        if (diffB !== diffA) return diffB - diffA;
        return (b.goals_for || 0) - (a.goals_for || 0);
      });
      setTeams(sortedTeams);
    }

    // Cargar Goleadores
    const { data: playersData } = await supabase.from('players')
      .select(`id, name, shirt_number, teams!inner(id, name, category_id, schools(logo_url)), match_events(event_type)`)
      .eq('teams.category_id', selectedCategory);
    if (playersData) {
      const scorers = playersData.map(player => {
        let totalScore = 0;
        player.match_events.forEach((event: any) => {
          if (event.event_type === 'GOAL' || event.event_type === 'BASKET_1') totalScore += 1;
          else if (event.event_type === 'BASKET_2') totalScore += 2;
          else if (event.event_type === 'BASKET_3') totalScore += 3;
        });
        return { ...player, totalScore };
      }).filter(p => p.totalScore > 0); 
      setTopScorers(scorers.sort((a, b) => b.totalScore - a.totalScore).slice(0, 15));
    }

    if (!isSilentRefresh) setLoading(false);
  }

  // UTILIDADES
  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol') || name.includes('soccer')) return <FaFutbol className="text-emerald-500" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-500" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-blue-500" size={size} />;
    if (name.includes('softball') || name.includes('béisbol')) return <FaBaseballBall className="text-red-500" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  const liveMatches = matches.filter(m => m.status === 'LIVE');
  const scheduledMatches = matches.filter(m => m.status === 'SCHEDULED' || m.status === 'FINISHED');
  const finalMatches = matches.filter(m => m.matchdays?.round_number >= 100); // EXTRAER PARTIDOS DE FASE FINAL
  const hasFinalsGenerated = finalMatches.length > 0;
  
  const activeSportName = selectedSport?.toUpperCase() || '';
  const activeCategoryObj = categories.find(c => c.id === selectedCategory);
  
  const isBasketball = activeSportName.includes('BALONCESTO') || activeSportName.includes('BASKET');
  const isVolleyball = activeSportName.includes('VOLEIBOL') || activeSportName.includes('VOLEY');
  const isBaseball = activeSportName.includes('BÉISBOL') || activeSportName.includes('BEISBOL') || activeSportName.includes('SOFTBALL') || activeSportName.includes('BASEBALL');
  const isSoccer = !isBasketball && !isVolleyball && !isBaseball;
  
  const colFor = isBasketball ? 'PF' : (isVolleyball ? 'SF' : 'GF');
  const colAgainst = isBasketball ? 'PC' : (isVolleyball ? 'SC' : 'GC');

  // LÓGICA DINÁMICA DE ETIQUETAS PARA LA PESTAÑA DE "GOLEADORES"
  let scorersTabLabel = 'GOLEADORES';
  let scoreUnitLabel = 'GOLES';
  
  if (isBasketball || isVolleyball) {
    scorersTabLabel = 'TOP ANOTADORES';
    scoreUnitLabel = 'PUNTOS';
  } else if (isBaseball) {
    scorersTabLabel = 'ANOTADORES';
    scoreUnitLabel = 'CARRERAS';
  }

  // LÓGICA DE LLAVES (Fase Final)
  const isCuadrangular = teams.length === 4;
  const isPentagonal = teams.length === 5 && !isVolleyball;
  
  const TeamSlot = ({ team, seed }: { team?: any, seed: string }) => (
    <div className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl w-48 sm:w-56 shadow-sm relative z-10">
      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-50 rounded-full border border-slate-100 flex items-center justify-center p-1 shrink-0">
        {team?.schools?.logo_url ? <img src={team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={16} className="text-slate-300"/>}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className={`font-black uppercase tracking-tight text-xs truncate ${team ? 'text-slate-900' : 'text-slate-400'}`}>
          {team ? team.name : 'Por Definir'}
        </span>
        <span className="text-[8px] sm:text-[9px] font-bold text-indigo-500 uppercase tracking-widest">{seed}</span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col relative overflow-hidden">
      
      {/* INYECCIÓN DE CSS PARA EL CARRUSEL INFINITO */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: flex; width: max-content; animation: marquee 30s linear infinite; }
        .animate-marquee:hover { animation-play-state: paused; }
      `}} />

      {/* CABECERA PÚBLICA: LOGO GRANDE, REDONDO Y BOTÓN DE INICIO */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md group-hover:scale-105 transition-transform overflow-hidden p-1.5">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-black uppercase tracking-tighter leading-none italic text-slate-900">CSJB</h1>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Championship</p>
            </div>
          </Link>
          
          <div className="flex items-center gap-2">
            {(selectedCategory || selectedSport) ? (
              <button 
                onClick={() => selectedCategory ? setSelectedCategory(null) : setSelectedSport(null)}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-slate-50 px-5 py-2.5 rounded-full border border-slate-200 transition-colors shadow-sm active:scale-95"
              >
                <ChevronLeft size={16} /> Atrás
              </button>
            ) : (
              <Link 
                href="/"
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-slate-50 px-5 py-2.5 rounded-full border border-slate-200 transition-colors shadow-sm active:scale-95"
              >
                <ChevronLeft size={16} /> Inicio
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 mb-24">
        
        {/* VISTA 1: SELECCIÓN DE DEPORTE */}
        {!selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <div className="text-center mb-10">
               <h2 className="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-tighter mb-2">Portal de Resultados</h2>
               <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Selecciona una disciplina para comenzar</p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {sports.map(sport => (
                 <button 
                   key={sport} onClick={() => setSelectedSport(sport)}
                   className="group bg-white p-8 rounded-[2.5rem] border border-slate-200 hover:border-blue-400 hover:shadow-xl transition-all text-center flex flex-col items-center shadow-sm"
                 >
                   <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                     {getSportIcon(sport, 40)}
                   </div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{sport}</h3>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIÓN DE CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <div className="text-center mb-10">
               <div className="flex justify-center mb-4">{getSportIcon(selectedSport, 48)}</div>
               <h2 className="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-tighter mb-2">{selectedSport}</h2>
               <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Selecciona la categoría</p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id} onClick={() => setSelectedCategory(c.id)}
                   className="group bg-white p-8 rounded-[2rem] border border-slate-200 hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm flex flex-col"
                 >
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1">{c.name}</h3>
                   <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest mb-6">{c.gender}</p>
                   <div className="mt-auto inline-block bg-slate-50 px-4 py-2 rounded-full border border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors w-max">
                     Ver Resultados
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: DASHBOARD PÚBLICO (TODO EN UNO) */}
        {selectedCategory && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500 space-y-8">
            
            {/* INFO CABECERA CATEGORÍA */}
            <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-[2rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  {getSportIcon(activeSportName, 32)}
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{activeCategoryObj?.name}</h2>
                  <p className="text-blue-600 font-bold text-[10px] uppercase tracking-widest mt-1">{activeCategoryObj?.gender} • {activeCategoryObj?.tournaments?.name}</p>
                </div>
              </div>
            </div>

            {/* 🔥 SECCIÓN PARTIDOS EN VIVO */}
            {liveMatches.length > 0 && (
              <div className="bg-emerald-50 border-2 border-emerald-400 p-6 md:p-8 rounded-[2rem] shadow-lg shadow-emerald-100 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6 relative z-10">
                  <h3 className="text-xl font-black text-emerald-700 uppercase tracking-tighter flex items-center gap-2">
                    <Radio className="animate-pulse" /> Transmisión en Vivo
                  </h3>
                  <span className="bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-pulse shadow-md">Live</span>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
                  {liveMatches.map(match => (
                    <div key={match.id} className="bg-white p-6 rounded-3xl border border-emerald-200 shadow-md flex items-center justify-between">
                       <div className="flex flex-col items-center gap-2 w-1/3">
                         <img src={match.home_team?.schools?.logo_url} className="w-12 h-12 object-contain" />
                         <span className="font-black text-slate-900 text-xs uppercase text-center">{match.home_team?.name}</span>
                       </div>
                       <div className="flex flex-col items-center w-1/3">
                         <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">{match.current_period || 'Jugando'}</span>
                         <div className="bg-slate-900 text-white px-6 py-2 rounded-xl text-3xl font-black tracking-widest shadow-inner">
                           {match.home_score} - {match.away_score}
                         </div>
                       </div>
                       <div className="flex flex-col items-center gap-2 w-1/3">
                         <img src={match.away_team?.schools?.logo_url} className="w-12 h-12 object-contain" />
                         <span className="font-black text-slate-900 text-xs uppercase text-center">{match.away_team?.name}</span>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TABS DE NAVEGACIÓN DINÁMICOS */}
            <div className="flex overflow-x-auto bg-slate-200/50 p-1.5 rounded-2xl gap-1 scrollbar-hide border border-slate-200">
              {[
                { id: 'FIXTURE', label: 'FIXTURE' },
                { id: 'POSICIONES', label: 'POSICIONES' },
                { id: 'GOLEADORES', label: scorersTabLabel }, // <-- Etiqueta Dinámica Inyectada Aquí
                { id: 'LLAVES', label: 'LLAVES' }
              ].map(tab => (
                <button
                  key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 min-w-[120px] py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all
                    ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* CONTENIDO DE LOS TABS */}
            <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden min-h-[400px] p-0">
              
              {loading ? (
                <p className="text-center text-slate-400 font-bold p-20 uppercase tracking-widest">Actualizando datos...</p>
              ) : (
                <>
                  {/* TAB 1: FIXTURE */}
                  {activeTab === 'FIXTURE' && (
                    <div className="divide-y divide-slate-100">
                      {scheduledMatches.length === 0 ? (
                        <p className="text-center text-slate-400 font-bold p-12 uppercase tracking-widest text-xs bg-slate-50/50">El calendario aún no ha sido generado.</p>
                      ) : (
                        scheduledMatches.map(match => (
                          <div key={match.id} className="p-6 md:p-8 hover:bg-slate-50 transition-colors flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex flex-col items-center md:items-start w-full md:w-auto">
                              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest mb-2 ${match.status === 'FINISHED' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>
                                {match.status === 'FINISHED' ? 'Finalizado' : `Fecha ${match.matchdays?.round_number}`}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest">
                                <CalendarDays size={12}/> {match.matchdays?.scheduled_date ? new Date(match.matchdays.scheduled_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : ''} - {match.scheduled_time ? match.scheduled_time.substring(0,5) : ''}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 md:gap-8 w-full md:w-auto justify-center">
                              <div className="flex items-center gap-3 w-28 md:w-40 justify-end">
                                <span className="font-black text-slate-900 text-xs md:text-sm uppercase text-right break-words">{match.home_team?.name}</span>
                                <img src={match.home_team?.schools?.logo_url} className="w-8 h-8 md:w-10 md:h-10 object-contain drop-shadow-sm" />
                              </div>
                              
                              {match.status === 'FINISHED' ? (
                                <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-lg font-black tracking-widest shadow-inner">
                                  {match.home_score} - {match.away_score}
                                </div>
                              ) : (
                                <div className="bg-slate-100 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-400">VS</div>
                              )}

                              <div className="flex items-center gap-3 w-28 md:w-40 justify-start">
                                <img src={match.away_team?.schools?.logo_url} className="w-8 h-8 md:w-10 md:h-10 object-contain drop-shadow-sm" />
                                <span className="font-black text-slate-900 text-xs md:text-sm uppercase text-left break-words">{match.away_team?.name}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB 2: TABLA DE POSICIONES */}
                  {activeTab === 'POSICIONES' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-200">
                            <th className="p-5 w-12 text-center">Pos</th>
                            <th className="p-5">Institución</th>
                            <th className="p-5 text-center">PJ</th>
                            <th className="p-5 text-center">PG</th>
                            <th className="p-5 text-center">PE</th>
                            <th className="p-5 text-center">PP</th>
                            <th className="p-5 text-center">{colFor}</th>
                            <th className="p-5 text-center">{colAgainst}</th>
                            <th className="p-5 text-center">DIF</th>
                            <th className="p-5 text-center text-blue-600">PTS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {teams.length === 0 ? (
                            <tr><td colSpan={10} className="p-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">Sin datos.</td></tr>
                          ) : (
                            teams.map((team, index) => {
                              const isFirst = index === 0;
                              const diff = (team.goals_for || 0) - (team.goals_against || 0);
                              return (
                                <tr key={team.id} className={`hover:bg-slate-50 transition-colors ${isFirst ? 'bg-amber-50/40' : ''}`}>
                                  <td className="p-5 text-center font-black text-sm text-slate-400">{index + 1}</td>
                                  <td className="p-5 flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white rounded-full border border-slate-200 flex items-center justify-center p-1 shadow-sm">
                                      <img src={team.schools?.logo_url} className="w-full h-full object-contain" />
                                    </div>
                                    <span className={`font-black uppercase text-xs ${isFirst ? 'text-amber-600' : 'text-slate-900'}`}>{team.name}</span>
                                  </td>
                                  <td className="p-5 text-center font-bold text-slate-600">{team.played || 0}</td>
                                  <td className="p-5 text-center font-bold text-slate-600">{team.won || 0}</td>
                                  <td className="p-5 text-center font-bold text-slate-600">{team.drawn || 0}</td>
                                  <td className="p-5 text-center font-bold text-slate-600">{team.lost || 0}</td>
                                  <td className="p-5 text-center font-bold text-slate-600">{team.goals_for || 0}</td>
                                  <td className="p-5 text-center font-bold text-slate-600">{team.goals_against || 0}</td>
                                  <td className="p-5 text-center font-black text-slate-400">{diff > 0 ? `+${diff}` : diff}</td>
                                  <td className="p-5 text-center font-black text-lg text-blue-600">{team.points || 0}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* TAB 3: ANOTADORES / GOLEADORES */}
                  {activeTab === 'GOLEADORES' && (
                    <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50/50">
                      {topScorers.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">Aún no hay registros en la tabla.</div>
                      ) : (
                        topScorers.map((player, index) => (
                          <div key={player.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <img src={player.teams?.schools?.logo_url} className="w-10 h-10 object-contain drop-shadow-sm" />
                                {index === 0 && <Crown size={16} className="absolute -top-3 -right-2 text-amber-500 fill-amber-400 drop-shadow-sm" />}
                              </div>
                              <div>
                                <h4 className="font-black text-slate-900 text-xs uppercase truncate max-w-[120px]">{player.name}</h4>
                                <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Dorsal: {player.shirt_number}</p>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end justify-center">
                              <span className="text-2xl font-black text-blue-600 leading-none">{player.totalScore}</span>
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{scoreUnitLabel}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB 4: FASE FINAL */}
                  {activeTab === 'LLAVES' && (
                    <div className="p-8 overflow-x-auto flex justify-center bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:2rem_2rem]">
                       {!hasFinalsGenerated ? (
                         <div className="py-16 text-center text-slate-400 flex flex-col items-center">
                           <div className="bg-slate-100 p-4 rounded-full mb-4"><GitMerge size={40} className="text-slate-400"/></div>
                           <p className="text-slate-700 font-black text-sm uppercase tracking-widest mb-1">Fase Final No Generada</p>
                           <p className="text-xs font-bold uppercase tracking-widest">Las llaves aparecerán aquí cuando la organización defina los cruces.</p>
                         </div>
                       ) : (isVolleyball || isCuadrangular) ? (
                         <div className="flex items-center gap-8 md:gap-12 min-w-[700px]">
                           {/* SEMIFINALES */}
                           <div className="flex flex-col gap-12 relative z-10">
                             <div className="flex flex-col gap-2">
                               <TeamSlot team={finalMatches[0]?.home_team} seed="Local Semi 1" />
                               <TeamSlot team={finalMatches[0]?.away_team} seed="Visitante Semi 1" />
                             </div>
                             <div className="flex flex-col gap-2">
                               <TeamSlot team={finalMatches[1]?.home_team} seed="Local Semi 2" />
                               <TeamSlot team={finalMatches[1]?.away_team} seed="Visitante Semi 2" />
                             </div>
                           </div>
                           <div className="w-12 border-t-2 border-indigo-400 relative">
                             <Trophy size={16} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-white border-2 border-indigo-400 rounded-full p-2 text-indigo-600" />
                           </div>
                           {/* FINAL (Aún por definir ganadores) */}
                           <div className="flex flex-col gap-2 p-6 bg-amber-50 rounded-3xl border border-amber-200">
                             <TeamSlot seed="Ganador S1" />
                             <TeamSlot seed="Ganador S2" />
                           </div>
                         </div>
                       ) : (
                         <div className="flex flex-col items-center gap-8 w-full max-w-xl">
                            {/* PENTAGONAL O FINAL DIRECTA */}
                            <span className="text-xs font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-4 py-1 rounded-full border border-amber-200 shadow-sm"><Crown size={12} className="inline mr-1 mb-0.5"/> Gran Final</span>
                            <div className="flex items-center gap-4 bg-white p-6 rounded-3xl border-2 border-amber-300 shadow-md w-full justify-between">
                              <TeamSlot team={finalMatches[0]?.home_team} seed="Finalista 1" />
                              <span className="font-black text-slate-300 italic">VS</span>
                              <TeamSlot team={finalMatches[0]?.away_team} seed="Finalista 2" />
                            </div>

                            {/* TERCER PUESTO (Si lo hay) */}
                            {finalMatches[1] && (
                              <>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm mt-4"><Medal size={12} className="inline mr-1 mb-0.5"/> 3er Puesto</span>
                                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm w-full justify-between opacity-90">
                                  <TeamSlot team={finalMatches[1]?.home_team} seed="Tercero" />
                                  <span className="font-black text-slate-300 italic text-xs">VS</span>
                                  <TeamSlot team={finalMatches[1]?.away_team} seed="Cuarto" />
                                </div>
                              </>
                            )}
                         </div>
                       )}
                    </div>
                  )}

                </>
              )}
            </div>

          </div>
        )}
      </div>

      {/* FOOTER: CARRUSEL INFINITO DE ESCUDOS */}
      <div className="bg-white border-t border-slate-200 py-6 mt-auto overflow-hidden absolute bottom-0 w-full z-10 shadow-inner">
        <div className="animate-marquee flex gap-12 items-center pl-12">
          {/* Renderizamos la lista dos veces para que el ciclo sea infinito perfecto */}
          {[...schools, ...schools].map((school, i) => (
            <div key={i} className="flex items-center gap-3 shrink-0 transition-transform hover:scale-105">
              <img src={school.logo_url} alt={school.name} className="w-12 h-12 object-contain drop-shadow-sm" />
              <span className="font-black text-slate-800 uppercase tracking-tighter text-sm whitespace-nowrap">{school.name}</span>
            </div>
          ))}
          {schools.length === 0 && <span className="text-slate-400 font-bold uppercase tracking-widest text-xs w-screen text-center">Cargando Instituciones...</span>}
        </div>
      </div>
      
    </main>
  );
}

export default function PublicPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-blue-600 font-black tracking-widest uppercase animate-pulse">Cargando Portal...</p>
      </div>
    }>
      <PublicPortalContent />
    </Suspense>
  );
}