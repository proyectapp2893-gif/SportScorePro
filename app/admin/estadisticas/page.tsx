'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../supabase';
import { ArrowLeft, ArrowRight, Trophy, BarChart3, Medal, Crown, School, Activity, Shield, Flame } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';

function EstadisticasContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlCategory = searchParams.get('cat'); 

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [teams, setTeams] = useState<any[]>([]);
  const [topScorers, setTopScorers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [bestDefense, setBestDefense] = useState<any>(null);
  const [bestOffense, setBestOffense] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'STANDINGS' | 'SCORERS'>('STANDINGS');

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('categories').select('*, sports(name), tournaments(name)').order('name');
      if (data) setCategories(data);
    }
    loadCategories();
  }, []);

  useEffect(() => {
    if (urlCategory && categories.length > 0) {
      const cat = categories.find(c => c.id === urlCategory);
      if (cat) {
        setSelectedCategory(urlCategory);
        setSelectedSport(cat.sports?.name);
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
    
    // Identificar el deporte actual para aplicar reglas específicas
    const activeCat = categories.find(c => c.id === selectedCategory);
    const sportName = activeCat?.sports?.name?.toUpperCase() || '';
    
    const isBasketball = sportName.includes('BALONCESTO') || sportName.includes('BASKET');
    const isVolleyball = sportName.includes('VOLEIBOL') || sportName.includes('VOLEY');
    const isBaseball = sportName.includes('BÉISBOL') || sportName.includes('BEISBOL') || sportName.includes('SOFTBALL') || sportName.includes('BASEBALL');
    const isSoccer = !isBasketball && !isVolleyball && !isBaseball; // Por defecto
    
    const { data: teamsData } = await supabase.from('teams')
      .select('*, schools(logo_url)')
      .eq('category_id', selectedCategory);
    
    if (teamsData) {
      // MOTOR DE ORDENAMIENTO CONSCIENTE DEL DEPORTE
      const sortedTeams = teamsData.sort((a, b) => {
        const aFor = a.goals_for || 0;
        const aAgainst = a.goals_against || 0;
        const bFor = b.goals_for || 0;
        const bAgainst = b.goals_against || 0;

        if (isBasketball || isVolleyball) {
          // FIBA / VOLEIBOL: Puntos -> Average/Ratio -> Anotados
          if (b.points !== a.points) return (b.points || 0) - (a.points || 0);
          const ratioA = aAgainst === 0 ? aFor : aFor / aAgainst;
          const ratioB = bAgainst === 0 ? bFor : bFor / bAgainst;
          if (ratioB !== ratioA) return ratioB - ratioA;
          return bFor - aFor;
        } 
        
        if (isBaseball) {
          // BÉISBOL/SOFTBALL: Win/Loss PCT -> Carreras a Favor
          const pctA = a.played ? (a.won || 0) / a.played : 0;
          const pctB = b.played ? (b.won || 0) / b.played : 0;
          if (pctB !== pctA) return pctB - pctA;
          return bFor - aFor; 
        }

        // FÚTBOL (Estándar FIFA): Puntos -> Diferencia de Goles -> Goles a Favor
        if (b.points !== a.points) return (b.points || 0) - (a.points || 0);
        const diffB = bFor - bAgainst;
        const diffA = aFor - aAgainst;
        if (diffB !== diffA) return diffB - diffA;
        return bFor - aFor;
      });
      
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
        teams!inner(id, name, category_id, schools(logo_url)),
        match_events(event_type)
      `)
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

      const sortedScorers = scorers.sort((a, b) => b.totalScore - a.totalScore).slice(0, 15);
      setTopScorers(sortedScorers);
    }

    setLoading(false);
  }

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol') || name.includes('soccer')) return <FaFutbol className="text-emerald-600" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-600" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-blue-600" size={size} />;
    if (name.includes('softball') || name.includes('béisbol') || name.includes('baseball')) return <FaBaseballBall className="text-red-600" size={size} />;
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
  
  // CONFIGURACIÓN DINÁMICA DE ENCABEZADOS Y DEFINICIONES
  let colFor = 'GF', colAgainst = 'GC', colDiff = 'DIF';
  let titleFor = 'Goles a Favor', titleAgainst = 'Goles en Contra', titleDiff = 'Diferencia de Goles';

  if (isBasketball) { 
    colFor = 'PF'; colAgainst = 'PC'; colDiff = 'AVG'; 
    titleFor = 'Puntos a Favor'; titleAgainst = 'Puntos en Contra'; titleDiff = 'Average (Anotados / Recibidos)';
  }
  if (isVolleyball) { 
    colFor = 'SF'; colAgainst = 'SC'; colDiff = 'RATIO'; 
    titleFor = 'Sets a Favor'; titleAgainst = 'Sets en Contra'; titleDiff = 'Set Ratio (A Favor / En Contra)';
  }
  if (isBaseball) { 
    colFor = 'CF'; colAgainst = 'CC'; colDiff = 'PCT'; 
    titleFor = 'Carreras a Favor'; titleAgainst = 'Carreras en Contra'; titleDiff = 'Porcentaje de Victorias (Win/Loss PCT)';
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-4 py-12">
        
        {/* CABECERA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Centro de <span className="text-fuchsia-600">Estadísticas</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">CSJB Championship - Clasificaciones Oficiales</p>
          </div>
          
          {selectedCategory ? (
            <button onClick={() => { setSelectedCategory(null); router.replace('/admin/estadisticas', { scroll: false }); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Volver a Categorías
            </button>
          ) : selectedSport ? (
            <button onClick={() => setSelectedSport(null)} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Volver a Deportes
            </button>
          ) : (
            <Link href="/admin" className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Volver al Búnker
            </Link>
          )}
        </div>

        {/* VISTA 1: SELECCIONAR DEPORTE */}
        {!selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-6">
               <BarChart3 className="text-fuchsia-600" size={24}/> Selecciona el Deporte
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:border-fuchsia-300 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left text-fuchsia-600">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{sport as string}</h3>
                   <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 mt-4 group-hover:text-fuchsia-600 transition-colors w-full justify-between">
                     Ver Tablas <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </p>
                 </button>
               ))}
               {uniqueSports.length === 0 && <p className="text-slate-400 font-bold text-xs uppercase tracking-widest col-span-3">No hay deportes registrados aún.</p>}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIONAR CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-4 mb-6">
               {getSportIcon(selectedSport, 28)} Tablas de {selectedSport}
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => {
                     setSelectedCategory(c.id);
                     router.replace(`/admin/estadisticas?cat=${c.id}`, { scroll: false });
                   }}
                   className="group flex flex-col p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-fuchsia-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2">{c.name}</h3>
                   <p className="text-fuchsia-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-fuchsia-600 w-full justify-between">
                     Abrir Clasificación <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: PANTALLA DE ESTADÍSTICAS */}
        {selectedCategory && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            
            {/* HEADER INFO */}
            <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 text-slate-100 rotate-12 scale-150 pointer-events-none">
                <Trophy size={200} />
              </div>
              
              <div className="relative z-10 flex items-center gap-6">
                <div className="p-4 bg-fuchsia-50 rounded-2xl text-fuchsia-600 border border-fuchsia-100 shadow-inner">
                  {getSportIcon(activeSportName, 40)}
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{activeCategoryName}</h2>
                  <p className="text-fuchsia-600 font-bold text-xs uppercase tracking-widest mt-1">{activeTournamentName}</p>
                </div>
              </div>
            </div>

            {/* HIGHLIGHTS DEPORTIVOS */}
            {((isSoccer && bestDefense) || (isBasketball && bestOffense) || (isBaseball && bestOffense)) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                
                {isSoccer && bestDefense && (
                  <div className="bg-white border border-emerald-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-emerald-400 hover:shadow-lg transition-all">
                    <div className="absolute -right-6 -top-6 text-emerald-50 rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
                      <Shield size={120} />
                    </div>
                    <div className="flex items-center gap-4 z-10">
                      <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-2 shrink-0 shadow-sm">
                        {bestDefense.schools?.logo_url ? <img src={bestDefense.schools.logo_url} className="w-full h-full object-contain" /> : <School size={24} className="text-slate-300"/>}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{bestDefense.name}</h3>
                        <p className="text-emerald-600 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1 mt-1"><Shield size={12}/> Arquero Menos Vencido</p>
                      </div>
                    </div>
                    <div className="text-right z-10">
                      <span className="text-4xl font-black text-emerald-600 drop-shadow-sm">{bestDefense.goals_against || 0}</span>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">Goles en contra</p>
                    </div>
                  </div>
                )}

                {(isBasketball || isBaseball) && bestOffense && (
                  <div className="bg-white border border-orange-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-orange-400 hover:shadow-lg transition-all">
                    <div className="absolute -right-6 -top-6 text-orange-50 rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
                      <Flame size={120} />
                    </div>
                    <div className="flex items-center gap-4 z-10">
                      <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-2 shrink-0 shadow-sm">
                        {bestOffense.schools?.logo_url ? <img src={bestOffense.schools.logo_url} className="w-full h-full object-contain" /> : <School size={24} className="text-slate-300"/>}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{bestOffense.name}</h3>
                        <p className="text-orange-600 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1 mt-1">
                          <Flame size={12}/> {isBaseball ? 'Novena Más Anotadora' : 'Equipo Más Anotador'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right z-10">
                      <span className="text-4xl font-black text-orange-600 drop-shadow-sm">{bestOffense.goals_for || 0}</span>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">{isBaseball ? 'Carreras a favor' : 'Puntos a favor'}</p>
                    </div>
                  </div>
                )}
                
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
              
              {/* TABS NAVEGACIÓN */}
              <div className="flex bg-slate-50 px-4 pt-4 border-b border-slate-200 gap-2">
                <button
                  onClick={() => setActiveTab('STANDINGS')}
                  className={`px-8 py-4 rounded-t-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2
                    ${activeTab === 'STANDINGS' 
                      ? 'bg-white text-fuchsia-600 border-t-2 border-x border-slate-200 shadow-sm z-10 -mb-[1px]' 
                      : 'bg-slate-100 text-slate-500 hover:bg-white hover:text-slate-700 border-t border-transparent'}
                  `}
                >
                  <Trophy size={14}/> Tabla de Posiciones
                </button>
                
                {(!isVolleyball && !isBaseball) && (
                  <button
                    onClick={() => setActiveTab('SCORERS')}
                    className={`px-8 py-4 rounded-t-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2
                      ${activeTab === 'SCORERS' 
                        ? 'bg-white text-fuchsia-600 border-t-2 border-x border-slate-200 shadow-sm z-10 -mb-[1px]' 
                        : 'bg-slate-100 text-slate-500 hover:bg-white hover:text-slate-700 border-t border-transparent'}
                    `}
                  >
                    <Activity size={14}/> {isBasketball ? 'Top Anotadores' : 'Top Goleadores'}
                  </button>
                )}
              </div>

              <div className="p-0">
                {loading ? (
                  <p className="text-center text-slate-400 font-bold p-16 uppercase tracking-widest">Calculando Estadísticas...</p>
                ) : (
                  <>
                    {/* TABLA DE POSICIONES */}
                    {activeTab === 'STANDINGS' && (
                      <div className="overflow-x-auto flex flex-col">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-200">
                              <th className="p-6 w-16 text-center">Pos</th>
                              <th className="p-6">Club / Colegio</th>
                              <th className="p-6 text-center" title="Partidos Jugados">PJ</th>
                              <th className="p-6 text-center" title="Partidos Ganados">PG</th>
                              {/* SOLO MOSTRAR EMPATES SI ES FÚTBOL */}
                              {isSoccer && <th className="p-6 text-center" title="Partidos Empatados">PE</th>}
                              <th className="p-6 text-center" title="Partidos Perdidos">PP</th>
                              <th className="p-6 text-center" title={titleFor}>{colFor}</th>
                              <th className="p-6 text-center" title={titleAgainst}>{colAgainst}</th>
                              <th className="p-6 text-center" title={titleDiff}>{colDiff}</th>
                              <th className="p-6 text-center text-fuchsia-600" title="Puntos de Clasificación">PTS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {teams.length === 0 ? (
                              <tr><td colSpan={10} className="p-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">No hay equipos inscritos.</td></tr>
                            ) : (
                              teams.map((team, index) => {
                                const isFirst = index === 0;
                                const isTop4 = index < 4;
                                
                                // CÁLCULO DINÁMICO DE LA COLUMNA "DIF"
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
                                  diffDisplay = pct.replace(/^0+/, ''); // Formato béisbol ej: .500
                                  isPositive = (team.won || 0) > (team.lost || 0);
                                  isNegative = (team.lost || 0) > (team.won || 0);
                                } else {
                                  const diff = (team.goals_for || 0) - (team.goals_against || 0);
                                  diffDisplay = diff > 0 ? `+${diff}` : diff;
                                  isPositive = diff > 0;
                                  isNegative = diff < 0;
                                }

                                return (
                                  <tr key={team.id} className={`hover:bg-slate-50/80 transition-colors ${isFirst ? 'bg-amber-50/30' : ''}`}>
                                    {/* POSICIÓN */}
                                    <td className="p-6 text-center">
                                      <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center font-black text-sm
                                        ${isFirst ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-900 shadow-md' 
                                        : isTop4 ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}
                                      `}>
                                        {index + 1}
                                      </div>
                                    </td>
                                    
                                    {/* EQUIPO */}
                                    <td className="p-6">
                                      <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-full border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-sm">
                                          {team.schools?.logo_url ? <img src={team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={16} className="text-slate-300"/>}
                                        </div>
                                        <span className={`font-black uppercase tracking-tight text-sm ${isFirst ? 'text-amber-600' : 'text-slate-900'}`}>
                                          {team.name}
                                        </span>
                                      </div>
                                    </td>

                                    {/* ESTADÍSTICAS BÁSICAS */}
                                    <td className="p-6 text-center font-bold text-slate-700">{team.played || 0}</td>
                                    <td className="p-6 text-center font-bold text-slate-700">{team.won || 0}</td>
                                    {/* SOLO MOSTRAR DATOS DE EMPATE SI ES FÚTBOL */}
                                    {isSoccer && <td className="p-6 text-center font-bold text-slate-700">{team.drawn || 0}</td>}
                                    <td className="p-6 text-center font-bold text-slate-700">{team.lost || 0}</td>
                                    <td className="p-6 text-center font-bold text-slate-700">{team.goals_for || 0}</td>
                                    <td className="p-6 text-center font-bold text-slate-700">{team.goals_against || 0}</td>
                                    
                                    {/* DIFERENCIA/RATIO/PCT CON COLOR */}
                                    <td className="p-6 text-center font-black">
                                      <span className={isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-slate-500'}>
                                        {diffDisplay}
                                      </span>
                                    </td>

                                    {/* PUNTOS GLOBALES */}
                                    <td className="p-6 text-center font-black text-xl text-fuchsia-600">{team.points || 0}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                        
                        {/* LEYENDA / GLOSARIO DE INICIALES */}
                        <div className="bg-slate-100/50 p-4 border-t border-slate-200 flex flex-wrap gap-x-6 gap-y-2 justify-center text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-auto">
                          <span title="Partidos Jugados"><strong>PJ:</strong> Partidos Jugados</span>
                          <span title="Partidos Ganados"><strong>PG:</strong> Partidos Ganados</span>
                          {isSoccer && <span title="Partidos Empatados"><strong>PE:</strong> Partidos Empatados</span>}
                          <span title="Partidos Perdidos"><strong>PP:</strong> Partidos Perdidos</span>
                          <span title={titleFor}><strong>{colFor}:</strong> {titleFor}</span>
                          <span title={titleAgainst}><strong>{colAgainst}:</strong> {titleAgainst}</span>
                          <span title={titleDiff}><strong>{colDiff}:</strong> {titleDiff}</span>
                          <span title="Puntos de Clasificación" className="text-fuchsia-600"><strong>PTS:</strong> Puntos</span>
                        </div>

                      </div>
                    )}

                    {/* TABLA DE GOLEADORES / ANOTADORES */}
                    {activeTab === 'SCORERS' && (
                      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50/50">
                        {topScorers.length === 0 ? (
                          <div className="col-span-full py-16 text-center">
                            <Medal size={48} className="mx-auto text-slate-300 mb-4" />
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Aún no hay registros de anotaciones.</p>
                            <p className="text-slate-400 font-bold text-[10px] mt-2">Anota datos en la Mesa de Control para ver el ranking.</p>
                          </div>
                        ) : (
                          topScorers.map((player, index) => {
                            const isMVP = index === 0;
                            return (
                              <div key={player.id} className={`p-6 rounded-[2rem] border relative overflow-hidden flex items-center justify-between
                                ${isMVP ? 'bg-white border-amber-300 shadow-lg shadow-amber-100' : 'bg-white border-slate-200 shadow-sm'}
                              `}>
                                
                                {/* RANGO E ICONO MVP */}
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                  <span className="text-8xl font-black italic text-slate-900">{index + 1}</span>
                                </div>

                                <div className="flex items-center gap-4 z-10">
                                  <div className="relative">
                                    <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center p-2 bg-white overflow-hidden
                                      ${isMVP ? 'border-amber-400 shadow-md' : 'border-slate-200'}
                                    `}>
                                      {player.teams?.schools?.logo_url ? <img src={player.teams.schools.logo_url} className="w-full h-full object-contain" /> : <School size={24} className="text-slate-300"/>}
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
                                    <h4 className={`font-black uppercase tracking-tight text-sm leading-tight max-w-[120px] ${isMVP ? 'text-amber-600' : 'text-slate-900'}`}>{player.name}</h4>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1 truncate max-w-[120px]">{player.teams?.name}</p>
                                  </div>
                                </div>

                                <div className="text-right z-10 flex flex-col items-end justify-center">
                                  <span className={`text-4xl font-black leading-none ${isMVP ? 'text-amber-500 drop-shadow-sm' : 'text-slate-700'}`}>{player.totalScore}</span>
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{isBasketball ? 'PUNTOS' : 'GOLES'}</span>
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-fuchsia-600 font-black tracking-widest uppercase animate-pulse">Cargando Centro de Estadísticas...</p>
      </div>
    }>
      <EstadisticasContent />
    </Suspense>
  );
}