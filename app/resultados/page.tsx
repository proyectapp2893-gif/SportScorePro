'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useParams } from 'next/navigation';
import { Trophy, CalendarDays, Activity, Medal, ShieldCheck, School, ArrowLeft, BarChart3, Star, Shield } from 'lucide-react';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';

// --- ESTILOS PARA EL CARRUSEL INFINITO ---
const marqueeStyles = `
  @keyframes marquee {
    0% { transform: translateX(0%); }
    100% { transform: translateX(-100%); }
  }
  .animate-marquee {
    display: inline-block;
    white-space: nowrap;
    animation: marquee 30s linear infinite;
  }
  .marquee-container:hover .animate-marquee {
    animation-play-state: paused;
  }
`;

export default function ResultadosPublicos() {
  const params = useParams();
  const slug = params?.slug as string;

  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState<any>(null);
  
  // NAVEGACIÓN
  const [view, setView] = useState<'WELCOME' | 'TOURNAMENT'>('WELCOME');
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [activeTournament, setActiveTournament] = useState<any>(null);
  
  const [allLogos, setAllLogos] = useState<string[]>([]); // Para el carrusel flotante

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [matches, setMatches] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [scorers, setScorers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'FIXTURE' | 'POSICIONES' | 'ESTADISTICAS'>('FIXTURE');

  useEffect(() => {
    if (slug) loadInitialData();
  }, [slug]);

  async function loadInitialData() {
    setLoading(true);
    // 1. Cargar Cliente
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, name, slug, logo_url, is_active')
      .eq('slug', slug)
      .single();
    
    if (clientData) {
      setClientInfo(clientData);

      // 2. Cargar todos los torneos del cliente
      const { data: trns } = await supabase
        .from('tournaments')
        .select('*')
        .eq('client_id', clientData.id)
        .order('is_active', { ascending: false }) // Los activos primero
        .order('created_at', { ascending: false });

      if (trns) setTournaments(trns);

      // 3. Extraer logos únicos de colegios para el carrusel
      const { data: schoolsData } = await supabase
        .from('schools')
        .select('logo_url')
        .eq('client_id', clientData.id)
        .not('logo_url', 'is', null);
      
      if (schoolsData) {
        const uniqueLogos = Array.from(new Set(schoolsData.map(s => s.logo_url)));
        setAllLogos(uniqueLogos as string[]);
      }
    }
    setLoading(false);
  }

  // AL SELECCIONAR UN TORNEO, CARGAMOS SUS CATEGORÍAS
  const selectTournament = async (torneo: any) => {
    setActiveTournament(torneo);
    setView('TOURNAMENT');
    setLoading(true);

    const { data: catsData } = await supabase
      .from('categories')
      .select('*, sports(name, scoring_system)')
      .eq('tournament_id', torneo.id)
      .order('name');

    if (catsData && catsData.length > 0) {
      setCategories(catsData);
      setSelectedCategory(catsData[0].id); // Autoseleccionar la primera
    } else {
      setCategories([]);
      setSelectedCategory(null);
    }
    setLoading(false);
  };

  // AL CAMBIAR CATEGORÍA, CARGAR PARTIDOS Y TABLAS
  useEffect(() => {
    if (selectedCategory) {
      fetchCategoryData(selectedCategory);
    }
  }, [selectedCategory]);

  async function fetchCategoryData(categoryId: string) {
    // Buscar Partidos
    const { data: matchesData } = await supabase
      .from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time, current_period,
        home_team:teams!home_team_id(name, schools(logo_url)),
        away_team:teams!away_team_id(name, schools(logo_url)),
        matchdays!inner(round_number, scheduled_date)
      `)
      .eq('matchdays.category_id', categoryId)
      .order('status', { ascending: false }) 
      .order('matchdays(scheduled_date)', { ascending: true });

    if (matchesData) setMatches(matchesData);

    // Buscar Equipos para Posiciones
    const { data: teamsData } = await supabase
      .from('teams')
      .select('*, schools(logo_url)')
      .eq('category_id', categoryId);

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

    // Buscar Estadísticas de Jugadores (Goleadores/Anotadores)
    const { data: playersData } = await supabase
      .from('players')
      .select(`id, name, shirt_number, teams!inner(id, name, category_id, schools(logo_url)), match_events(event_type)`)
      .eq('teams.category_id', categoryId);
    
    if (playersData) {
      const calculatedScorers = playersData.map(p => {
        let total = 0;
        p.match_events.forEach((ev: any) => {
          if (ev.event_type === 'GOAL' || ev.event_type === 'BASKET_1') total += 1;
          else if (ev.event_type === 'BASKET_2') total += 2;
          else if (ev.event_type === 'BASKET_3') total += 3;
        });
        return { ...p, totalPoints: total };
      }).filter(p => p.totalPoints > 0);

      setScorers(calculatedScorers.sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 10)); // Top 10
    }
  }

  const getSportIcon = (sportName: string, size: number = 20) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol')) return <FaFutbol className="text-emerald-500" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-500" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-yellow-500" size={size} />;
    if (name.includes('softbol') || name.includes('béisbol')) return <FaBaseballBall className="text-red-500" size={size} />;
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

  // ============================================================================
  // VISTA 1: LOBBY DE BIENVENIDA (SELECCIÓN DE TORNEO Y CARRUSEL)
  // ============================================================================
  if (view === 'WELCOME') {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
        <style dangerouslySetInnerHTML={{ __html: marqueeStyles }} />
        
        {/* FONDO DEPORTIVO OSCURO */}
        <div className="absolute inset-0 bg-[url('/bg-pattern.png')] opacity-10 bg-cover z-0 pointer-events-none"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none z-0"></div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 w-full max-w-5xl mx-auto">
          
          <div className="text-center mb-16 animate-in slide-in-from-bottom-8 duration-700">
            {clientInfo?.logo_url ? (
              <img src={clientInfo.logo_url} alt="Logo Cliente" className="h-28 md:h-36 mx-auto mb-8 object-contain bg-white/10 p-4 rounded-[2rem] backdrop-blur-sm border border-white/10 shadow-2xl" />
            ) : (
              <Trophy size={80} className="text-blue-500 mx-auto mb-6" />
            )}
            <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4 leading-none">
              Portal de Resultados
            </h1>
            <p className="text-blue-400 font-bold uppercase tracking-[0.3em] text-xs md:text-sm flex items-center justify-center gap-2">
              <ShieldCheck size={16} /> Competiciones Oficiales
            </p>
          </div>

          {/* LISTA DE TORNEOS */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 z-10 animate-in slide-in-from-bottom-12 duration-1000">
            {tournaments.map(torneo => (
              <button 
                key={torneo.id} 
                onClick={() => selectTournament(torneo)}
                className="group bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 p-8 rounded-[2.5rem] text-left transition-all hover:scale-[1.02] flex items-center gap-6"
              >
                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center p-2 shrink-0 shadow-lg group-hover:shadow-blue-500/20 transition-all">
                  {torneo.logo_url ? <img src={torneo.logo_url} className="w-full h-full object-contain" /> : <Trophy className="text-slate-300" size={32}/>}
                </div>
                <div>
                  <h3 className="text-white font-black text-2xl uppercase tracking-tighter leading-tight mb-2 group-hover:text-blue-300 transition-colors">{torneo.name}</h3>
                  <span className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${torneo.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                    {torneo.is_active ? 'En Curso' : 'Finalizado'}
                  </span>
                </div>
              </button>
            ))}
            {tournaments.length === 0 && (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-white/20 rounded-[3rem]">
                 <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No hay eventos registrados</p>
              </div>
            )}
          </div>
        </div>

        {/* CARRUSEL INFINITO DE ESCUDOS FLOTANTES */}
        {allLogos.length > 0 && (
          <div className="w-full overflow-hidden border-t border-white/5 bg-white/5 backdrop-blur-sm py-6 relative z-20 marquee-container">
             <div className="absolute top-0 left-0 w-24 h-full bg-gradient-to-r from-slate-950 to-transparent z-10"></div>
             <div className="absolute top-0 right-0 w-24 h-full bg-gradient-to-l from-slate-950 to-transparent z-10"></div>
             
             <div className="whitespace-nowrap inline-block animate-marquee">
                {/* Duplicamos el array varias veces para asegurar el loop infinito suave */}
                {[...allLogos, ...allLogos, ...allLogos, ...allLogos].map((logo, idx) => (
                  <div key={idx} className="inline-block mx-8 w-16 h-16 bg-white/10 rounded-2xl p-2 backdrop-blur-md border border-white/10 hover:bg-white/20 transition-colors cursor-pointer grayscale hover:grayscale-0">
                    <img src={logo} className="w-full h-full object-contain" alt="Escudo" />
                  </div>
                ))}
             </div>
          </div>
        )}
      </main>
    );
  }

  // ============================================================================
  // VISTA 2: DASHBOARD DEL TORNEO SELECCIONADO
  // ============================================================================
  const activeCategoryData = categories.find(c => c.id === selectedCategory);
  const activeSportName = activeCategoryData?.sports?.name?.toUpperCase() || '';
  const isVolleyball = activeSportName.includes('VOLEIBOL');
  const isBasketball = activeSportName.includes('BALONCESTO');
  const isSoccer = activeSportName.includes('FÚTBOL');

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 animate-in fade-in duration-500">
      
      {/* HEADER PÚBLICO DEL TORNEO */}
      <header className="bg-slate-950 text-white pt-8 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('/bg-pattern.png')] opacity-10 bg-cover"></div>
        <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-slate-50 to-transparent z-10"></div>
        
        <div className="max-w-6xl mx-auto relative z-20">
          <button onClick={() => setView('WELCOME')} className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm w-fit">
            <ArrowLeft size={16} /> Volver al Inicio
          </button>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex items-center gap-5">
              {activeTournament.logo_url ? (
                <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-2xl p-2 shadow-xl shrink-0"><img src={activeTournament.logo_url} className="w-full h-full object-contain" /></div>
              ) : (
                <div className="w-20 h-20 md:w-24 md:h-24 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shrink-0"><Trophy size={40} className="text-white" /></div>
              )}
              <div>
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2 drop-shadow-lg leading-none">{activeTournament.name}</h1>
                <p className="text-blue-400 font-bold uppercase tracking-[0.2em] text-xs flex items-center gap-2">
                  <ShieldCheck size={14} /> Resultados Oficiales
                </p>
              </div>
            </div>
            
            {clientInfo?.logo_url && <img src={clientInfo.logo_url} className="h-10 md:h-12 w-auto object-contain opacity-50 hidden md:block" />}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 -mt-8 relative z-30">
        
        {/* SELECTOR DE DEPORTE Y CATEGORÍAS */}
        <div className="bg-white p-2 rounded-[2rem] shadow-lg border border-slate-200 flex overflow-x-auto scrollbar-hide mb-8">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-shrink-0 flex items-center gap-3 px-6 py-4 rounded-[1.5rem] transition-all
                ${selectedCategory === cat.id ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}
              `}
            >
              <div className={`${selectedCategory === cat.id ? 'text-blue-400' : 'text-slate-400'}`}>
                 {getSportIcon(cat.sports?.name, 20)}
              </div>
              <div className="text-left leading-tight">
                 <span className="block font-black uppercase text-[11px] tracking-widest">{cat.sports?.name}</span>
                 <span className={`block font-bold uppercase text-[9px] tracking-widest ${selectedCategory === cat.id ? 'text-blue-300' : 'text-slate-400'}`}>{cat.name}</span>
              </div>
            </button>
          ))}
          {categories.length === 0 && <p className="p-4 text-xs font-bold text-slate-400">No hay categorías configuradas.</p>}
        </div>

        {/* TABS DE NAVEGACIÓN */}
        {selectedCategory && (
          <div className="flex justify-center mb-8">
            <div className="bg-slate-200/50 p-1.5 rounded-2xl flex flex-wrap gap-1 shadow-inner max-w-full justify-center">
              <button onClick={() => setActiveTab('FIXTURE')} className={`px-6 md:px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition-all flex items-center gap-2 ${activeTab === 'FIXTURE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <CalendarDays size={16} /> Partidos
              </button>
              <button onClick={() => setActiveTab('POSICIONES')} className={`px-6 md:px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition-all flex items-center gap-2 ${activeTab === 'POSICIONES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Medal size={16} /> Tabla General
              </button>
              {!isVolleyball && (
                <button onClick={() => setActiveTab('ESTADISTICAS')} className={`px-6 md:px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition-all flex items-center gap-2 ${activeTab === 'ESTADISTICAS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <BarChart3 size={16} /> Estadísticas
                </button>
              )}
            </div>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL */}
        
        {/* PESTAÑA: PARTIDOS */}
        {activeTab === 'FIXTURE' && selectedCategory && (
          <div className="space-y-4">
            {matches.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-200">
                <Trophy size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Aún no hay partidos programados</p>
              </div>
            ) : (
              matches.map((match) => (
                <div key={match.id} className={`bg-white rounded-[2rem] p-6 border shadow-sm transition-all
                  ${match.status === 'LIVE' ? 'border-red-200 shadow-red-100 ring-2 ring-red-50' : 'border-slate-200 hover:border-blue-200'}
                `}>
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {match.matchdays?.round_number >= 100 ? 'FASE FINAL' : `JORNADA ${match.matchdays?.round_number}`}
                    </span>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2
                      ${match.status === 'LIVE' ? 'bg-red-50 text-red-600' : match.status === 'FINISHED' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}
                    `}>
                      {match.status === 'LIVE' && <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>}
                      {match.status === 'LIVE' ? 'En Vivo' : match.status === 'FINISHED' ? 'Finalizado' : 'Próximamente'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 flex flex-col items-center gap-3">
                      <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-2xl p-2 border border-slate-100">
                        {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="w-full h-full text-slate-300 p-4"/>}
                      </div>
                      <span className="font-black text-xs md:text-sm text-center uppercase leading-tight">{match.home_team?.name}</span>
                    </div>

                    <div className="shrink-0 flex flex-col items-center">
                      {(match.status === 'LIVE' || match.status === 'FINISHED') ? (
                        <div className="flex items-center gap-3">
                          <span className={`text-4xl md:text-5xl font-black tabular-nums ${match.status === 'FINISHED' && (isVolleyball ? match.home_sets < match.away_sets : match.home_score < match.away_score) ? 'text-slate-400' : 'text-slate-900'}`}>{isVolleyball ? match.home_sets : match.home_score}</span>
                          <span className="text-xl text-slate-300 font-black">-</span>
                          <span className={`text-4xl md:text-5xl font-black tabular-nums ${match.status === 'FINISHED' && (isVolleyball ? match.away_sets < match.home_sets : match.away_score < match.home_score) ? 'text-slate-400' : 'text-slate-900'}`}>{isVolleyball ? match.away_sets : match.away_score}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                          <span className="text-xs font-black text-slate-500 uppercase">{match.matchdays?.scheduled_date ? new Date(match.matchdays.scheduled_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : 'TBD'}</span>
                          <span className="text-sm font-black text-slate-900">{match.scheduled_time ? match.scheduled_time.substring(0, 5) : '--:--'}</span>
                        </div>
                      )}
                      
                      {match.status === 'LIVE' && (
                         <span className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-2 bg-red-50 px-3 py-1 rounded-full">{match.current_period}</span>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col items-center gap-3">
                      <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-2xl p-2 border border-slate-100">
                        {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="w-full h-full text-slate-300 p-4"/>}
                      </div>
                      <span className="font-black text-xs md:text-sm text-center uppercase leading-tight">{match.away_team?.name}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* PESTAÑA: POSICIONES GENERALES */}
        {activeTab === 'POSICIONES' && selectedCategory && (
          <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm animate-in fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-black">
                    <th className="p-4 pl-6 border-b border-slate-200 w-16">#</th>
                    <th className="p-4 border-b border-slate-200 min-w-[200px]">Equipo</th>
                    <th className="p-4 border-b border-slate-200 text-center" title="Partidos Jugados">PJ</th>
                    <th className="p-4 border-b border-slate-200 text-center" title="Partidos Ganados">G</th>
                    {(!isBasketball && !isVolleyball) && <th className="p-4 border-b border-slate-200 text-center" title="Partidos Empatados">E</th>}
                    <th className="p-4 border-b border-slate-200 text-center" title="Partidos Perdidos">P</th>
                    
                    {/* COLUMNAS A FAVOR Y EN CONTRA SEGÚN DEPORTE */}
                    <th className="p-4 border-b border-slate-200 text-center" title={isBasketball ? "Puntos a Favor" : isVolleyball ? "Sets a Favor" : "Goles/Carreras a Favor"}>
                      {isBasketball ? 'PF' : isVolleyball ? 'SF' : isSoccer ? 'GF' : 'CF'}
                    </th>
                    <th className="p-4 border-b border-slate-200 text-center" title={isBasketball ? "Puntos en Contra" : isVolleyball ? "Sets en Contra" : "Goles/Carreras en Contra"}>
                      {isBasketball ? 'PC' : isVolleyball ? 'SC' : isSoccer ? 'GC' : 'CC'}
                    </th>
                    <th className="p-4 border-b border-slate-200 text-center" title="Diferencia">
                      DIF
                    </th>
                    
                    <th className="p-4 pr-6 border-b border-slate-200 text-center text-blue-600">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teams.map((team, index) => {
                    const diff = (team.goals_for || 0) - (team.goals_against || 0);
                    return (
                      <tr key={team.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 pl-6 text-slate-400 font-black">{index + 1}</td>
                        <td className="p-4 font-black uppercase flex items-center gap-3">
                          {team.schools?.logo_url ? <img src={team.schools.logo_url} className="w-8 h-8 object-contain" /> : <School size={16} className="text-slate-300"/>}
                          {team.name}
                        </td>
                        <td className="p-4 text-center font-bold text-slate-500">{team.played || 0}</td>
                        <td className="p-4 text-center font-bold text-slate-500">{team.won || 0}</td>
                        {(!isBasketball && !isVolleyball) && <td className="p-4 text-center font-bold text-slate-500">{team.drawn || 0}</td>}
                        <td className="p-4 text-center font-bold text-slate-500">{team.lost || 0}</td>
                        
                        <td className="p-4 text-center font-bold text-slate-500">{team.goals_for || 0}</td>
                        <td className="p-4 text-center font-bold text-slate-500">{team.goals_against || 0}</td>
                        <td className={`p-4 text-center font-black ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                        
                        <td className="p-4 pr-6 text-center font-black text-lg text-blue-600">{team.points || 0}</td>
                      </tr>
                    );
                  })}
                  {teams.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                        Aún no hay equipos en la clasificación
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PESTAÑA: ESTADÍSTICAS INDIVIDUALES Y COLECTIVAS */}
        {activeTab === 'ESTADISTICAS' && selectedCategory && !isVolleyball && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            
            {/* TOP ANOTADORES */}
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm">
               <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Star size={24}/></div>
                 <div>
                   <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                     {isBasketball ? 'Máximos Anotadores' : 'Tabla de Goleadores'}
                   </h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Top 10 Oficial</p>
                 </div>
               </div>
               
               <div className="space-y-3">
                 {scorers.length === 0 ? (
                   <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-widest py-10 border border-dashed rounded-2xl">Sin registros</p>
                 ) : (
                   scorers.map((scorer, i) => (
                     <div key={scorer.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                       <div className="flex items-center gap-4">
                         <span className={`font-black text-lg w-6 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-300'}`}>{i+1}</span>
                         <div className="flex flex-col">
                           <span className="font-black text-slate-800 uppercase text-sm">{scorer.name}</span>
                           <span className="font-bold text-[9px] text-slate-500 uppercase flex items-center gap-1">
                             {scorer.teams?.schools?.logo_url && <img src={scorer.teams.schools.logo_url} className="w-3 h-3 object-contain"/>}
                             {scorer.teams?.name}
                           </span>
                         </div>
                       </div>
                       <span className="font-black text-2xl text-blue-600">{scorer.totalPoints}</span>
                     </div>
                   ))
                 )}
               </div>
            </div>

            {/* MEJOR DEFENSA / VALLA MENOS VENCIDA */}
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm h-fit">
               <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Shield size={24}/></div>
                 <div>
                   <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                     {isSoccer ? 'Valla Menos Vencida' : 'Mejor Defensa'}
                   </h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Equipos con menos en contra</p>
                 </div>
               </div>

               <div className="space-y-3">
                 {teams.filter(t => t.played > 0).length === 0 ? (
                   <p className="text-center text-slate-400 text-xs font-bold uppercase tracking-widest py-10 border border-dashed rounded-2xl">Torneo sin iniciar</p>
                 ) : (
                   [...teams].filter(t => t.played > 0).sort((a,b) => a.goals_against - b.goals_against).slice(0, 5).map((team, i) => (
                     <div key={team.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <div className="flex items-center gap-4">
                         <span className="font-black text-slate-300 text-lg w-6 text-center">{i+1}</span>
                         <div className="flex items-center gap-2">
                           {team.schools?.logo_url ? <img src={team.schools.logo_url} className="w-8 h-8 object-contain"/> : <School size={16} className="text-slate-300"/>}
                           <span className="font-black text-slate-800 uppercase text-sm">{team.name}</span>
                         </div>
                       </div>
                       <div className="flex flex-col items-end">
                         <span className="font-black text-xl text-emerald-600">{team.goals_against}</span>
                         <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">En Contra</span>
                       </div>
                     </div>
                   ))
                 )}
               </div>
            </div>

          </div>
        )}

      </div>
    </main>
  );
}
