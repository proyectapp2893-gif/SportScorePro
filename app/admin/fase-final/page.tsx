'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../supabase';
import { ArrowLeft, ArrowRight, Trophy, GitMerge, School, Crown, Medal } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';

function FaseFinalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlCategory = searchParams.get('cat'); 

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      loadTeamsAndCalculatePositions();
    } else {
      setTeams([]);
    }
  }, [selectedCategory]);

  // CARGAR EQUIPOS Y ORDENARLOS COMO EN LA TABLA DE POSICIONES
  async function loadTeamsAndCalculatePositions() {
    setLoading(true);
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
  const activeCategory = categories.find(c => c.id === selectedCategory);
  const activeCategoryName = activeCategory?.name || '';
  const activeTournamentName = activeCategory?.tournaments?.name || '';

  const uniqueSports = Array.from(new Set(categories.map(c => c.sports?.name).filter(Boolean)));

  // =======================================================================
  // LÓGICA INTELIGENTE DE LLAVES (DEPENDIENDO DEL REGLAMENTO)
  // =======================================================================
  const isVolleyball = activeSportName.includes('VOLEIBOL');
  const isCuadrangular = teams.length === 4;
  const isPentagonal = teams.length === 5 && !isVolleyball;

  // Lógica Voleibol (2 Grupos)
  const groupA = teams.filter(t => t.group_name === 'A');
  const groupB = teams.filter(t => t.group_name === 'B');
  const semi1A = groupA[0]; const semi1B = groupB[1]; // 1°A vs 2°B
  const semi2B = groupB[0]; const semi2A = groupA[1]; // 1°B vs 2°A

  // Lógica Cuadrangular (4 Equipos)
  const semiC1_1 = teams[0]; const semiC1_4 = teams[3]; // 1° vs 4°
  const semiC2_2 = teams[1]; const semiC2_3 = teams[2]; // 2° vs 3°

  // Lógica Pentagonal (5 Equipos - Directo a Finales)
  const final1 = teams[0]; const final2 = teams[1]; // 1° vs 2°
  const third1 = teams[2]; const third2 = teams[3]; // 3° vs 4°

  // Componente de Tarjeta de Equipo para el Bracket (Light Mode)
  const TeamSlot = ({ team, seed }: { team?: any, seed: string }) => (
    <div className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl w-52 shadow-sm relative z-10 group hover:border-indigo-400 hover:shadow-md transition-all">
      <div className="w-10 h-10 bg-slate-50 rounded-full border border-slate-100 flex items-center justify-center p-1 shrink-0 shadow-sm group-hover:bg-indigo-50 transition-colors">
        {team?.schools?.logo_url ? <img src={team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={16} className="text-slate-300"/>}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className={`font-black uppercase tracking-tight text-xs truncate ${team ? 'text-slate-900' : 'text-slate-400'}`}>
          {team ? team.name : 'Por Definir'}
        </span>
        <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest mt-0.5">{seed}</span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 py-12 relative">
        
        {/* CABECERA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Fase <span className="text-indigo-600">Final</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">CSJB Championship - Ramificación de Llaves</p>
          </div>
          
          {selectedCategory ? (
            <button onClick={() => { setSelectedCategory(null); router.replace('/admin/fase-final', { scroll: false }); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
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

        {/* VISTA 1: SELECCIÓN DE DEPORTE */}
        {!selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-6">
               <GitMerge className="text-indigo-600" size={24}/> Selecciona el Deporte
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:border-indigo-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left text-indigo-600">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{sport as string}</h3>
                   <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 mt-4 group-hover:text-indigo-600 transition-colors w-full justify-between">
                     Ver Llaves <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </p>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIÓN DE CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-4 mb-6">
               {getSportIcon(selectedSport, 28)} Categorías de {selectedSport}
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => {
                     setSelectedCategory(c.id);
                     router.replace(`/admin/fase-final?cat=${c.id}`, { scroll: false });
                   }}
                   className="group flex flex-col p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-indigo-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2">{c.name}</h3>
                   <p className="text-indigo-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-indigo-600 w-full justify-between">
                     Abrir Bracket <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: EL BRACKET (RAMIFICACIÓN) */}
        {selectedCategory && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            
            {/* HEADER INFO */}
            <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 text-slate-100 rotate-12 scale-150 pointer-events-none">
                <GitMerge size={200} />
              </div>
              <div className="relative z-10 flex items-center gap-6">
                <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 border border-indigo-100 shadow-inner">
                  {getSportIcon(activeSportName, 40)}
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{activeCategoryName}</h2>
                  <p className="text-indigo-600 font-bold text-xs uppercase tracking-widest mt-1">Cuadro de Fase Final</p>
                </div>
              </div>
            </div>

            {loading ? (
              <p className="text-center text-slate-400 font-bold p-16 uppercase tracking-widest">Calculando posiciones...</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-[2rem] p-8 md:p-16 overflow-x-auto shadow-sm flex justify-center min-h-[500px] relative">
                
                {/* Patrón de fondo sutil para dar el look "documento oficial" */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-50 z-0"></div>
                
                {/* === BRACKET: SEMIFINALES Y FINAL (VOLEIBOL / FÚTBOL FEMENINO) === */}
                {(isVolleyball || isCuadrangular) && (
                  <div className="flex items-center justify-center gap-12 md:gap-24 min-w-[800px] relative z-10">
                    
                    {/* COLUMNA 1: SEMIFINALES */}
                    <div className="flex flex-col gap-16 relative z-10">
                      
                      <div className="flex flex-col gap-3 relative">
                        <span className="text-[10px] font-black text-slate-400 bg-white px-2 uppercase tracking-widest text-center absolute -top-4 left-1/2 -translate-x-1/2 border border-slate-100 rounded-md z-20">
                          Semifinal 1
                        </span>
                        <TeamSlot team={isVolleyball ? semi1A : semiC1_1} seed={isVolleyball ? "1° Grupo A" : "1° Clasificado"} />
                        <TeamSlot team={isVolleyball ? semi1B : semiC1_4} seed={isVolleyball ? "2° Grupo B" : "4° Clasificado"} />
                        
                        {/* Líneas Conectoras */}
                        <div className="hidden md:block absolute -right-6 md:-right-12 top-1/2 w-6 md:w-12 border-t-2 border-slate-300"></div>
                        <div className="hidden md:block absolute -right-6 md:-right-12 top-1/2 h-[calc(50%+1.5rem)] border-r-2 border-slate-300 rounded-tr-xl"></div>
                      </div>
                      
                      <div className="flex flex-col gap-3 relative">
                        <span className="text-[10px] font-black text-slate-400 bg-white px-2 uppercase tracking-widest text-center absolute -top-4 left-1/2 -translate-x-1/2 border border-slate-100 rounded-md z-20">
                          Semifinal 2
                        </span>
                        <TeamSlot team={isVolleyball ? semi2B : semiC2_2} seed={isVolleyball ? "1° Grupo B" : "2° Clasificado"} />
                        <TeamSlot team={isVolleyball ? semi2A : semiC2_3} seed={isVolleyball ? "2° Grupo A" : "3° Clasificado"} />
                        
                        {/* Líneas Conectoras */}
                        <div className="hidden md:block absolute -right-6 md:-right-12 bottom-1/2 w-6 md:w-12 border-b-2 border-slate-300"></div>
                        <div className="hidden md:block absolute -right-6 md:-right-12 bottom-1/2 h-[calc(50%+1.5rem)] border-r-2 border-slate-300 rounded-br-xl"></div>
                      </div>

                    </div>

                    {/* LÍNEA CENTRAL CONECTORA Y TROFEO */}
                    <div className="hidden md:block w-12 border-t-2 border-indigo-400 relative">
                       <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-white border-2 border-indigo-400 rounded-full p-2.5 z-20 shadow-md">
                          <Trophy size={18} className="text-indigo-600" />
                       </div>
                    </div>

                    {/* COLUMNA 2: LA GRAN FINAL */}
                    <div className="flex flex-col justify-center relative z-10">
                      <div className="flex flex-col gap-3 p-8 bg-amber-50/50 rounded-[2.5rem] border border-amber-200 relative shadow-lg">
                        <span className="text-[12px] font-black text-amber-600 bg-white px-4 py-1 rounded-full uppercase tracking-widest text-center absolute -top-4 left-1/2 -translate-x-1/2 border border-amber-200 flex items-center justify-center gap-2 shadow-sm whitespace-nowrap">
                          <Crown size={14} className="text-amber-500 fill-amber-500"/> Gran Final
                        </span>
                        <TeamSlot seed="Ganador Semi 1" />
                        <TeamSlot seed="Ganador Semi 2" />
                      </div>
                    </div>

                  </div>
                )}

                {/* === BRACKET: FINAL DIRECTA (PENTAGONAL - BALONCESTO / FÚTBOL MASC) === */}
                {isPentagonal && (
                  <div className="flex flex-col items-center justify-center gap-12 w-full max-w-2xl relative z-10">
                    
                    {/* GRAN FINAL */}
                    <div className="flex flex-col items-center w-full">
                      <span className="text-sm font-black text-amber-600 uppercase tracking-[0.3em] flex items-center justify-center gap-2 mb-4 bg-amber-50 px-6 py-2 rounded-full border border-amber-200 shadow-sm">
                        <Crown size={20} className="fill-amber-500 text-amber-500"/> Gran Final por el Campeonato
                      </span>
                      <div className="flex flex-col md:flex-row items-center gap-6 bg-white p-8 rounded-[2.5rem] border-2 border-amber-300 w-full shadow-xl relative">
                         <TeamSlot team={final1} seed="1° de la Tabla General" />
                         <div className="w-12 h-12 bg-white rounded-full border border-slate-200 flex items-center justify-center font-black text-slate-400 italic z-20 shrink-0 shadow-sm">VS</div>
                         <TeamSlot team={final2} seed="2° de la Tabla General" />
                      </div>
                    </div>

                    {/* TERCER PUESTO */}
                    <div className="flex flex-col items-center w-full mt-4">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center justify-center gap-2 mb-4 bg-white px-4 py-1.5 rounded-full border border-slate-200">
                        <Medal size={14}/> Partido por el 3er Puesto
                      </span>
                      <div className="flex flex-col md:flex-row items-center gap-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-200 w-full shadow-sm">
                         <TeamSlot team={third1} seed="3° de la Tabla General" />
                         <div className="w-8 h-8 bg-white rounded-full border border-slate-200 flex items-center justify-center font-black text-slate-400 text-xs italic z-20 shrink-0 shadow-sm">VS</div>
                         <TeamSlot team={third2} seed="4° de la Tabla General" />
                      </div>
                    </div>

                  </div>
                )}

                {/* Si no hay suficientes equipos para armar llaves */}
                {!isVolleyball && !isCuadrangular && !isPentagonal && teams.length > 0 && (
                  <div className="flex flex-col items-center justify-center text-center relative z-10">
                    <div className="bg-slate-100 p-6 rounded-full mb-6">
                      <GitMerge size={64} className="text-slate-400" />
                    </div>
                    <p className="text-slate-900 text-xl font-black uppercase tracking-widest">Formato en Desarrollo</p>
                    <p className="text-slate-500 text-sm font-bold mt-3 max-w-md">Esta categoría tiene {teams.length} equipos inscritos actualmente. El bracket se armará y dibujará automáticamente cuando se completen los requisitos del reglamento.</p>
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function FaseFinalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-indigo-600 font-black tracking-widest uppercase animate-pulse">Cargando Cuadro del Torneo...</p>
      </div>
    }>
      <FaseFinalContent />
    </Suspense>
  );
}