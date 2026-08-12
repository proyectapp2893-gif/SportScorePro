'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../../supabase';
import { ArrowLeft, ArrowRight, Trophy, GitMerge, School, Crown, Medal, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
// MEJORA: Añadimos useParams para capturar la identidad del inquilino (Tenant Isolation)
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '../../../lib/sports/rules';

function FaseFinalContent() {
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
  const [loading, setLoading] = useState(false);

  // MEJORA: Carga de datos filtrada por Cliente (Tenant Isolation)
  useEffect(() => {
    async function initializeHub() {
      if (!slug) return;
      
      const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
      
      if (client) {
        setClientId(client.id);
        const { data: catData } = await supabase
          .from('categories')
          .select('*, tournaments!inner(client_id, name), sports(name)')
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
      const sportRules = getSportRules(selectedSport);
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

      setTeams(Object.values(teamStats).sort((a: any, b: any) => compareTeamsForStandings(a, b, sportRules)));
    }
    setLoading(false);
  }

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol') || name.includes('soccer')) return <FaFutbol className="text-slate-600 group-hover:text-blue-600 transition-colors" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-slate-600 group-hover:text-blue-600 transition-colors" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-slate-600 group-hover:text-blue-600 transition-colors" size={size} />;
    if (name.includes('softball') || name.includes('béisbol') || name.includes('baseball')) return <FaBaseballBall className="text-slate-600 group-hover:text-blue-600 transition-colors" size={size} />;
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

  // Componente de Tarjeta de Equipo para el Bracket (Diseño Premium Moderno)
  const TeamSlot = ({ team, seed }: { team?: any, seed: string }) => (
    <div className="flex items-center gap-4 bg-white border border-slate-200 p-3.5 rounded-2xl w-60 shadow-sm relative z-10 group hover:border-blue-400 hover:shadow-md transition-all">
      <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center p-1.5 shrink-0 shadow-sm group-hover:bg-blue-50 transition-colors">
        {team?.schools?.logo_url ? <img src={team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={20} className="text-slate-300"/>}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className={`font-black uppercase tracking-tight text-[11px] truncate ${team ? 'text-slate-900' : 'text-slate-400'}`}>
          {team ? team.name : 'Por Definir'}
        </span>
        <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-1">{seed}</span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 relative">
        
        {/* CABECERA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 sm:mb-12 gap-5 sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Fase <span className="text-blue-600">Final</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Diagrama de eliminatorias</p>
          </div>
          
          {selectedCategory ? (
            <button onClick={() => { setSelectedCategory(null); router.replace(`/${slug}/admin/fase-final`, { scroll: false }); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
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

        {/* VISTA 1: SELECCIÓN DE DEPORTE */}
        {!selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-5 sm:p-8 bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left text-slate-300">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2 break-words">{sport as string}</h3>
                   <div className="mt-auto flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors w-full justify-between pt-4">
                     Ver Ramificaciones <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
               {uniqueSports.length === 0 && <div className="col-span-full p-8 sm:p-12 text-center text-slate-400 font-black text-xs uppercase tracking-[0.3em] bg-white rounded-[2rem] sm:rounded-[2.5rem] border border-slate-200 shadow-sm">No hay deportes habilitados.</div>}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIÓN DE CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => {
                     setSelectedCategory(c.id);
                     router.replace(`/${slug}/admin/fase-final?cat=${c.id}`, { scroll: false });
                   }}
                   className="group flex flex-col p-5 sm:p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2 break-words">{c.name}</h3>
                   <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 w-full justify-between">
                     Abrir Cuadro Final <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: EL BRACKET (RAMIFICACIÓN) */}
        {selectedCategory && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            
            {/* HEADER INFO (Diseño Premium) */}
            <div className="bg-white border border-slate-200 p-5 sm:p-8 rounded-[2rem] shadow-sm mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 sm:gap-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
              
              <div className="relative z-10 flex items-center gap-4 sm:gap-6 min-w-0">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                  {getSportIcon(activeSportName, 32)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter break-words">{activeCategoryName}</h2>
                  <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">Torneo: {activeTournamentName}</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4 bg-white border border-slate-200 rounded-[2.5rem] shadow-sm min-h-[500px]">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em]">Mapeando posiciones...</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-[2rem] md:rounded-[2.5rem] p-5 sm:p-8 md:p-16 overflow-x-auto shadow-sm flex flex-col items-center justify-center min-h-[520px] md:min-h-[600px] relative">
                
                {/* Patrón de fondo sutil para dar el look "documento técnico" */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-70 z-0"></div>
                
                {/* === BRACKET: SEMIFINALES Y FINAL === */}
                {(isVolleyball || isCuadrangular) && (
                  <div className="flex items-center justify-center gap-8 md:gap-32 min-w-[680px] md:min-w-[800px] relative z-10 w-full">
                    
                    {/* COLUMNA 1: SEMIFINALES */}
                    <div className="flex flex-col gap-24 relative z-10">
                      
                      <div className="flex flex-col gap-4 relative">
                        <span className="text-[10px] font-black text-slate-500 bg-white px-3 py-1 uppercase tracking-widest text-center absolute -top-5 left-1/2 -translate-x-1/2 border border-slate-200 rounded-full z-20 shadow-sm">
                          Llave A
                        </span>
                        <TeamSlot team={isVolleyball ? semi1A : semiC1_1} seed={isVolleyball ? "1° Grupo A" : "1° Clasificado"} />
                        <TeamSlot team={isVolleyball ? semi1B : semiC1_4} seed={isVolleyball ? "2° Grupo B" : "4° Clasificado"} />
                        
                        {/* Líneas Conectoras (Gris Plata) */}
                        <div className="hidden md:block absolute -right-6 md:-right-16 top-1/2 w-6 md:w-16 border-t-2 border-slate-300"></div>
                        <div className="hidden md:block absolute -right-6 md:-right-16 top-1/2 h-[calc(50%+2rem)] border-r-2 border-slate-300 rounded-tr-xl"></div>
                      </div>
                      
                      <div className="flex flex-col gap-4 relative">
                        <span className="text-[10px] font-black text-slate-500 bg-white px-3 py-1 uppercase tracking-widest text-center absolute -top-5 left-1/2 -translate-x-1/2 border border-slate-200 rounded-full z-20 shadow-sm">
                          Llave B
                        </span>
                        <TeamSlot team={isVolleyball ? semi2B : semiC2_2} seed={isVolleyball ? "1° Grupo B" : "2° Clasificado"} />
                        <TeamSlot team={isVolleyball ? semi2A : semiC2_3} seed={isVolleyball ? "2° Grupo A" : "3° Clasificado"} />
                        
                        {/* Líneas Conectoras (Gris Plata) */}
                        <div className="hidden md:block absolute -right-6 md:-right-16 bottom-1/2 w-6 md:w-16 border-b-2 border-slate-300"></div>
                        <div className="hidden md:block absolute -right-6 md:-right-16 bottom-1/2 h-[calc(50%+2rem)] border-r-2 border-slate-300 rounded-br-xl"></div>
                      </div>

                    </div>

                    {/* LÍNEA CENTRAL CONECTORA Y TROFEO */}
                    <div className="hidden md:block w-16 border-t-2 border-slate-300 relative">
                       <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-white border border-slate-200 rounded-full p-3 z-20 shadow-md">
                          <Trophy size={20} className="text-slate-400" />
                       </div>
                    </div>

                    {/* COLUMNA 2: LA GRAN FINAL */}
                    <div className="flex flex-col justify-center relative z-10">
                      <div className="flex flex-col gap-4 p-8 bg-white rounded-[2.5rem] border-2 border-blue-100 relative shadow-xl">
                        <span className="text-[11px] font-black text-red-600 bg-white px-5 py-1.5 rounded-full uppercase tracking-widest text-center absolute -top-5 left-1/2 -translate-x-1/2 border border-red-200 flex items-center justify-center gap-2 shadow-sm whitespace-nowrap">
                          <Crown size={14} className="text-red-500 fill-red-500"/> Final Oficial
                        </span>
                        <TeamSlot seed="Ganador Llave A" />
                        <TeamSlot seed="Ganador Llave B" />
                      </div>
                    </div>

                  </div>
                )}

                {/* === BRACKET: FINAL DIRECTA === */}
                {isPentagonal && (
                  <div className="flex flex-col items-center justify-center gap-16 w-full max-w-3xl relative z-10">
                    
                    {/* GRAN FINAL */}
                    <div className="flex flex-col items-center w-full relative">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-5 sm:p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border-2 border-blue-200 w-full shadow-2xl relative">
                         <span className="text-[11px] font-black text-red-600 bg-white px-6 py-2 rounded-full uppercase tracking-widest text-center absolute -top-5 left-1/2 -translate-x-1/2 border border-red-200 flex items-center justify-center gap-2 shadow-sm whitespace-nowrap z-20">
                           <Crown size={16} className="text-red-500 fill-red-500"/> Campeonato
                         </span>
                         
                         <TeamSlot team={final1} seed="1° Clasificado" />
                         <div className="w-16 h-16 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-black text-slate-400 italic z-20 shrink-0 shadow-inner">VS</div>
                         <TeamSlot team={final2} seed="2° Clasificado" />
                      </div>
                    </div>

                    {/* TERCER PUESTO */}
                    <div className="flex flex-col items-center w-full relative">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 w-full shadow-md relative opacity-95">
                         <span className="text-[9px] font-black text-slate-500 bg-white px-4 py-1.5 rounded-full uppercase tracking-widest text-center absolute -top-4 left-1/2 -translate-x-1/2 border border-slate-200 flex items-center justify-center gap-2 shadow-sm whitespace-nowrap z-20">
                           <Medal size={14} className="text-slate-400"/> 3er Puesto
                         </span>
                         
                         <TeamSlot team={third1} seed="3° Clasificado" />
                         <div className="w-12 h-12 bg-white rounded-full border border-slate-200 flex items-center justify-center font-black text-slate-400 text-xs italic z-20 shrink-0 shadow-sm">VS</div>
                         <TeamSlot team={third2} seed="4° Clasificado" />
                      </div>
                    </div>

                  </div>
                )}

                {/* ESTADO DE DESARROLLO (Si no se cumplen condiciones) */}
                {!isVolleyball && !isCuadrangular && !isPentagonal && teams.length > 0 && (
                  <div className="flex flex-col items-center justify-center text-center relative z-10 py-12">
                    <div className="bg-slate-50 p-6 rounded-full mb-6 border border-slate-200 shadow-inner">
                      <GitMerge size={48} className="text-slate-400" />
                    </div>
                    <p className="text-slate-900 text-lg font-black uppercase tracking-widest">Bracket en Construcción</p>
                    <p className="text-slate-500 text-xs font-bold mt-3 max-w-md uppercase tracking-widest leading-relaxed">
                      La categoría requiere cumplir el reglamento de clasificados ({teams.length} registrados). El esquema se dibujará automáticamente al finalizar la fase regular.
                    </p>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 w-full p-6 bg-white/80 backdrop-blur-sm border-t border-slate-100 flex items-center justify-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] z-20">
                   <ShieldCheck size={12} className="text-blue-600/50" /> Renderizado Dinámico • {slug}
                </div>

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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-black tracking-[0.3em] uppercase text-xs">Accediendo a Estructura de Llaves...</p>
      </div>
    }>
      <FaseFinalContent />
    </Suspense>
  );
}
