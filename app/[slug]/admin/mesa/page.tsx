'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../../supabase'; 
import { ArrowLeft, ArrowRight, CheckCircle2, Play, School, CalendarDays, Trophy, ShieldCheck, MonitorPlay, ExternalLink, House } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';
import { getSportKind, isBaseballSport, isBasketballSport, isSoccerSport, isVolleyballSport } from '../../../lib/sports/rules';

// 1. IMPORTAMOS NUESTROS COMPONENTES ESPECIALIZADOS
import MesaFutbol from './components/MesaFutbol';
import MesaBaloncesto from './components/MesaBaloncesto';
import MesaVoleibol from './components/MesaVoleibol';
import MesaSoftbol from './components/MesaSoftbol';

function MesaControlContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  
  const slug = params?.slug as string;
  const urlCategory = searchParams.get('cat'); 

  const [categories, setCategories] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(urlCategory || null);
  
  const [pendingMatches, setPendingMatches] = useState<any[]>([]);
  const [activeRound, setActiveRound] = useState<number>(1);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeMatch, setActiveMatch] = useState<any | null>(null);

  // 2. LÓGICA DE CARGA MULTICUENTA (HUB)
  useEffect(() => {
    async function loadTenantCategories() {
      if (!slug) return;
      const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
      
      if (client) {
        setClientId(client.id);
        const { data } = await supabase
          .from('categories')
          .select('*, sports(name, scoring_system), tournaments!inner(client_id, name, logo_url, fair_play_enabled, fp_starting_points, fp_yellow_deduction, fp_red_deduction, fp_no_show_deduction, fine_yellow_amount, fine_red_amount)')
          .eq('tournaments.client_id', client.id)
          .order('name');
        if (data) setCategories(data);
      }
    }
    loadTenantCategories();
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
      fetchPendingMatches();
    } else {
      setPendingMatches([]);
      setAvailableRounds([]);
    }
  }, [selectedCategory]);

  async function fetchPendingMatches() {
    setLoading(true);
    const { data, error } = await supabase.from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time, current_period,
        is_timer_running, timer_start_time, timer_accumulated_seconds, match_duration_seconds, match_phase,
        home_team:teams!home_team_id(id, name, schools(logo_url)),
        away_team:teams!away_team_id(id, name, schools(logo_url)),
        matchdays!inner(category_id, round_number, scheduled_date, categories(name, match_duration, sports(name, scoring_system), tournaments(name, logo_url, fair_play_enabled, fp_starting_points, fp_yellow_deduction, fp_red_deduction, fp_no_show_deduction, fine_yellow_amount, fine_red_amount, schedule_dates)))
      `)
      .eq('matchdays.category_id', selectedCategory)
      .in('status', ['SCHEDULED', 'LIVE']) 
      .order('scheduled_time', { ascending: true });
    
    if (data) {
      setPendingMatches(data);
      const rounds = Array.from(new Set<number>(data.map((m: any) => Number(m.matchdays.round_number))))
        .sort((a: number, b: number) => a - b);
      
      setAvailableRounds(rounds);
      if (rounds.length > 0 && !rounds.includes(activeRound)) setActiveRound(rounds[0]);
    }
    setLoading(false);
  }

  const getSportIcon = (sportName: string, size: number = 24) => {
    const sportKind = getSportKind(sportName);
    if (sportKind === 'soccer') return <FaFutbol className="text-emerald-500" size={size} />;
    if (sportKind === 'basketball') return <FaBasketballBall className="text-orange-500" size={size} />;
    if (sportKind === 'volleyball') return <FaVolleyballBall className="text-yellow-500" size={size} />;
    if (sportKind === 'baseball') return <FaBaseballBall className="text-red-500" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  // ============================================================================
  // RENDERIZADO CONDICIONAL DE CONSOLAS
  // ============================================================================
  if (activeMatch) {
    const currentCategoryData = categories.find(c => c.id === selectedCategory);
    const activeSportName = currentCategoryData?.sports?.name || '';

    // INYECCIÓN DINÁMICA SEGÚN DEPORTE
    if (isSoccerSport(activeSportName)) {
      return <MesaFutbol match={activeMatch} categoryData={currentCategoryData} slug={slug} onClose={() => setActiveMatch(null)} onMatchUpdate={fetchPendingMatches} />;
    }
    if (isBasketballSport(activeSportName)) {
      return <MesaBaloncesto match={activeMatch} categoryData={currentCategoryData} slug={slug} onClose={() => setActiveMatch(null)} onMatchUpdate={fetchPendingMatches} />;
    }
    if (isVolleyballSport(activeSportName)) {
      return <MesaVoleibol match={activeMatch} categoryData={currentCategoryData} slug={slug} onClose={() => setActiveMatch(null)} onMatchUpdate={fetchPendingMatches} />;
    }
    if (isBaseballSport(activeSportName)) {
      return <MesaSoftbol match={activeMatch} categoryData={currentCategoryData} slug={slug} onClose={() => setActiveMatch(null)} onMatchUpdate={fetchPendingMatches} />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
         <p className="text-slate-500 font-black tracking-widest uppercase">Consola de {activeSportName} no disponible o en construcción.</p>
      </div>
    );
  }

  const uniqueSports: string[] = Array.from(new Set(categories.map((c: any) => c.sports?.name).filter(Boolean))) as string[];

  // SOLUCIÓN AL ERROR: Definimos la variable matchesToShow
  const matchesToShow = pendingMatches.filter(m => m.matchdays?.round_number === activeRound);

  // ============================================================================
  // VISTAS DE NAVEGACIÓN (LOBBY DE SELECCIÓN)
  // ============================================================================
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 sm:mb-12 gap-5 sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Mesa de <span className="text-blue-600">Control</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Transmisión de Resultados Oficiales</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button onClick={() => window.open('/tv', '_blank')} className="w-full sm:w-auto p-4 bg-slate-900 border border-slate-900 rounded-2xl text-white hover:bg-blue-600 hover:border-blue-600 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest group shadow-sm">
              <MonitorPlay size={16} /> Abrir TV <ExternalLink size={14} />
            </button>
            {selectedCategory ? (
              <button onClick={() => { setSelectedCategory(''); router.replace(`/${slug}/admin/mesa`, { scroll: false }); }} className="w-full sm:w-auto p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest group shadow-sm">
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Categorías
              </button>
            ) : selectedSport ? (
              <button onClick={() => setSelectedSport(null)} className="w-full sm:w-auto p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest group shadow-sm">
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Deportes
              </button>
            ) : (
              <Link href={`/${slug}/admin`} className="w-full sm:w-auto p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest group shadow-sm">
                <House size={16} /> Panel principal
              </Link>
            )}
            {(selectedCategory || selectedSport) && <Link href={`/${slug}/admin`} className="w-full sm:w-auto p-4 bg-slate-900 border border-slate-900 rounded-2xl text-white hover:bg-blue-600 hover:border-blue-600 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm"><House size={16} /> Panel principal</Link>}
          </div>
        </div>

        {!selectedCategory && !selectedSport && (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in">
             {uniqueSports.map((sport: string) => (
               <button key={sport} onClick={() => setSelectedSport(sport)} className="group flex flex-col p-5 sm:p-8 bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm h-full relative overflow-hidden">
                 <div className="mb-6 group-hover:scale-110 transition-transform origin-left">{getSportIcon(sport, 48)}</div>
                 <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2 break-words">{sport}</h3>
                 <div className="mt-auto flex items-center text-[10px] font-black text-slate-400 group-hover:text-blue-600 transition-colors w-full justify-between pt-4 border-t border-slate-100">Abrir Categorías <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /></div>
               </button>
             ))}
           </div>
        )}

        {!selectedCategory && selectedSport && (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-8">
             {categories.filter(c => c.sports?.name === selectedSport).map(c => (
               <button key={c.id} onClick={() => { setSelectedCategory(c.id); router.replace(`/${slug}/admin/mesa?cat=${c.id}`, { scroll: false }); }} className="group flex flex-col p-5 sm:p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm">
                 <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2 break-words">{c.name}</h3>
                 <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                 <div className="mt-8 flex items-center text-[10px] font-black text-slate-500 group-hover:text-blue-600 w-full justify-between border-t border-slate-100 pt-4">Abrir Consola <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /></div>
               </button>
             ))}
           </div>
        )}

        {selectedCategory && (
          <div className="bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-8">
            <div className="flex overflow-x-auto bg-slate-50 px-4 pt-4 border-b border-slate-100 gap-2 scrollbar-hide">
              {availableRounds.map((round) => (
                <button key={round} onClick={() => setActiveRound(round)} className={`px-8 py-4 rounded-t-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeRound === round ? 'bg-white text-blue-600 border-t-2 border-x border-slate-100 z-10 -mb-[1px] shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-white hover:text-slate-600 border-t border-transparent'}`}>
                  {round === 100 || round >= 201 ? 'FASE 3 · FINALES' : round >= 101 ? `FASE 2 · JORNADA ${round - 100}` : `FASE 1 · JORNADA ${round}`}
                </button>
              ))}
              {availableRounds.length === 0 && !loading && (
                <div className="px-8 py-4 text-slate-500 font-bold text-[10px] uppercase tracking-widest">Sin partidos pendientes</div>
              )}
            </div>
            
            <div className="divide-y divide-slate-100">
              {loading ? (
                <p className="text-center text-slate-500 font-bold p-8 sm:p-12 uppercase tracking-widest text-xs">Sincronizando partidos...</p>
              ) : matchesToShow.length === 0 ? (
                <div className="p-10 sm:p-16 text-center">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4 opacity-30" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No hay datos en esta jornada</p>
                </div>
              ) : (
                matchesToShow.map((match: any) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => setActiveMatch(match)}
                    className="relative w-full p-5 sm:p-8 hover:bg-slate-50/80 focus:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-8 group text-left cursor-pointer overflow-hidden hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] touch-manipulation"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-50 via-white to-blue-50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                    <div className="absolute left-0 top-0 h-full w-1.5 bg-blue-600 scale-y-0 group-hover:scale-y-100 group-focus-visible:scale-y-100 transition-transform duration-300 origin-center pointer-events-none"></div>
                    <div className="absolute inset-y-0 right-0 w-24 bg-blue-500/10 opacity-0 group-hover:opacity-100 group-active:opacity-70 transition-opacity duration-300 pointer-events-none"></div>

                    <div className="relative z-10 flex-1 w-full">
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest inline-block shadow-sm
                          ${match.status === 'LIVE' ? 'bg-red-50 text-red-600 border border-red-100 animate-pulse' : 
                            match.status === 'FINISHED' ? 'bg-slate-100 text-slate-400 border border-slate-200' :
                            'bg-slate-50 text-blue-600 border border-blue-200'}
                        `}>
                          {match.status === 'LIVE' ? '● En Vivo' : match.status === 'FINISHED' ? 'Cerrado' : 'Programado'}
                        </span>
                        
                        <span className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <CalendarDays size={12} className="text-slate-400"/> 
                          {match.matchdays?.scheduled_date ? new Date(match.matchdays.scheduled_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : ''} 
                          {' '}|{' '} {match.scheduled_time ? match.scheduled_time.substring(0, 5) : 'H:MM'}
                        </span>
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6 w-full">
                        <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
                           <span className={`text-sm sm:text-lg font-black uppercase tracking-tight text-right break-words ${match.status === 'FINISHED' ? 'text-slate-500' : 'text-slate-900'}`}>{match.home_team?.name}</span>
                           <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-sm">
                             {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className={`w-full h-full object-contain ${match.status === 'FINISHED' ? 'grayscale opacity-50' : ''}`} /> : <School size={20} className="text-slate-300"/>}
                           </div>
                        </div>
                        
                        {match.status === 'FINISHED' ? (
                           <div className="px-4 py-2 sm:px-6 bg-slate-100 rounded-xl border border-slate-200 font-black text-slate-400 text-sm shadow-inner shrink-0 whitespace-nowrap">
                             {match.home_score} - {match.away_score}
                           </div>
                        ) : (
                           <div className="px-3 py-2 sm:px-4 bg-slate-50 rounded-xl border border-slate-200 font-black text-slate-300 text-xs shadow-inner shrink-0">VS</div>
                        )}
                        
                        <div className="flex items-center gap-3 flex-1 justify-start min-w-0">
                           <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-sm">
                             {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className={`w-full h-full object-contain ${match.status === 'FINISHED' ? 'grayscale opacity-50' : ''}`} /> : <School size={20} className="text-slate-300"/>}
                           </div>
                           <span className={`text-sm sm:text-lg font-black uppercase tracking-tight text-left break-words ${match.status === 'FINISHED' ? 'text-slate-500' : 'text-slate-900'}`}>{match.away_team?.name}</span>
                        </div>
                      </div>
                    </div>

                    <div className={`relative z-10 w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 group-active:scale-95 ${
                      match.status === 'LIVE'
                        ? 'bg-red-50 text-red-600 border-red-100'
                        : match.status === 'FINISHED'
                          ? 'bg-slate-100 text-slate-300 border-slate-200'
                          : 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                    }`}>
                      {match.status === 'LIVE' && <span className="absolute inset-0 rounded-2xl bg-red-400/20 animate-ping"></span>}
                      <span className="relative transition-transform duration-300 group-hover:translate-x-0.5">
                        {match.status === 'FINISHED' ? <CheckCircle2 size={18} /> : match.status === 'LIVE' ? <Play size={18} /> : <ArrowRight size={18} />}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
               <ShieldCheck size={12} className="opacity-50" /> Canal Protegido • {slug}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function MesaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-blue-600 font-black tracking-widest uppercase animate-pulse text-xs">Sincronizando entorno de arbitraje...</p></div>}>
      <MesaControlContent />
    </Suspense>
  );
}
