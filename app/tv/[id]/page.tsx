'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../supabase';
import { ArrowLeft, Trophy, Flame, Activity } from 'lucide-react';
import Link from 'next/link';

export default function TvScoreboardPage() {
  const params = useParams();
  const matchId = params.id as string;
  const [matchData, setMatchData] = useState<any>(null);

  // Estados para los Gráficos de TV (Lower Thirds)
  const [activeOverlay, setActiveOverlay] = useState<'NONE' | 'SCORE' | 'STANDINGS'>('NONE');
  const [scoreNotification, setScoreNotification] = useState<any>(null);
  const [liveStandings, setLiveStandings] = useState<any[]>([]);

  // Referencias para controlar el flujo sin re-renderizados infinitos
  const matchDataRef = useRef<any>(null);
  const prevScores = useRef({ home: 0, away: 0, homeSets: 0, awaySets: 0 });
  const isInitialLoad = useRef(true);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mantenemos la referencia actualizada para usarla dentro de los websockets
  useEffect(() => {
    matchDataRef.current = matchData;
  }, [matchData]);

  useEffect(() => {
    fetchInitialData();

    // SUSCRIPCIÓN EN TIEMPO REAL: Escuchamos 2 cosas (Marcador y Eventos de Jugador)
    const channel = supabase.channel(`tv-match-${matchId}`)
      // 1. Escuchar cambios en el marcador general (matches)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => {
        setMatchData((prev: any) => ({ ...prev, ...payload.new }));
      })
      // 2. Escuchar cuando alguien anota un punto con nombre propio (match_events)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, (payload) => {
        triggerPlayerOverlay(payload.new.id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // EFECTO: REACCIÓN PARA DEPORTES SIN JUGADOR ESPECÍFICO (Voley / Softbol)
  useEffect(() => {
    if (!matchData) return;

    if (isInitialLoad.current) {
      prevScores.current = { 
        home: matchData.home_score, away: matchData.away_score,
        homeSets: matchData.home_sets, awaySets: matchData.away_sets
      };
      isInitialLoad.current = false;
      return;
    }

    const sportName = matchData.matchdays?.categories?.sports?.name?.toUpperCase() || '';
    const isGenericSport = sportName.includes('VOLEIBOL') || sportName.includes('SOFTBOL') || sportName.includes('BÉISBOL') || sportName.includes('SOFTBALL') || sportName.includes('BASEBALL');

    // Solo disparamos el gráfico genérico si es Voley o Softbol. 
    // Futbol y Basket esperan la señal exacta del 'match_events' para mostrar el nombre.
    if (isGenericSport) {
      const homeScored = matchData.home_score > prevScores.current.home || matchData.home_sets > prevScores.current.homeSets;
      const awayScored = matchData.away_score > prevScores.current.away || matchData.away_sets > prevScores.current.awaySets;

      if (homeScored || awayScored) {
        const team = homeScored ? matchData.home_team : matchData.away_team;
        const type = sportName.includes('VOLEIBOL') ? '🏐 ¡PUNTO!' : '⚾ ¡CARRERA!';
        
        showOverlayUI({
          teamName: team.name,
          logo: team.schools?.logo_url,
          player: null,
          type: type,
          period: matchData.current_period
        });
      }
    }

    prevScores.current = { 
      home: matchData.home_score, away: matchData.away_score,
      homeSets: matchData.home_sets, awaySets: matchData.away_sets
    };
  }, [matchData?.home_score, matchData?.away_score, matchData?.home_sets, matchData?.away_sets]);

  // EFECTO: CICLO DE 5 MINUTOS PARA LA TABLA DE POSICIONES
  useEffect(() => {
    if (!matchData || matchData.status !== 'LIVE') return;

    const cycleInterval = setInterval(() => {
      setActiveOverlay((currentOverlay) => {
        if (currentOverlay !== 'NONE') return currentOverlay; // No pisar si hay un gol en pantalla
        fetchAndShowStandings();
        return 'STANDINGS';
      });
    }, 300000); // 300,000 ms = 5 minutos

    return () => clearInterval(cycleInterval);
  }, [matchData?.status]);


  // ==========================================
  // FUNCIONES DE CARGA Y LÓGICA DE GRÁFICOS
  // ==========================================

  async function fetchInitialData() {
    const { data } = await supabase.from('matches')
      .select(`
        *,
        home_team:teams!home_team_id(name, schools(logo_url)),
        away_team:teams!away_team_id(name, schools(logo_url)),
        matchdays!inner(categories(id, name, sports(name), tournaments(name)))
      `)
      .eq('id', matchId)
      .single();
    if (data) setMatchData(data);
  }

  // Se dispara cuando se inserta un jugador en la tabla (Futbol/Basket)
  async function triggerPlayerOverlay(eventId: string) {
    const { data: eventDetails } = await supabase.from('match_events')
      .select('event_type, period, teams(name, schools(logo_url)), players(name, shirt_number)')
      .eq('id', eventId)
      .single();

    if (eventDetails && eventDetails.players && eventDetails.teams) {
      const player = eventDetails.players as any;
      const team = eventDetails.teams as any;
      
      let eventTypeText = '¡ANOTACIÓN!';
      if (eventDetails.event_type === 'BASKET_1') eventTypeText = '🏀 TIRO LIBRE (+1)';
      if (eventDetails.event_type === 'BASKET_2') eventTypeText = '🏀 DOBLE (+2)';
      if (eventDetails.event_type === 'BASKET_3') eventTypeText = '🏀 TRIPLE (+3)';
      if (eventDetails.event_type === 'GOAL') eventTypeText = '⚽ ¡GOLAZO!';

      showOverlayUI({
        teamName: team.name,
        logo: team.schools?.logo_url,
        player: `${player.name} #${player.shirt_number}`,
        type: eventTypeText,
        period: eventDetails.period
      });
    }
  }

  function showOverlayUI(data: any) {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    
    setScoreNotification(data);
    setActiveOverlay('SCORE');

    overlayTimerRef.current = setTimeout(() => {
      setActiveOverlay('NONE');
    }, 15000); // 15 Segundos en pantalla
  }

  async function fetchAndShowStandings() {
    const categoryId = matchDataRef.current?.matchdays?.categories?.id;
    if (!categoryId) return;

    const { data: teamsData } = await supabase.from('teams').select('id, name, points, goals_for, goals_against, schools(logo_url)').eq('category_id', categoryId);
    
    if (teamsData) {
      const sorted = teamsData.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffB = (b.goals_for || 0) - (b.goals_against || 0);
        const diffA = (a.goals_for || 0) - (a.goals_against || 0);
        return diffB - diffA;
      });
      
      setLiveStandings(sorted.slice(0, 4)); // Solo mostramos Top 4
      setActiveOverlay('STANDINGS');

      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => {
        setActiveOverlay('NONE');
      }, 20000); // 20 Segundos en pantalla
    }
  }


  // ==========================================
  // RENDERIZADO VISUAL
  // ==========================================

  if (!matchData) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <span className="text-white font-black text-2xl tracking-widest uppercase animate-pulse">Conectando con la Mesa...</span>
      </div>
    );
  }

  const sportName = matchData.matchdays?.categories?.sports?.name?.toUpperCase() || '';
  const isVolleyball = sportName.includes('VOLEIBOL');
  const isSoftball = sportName.includes('SOFTBOL') || sportName.includes('SOFTBALL') || sportName.includes('BÉISBOL') || sportName.includes('BEISBOL') || sportName.includes('BASEBALL');
  
  const getSportBackground = () => {
    if (sportName.includes('BALONCESTO')) return '/bg-baloncesto.jpg';
    if (sportName.includes('FÚTBOL') || sportName.includes('FUTBOL')) return '/bg-futbol.jpg';
    if (sportName.includes('VOLEIBOL')) return '/bg-voleibol.jpg';
    if (isSoftball) return '/bg-softball.jpg'; 
    return null;
  };

  const bgImage = getSportBackground();

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-900 text-white font-sans flex flex-col relative select-none">
      
      {/* BOTÓN DE SALIDA OCULTO */}
      <Link href="/tv" className="absolute top-4 left-4 z-50 p-3 bg-black/30 hover:bg-red-600 rounded-full text-white/50 hover:text-white transition-all opacity-0 hover:opacity-100 focus:opacity-100 group shadow-lg">
        <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
      </Link>

      {/* FONDO DEPORTIVO OPTIMIZADO */}
      <div className="absolute inset-0 z-0 bg-cover bg-center" style={bgImage ? { backgroundImage: `url(${bgImage})` } : {}}>
        <div className="absolute inset-0 bg-black/80"></div>
      </div>

      {/* BARRA SUPERIOR INFO DEL TORNEO */}
      <div className="relative z-10 w-full py-6 px-12 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent">
         <div className="flex items-center gap-6">
           <div className="w-16 h-16 bg-white rounded-full p-2 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)]">
             <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
           </div>
           <div className="flex flex-col">
             <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-white/90 drop-shadow-md">
               {matchData.matchdays?.categories?.tournaments?.name || 'CSJB Championship'}
             </h1>
             <p className="text-blue-400 font-bold uppercase tracking-widest text-lg">
               {sportName} • {matchData.matchdays?.categories?.name}
             </p>
           </div>
         </div>
         <div className="flex flex-col items-end">
           <span className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-widest text-xl">
             <span className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.8)]"></span>
             Transmisión en Vivo
           </span>
         </div>
      </div>

      {/* ZONA CENTRAL DEL MARCADOR */}
      <div className="flex-1 relative z-10 flex items-center justify-center px-12 w-full transition-transform duration-700">
        <div className="w-full max-w-[90%] flex items-center justify-between gap-12">
          
          {/* EQUIPO LOCAL */}
          <div className="flex flex-col items-center flex-1">
            <div className="w-64 h-64 bg-white/5 rounded-[3rem] border border-white/10 flex items-center justify-center p-8 shadow-2xl mb-8">
              {matchData.home_team?.schools?.logo_url && (
                <img src={matchData.home_team.schools.logo_url} className="w-full h-full object-contain drop-shadow-xl" />
              )}
            </div>
            <h2 className="text-5xl lg:text-7xl font-black uppercase tracking-tighter text-center text-white drop-shadow-lg leading-tight">
              {matchData.home_team?.name}
            </h2>
          </div>

          {/* MARCADOR NUMÉRICO CENTRAL */}
          <div className="flex flex-col items-center justify-center shrink-0">
            
            {isVolleyball && (
              <div className="flex items-center gap-8 mb-8 bg-black/60 px-8 py-3 rounded-full border border-white/10">
                 <span className="text-5xl font-black text-amber-400">{matchData.home_sets}</span>
                 <span className="text-xl font-bold text-white/50 uppercase tracking-widest">Sets Globales</span>
                 <span className="text-5xl font-black text-amber-400">{matchData.away_sets}</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-8 md:gap-16">
              <span className="text-[15rem] lg:text-[20rem] font-black tabular-nums leading-none tracking-tighter drop-shadow-2xl">
                {matchData.home_score}
              </span>
              
              <div className="flex flex-col items-center gap-4">
                <span className="text-4xl text-white/30 font-black">-</span>
                <div className="bg-blue-600 px-8 py-3 rounded-full border-2 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                  <span className="text-2xl lg:text-4xl font-black uppercase tracking-widest text-white">
                    {matchData.current_period}
                  </span>
                </div>
                <span className="text-4xl text-white/30 font-black">-</span>
              </div>

              <span className="text-[15rem] lg:text-[20rem] font-black tabular-nums leading-none tracking-tighter drop-shadow-2xl">
                {matchData.away_score}
              </span>
            </div>

            {(isVolleyball || isSoftball) && (
              <p className="text-2xl font-bold uppercase tracking-[0.3em] text-white/50 mt-8">
                {isVolleyball ? 'Puntos del Set' : 'Carreras Totales'}
              </p>
            )}
          </div>

          {/* EQUIPO VISITANTE */}
          <div className="flex flex-col items-center flex-1">
            <div className="w-64 h-64 bg-white/5 rounded-[3rem] border border-white/10 flex items-center justify-center p-8 shadow-2xl mb-8">
              {matchData.away_team?.schools?.logo_url && (
                <img src={matchData.away_team.schools.logo_url} className="w-full h-full object-contain drop-shadow-xl" />
              )}
            </div>
            <h2 className="text-5xl lg:text-7xl font-black uppercase tracking-tighter text-center text-white drop-shadow-lg leading-tight">
              {matchData.away_team?.name}
            </h2>
          </div>
          
        </div>
      </div>

      {/* ================================================================== */}
      {/* LOWER THIRDS (GRÁFICOS DE TRANSMISIÓN DE TV)                       */}
      {/* ================================================================== */}

      {/* OVERLAY 1: ANOTACIÓN EN VIVO (Se desliza desde la izquierda) */}
      <div className={`absolute bottom-24 left-0 z-40 transition-all duration-700 ease-out transform ${activeOverlay === 'SCORE' ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}`}>
         <div className="bg-gradient-to-r from-blue-900/90 to-blue-900/40 backdrop-blur-md border-l-8 border-blue-500 py-6 pl-12 pr-24 rounded-r-[3rem] flex items-center gap-8 shadow-[10px_10px_30px_rgba(0,0,0,0.5)]">
            
            <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center p-3 shadow-xl">
               {scoreNotification?.logo && <img src={scoreNotification.logo} className="w-full h-full object-contain" />}
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-4 mb-2">
                <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <Flame size={14}/> {scoreNotification?.type}
                </span>
                <span className="text-white/50 font-bold uppercase tracking-widest text-sm">
                  {scoreNotification?.period}
                </span>
              </div>
              <h3 className="text-4xl font-black uppercase tracking-tighter text-white drop-shadow-md">
                {scoreNotification?.teamName}
              </h3>
              {scoreNotification?.player && (
                <p className="text-amber-400 font-bold text-2xl uppercase tracking-widest mt-1">
                  {scoreNotification.player}
                </p>
              )}
            </div>

         </div>
      </div>

      {/* OVERLAY 2: TABLA DE POSICIONES (Se desliza desde abajo) */}
      <div className={`absolute bottom-24 left-12 z-40 transition-all duration-700 ease-out transform ${activeOverlay === 'STANDINGS' ? 'translate-y-0 opacity-100' : 'translate-y-[150%] opacity-0'}`}>
         <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] w-[600px] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            
            <div className="flex items-center gap-4 mb-6 border-b border-white/10 pb-4">
               <Trophy className="text-amber-400" size={32} />
               <div>
                 <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Tabla en Vivo</h3>
                 <p className="text-white/50 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Top 4 • {matchData.matchdays?.categories?.name}</p>
               </div>
            </div>

            <div className="space-y-4">
               {liveStandings.map((team, index) => (
                 <div key={team.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                       <span className="text-2xl font-black text-white/30 italic">{index + 1}</span>
                       <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center p-1.5">
                         {team.schools?.logo_url && <img src={team.schools.logo_url} className="w-full h-full object-contain" />}
                       </div>
                       <span className="font-black uppercase tracking-tight text-white/90 truncate max-w-[200px]">{team.name}</span>
                    </div>
                    <div className="flex items-center gap-6">
                       <div className="text-center">
                         <span className="block text-[10px] text-white/40 font-bold uppercase tracking-widest">DIF</span>
                         <span className="font-black text-white/80">{(team.goals_for || 0) - (team.goals_against || 0)}</span>
                       </div>
                       <div className="text-center bg-white/10 px-4 py-1 rounded-xl">
                         <span className="block text-[10px] text-amber-400/80 font-bold uppercase tracking-widest">PTS</span>
                         <span className="font-black text-amber-400 text-xl leading-none">{team.points || 0}</span>
                       </div>
                    </div>
                 </div>
               ))}
            </div>

         </div>
      </div>

      {/* MARQUESINA INFERIOR */}
      <div className="h-16 bg-blue-600 border-t border-blue-400 flex items-center overflow-hidden z-30 relative">
        <div className="whitespace-nowrap flex gap-12 text-xl font-black uppercase tracking-[0.2em] text-white animate-[marquee_20s_linear_infinite]">
          <span>🏆 Sigue todas las estadísticas en vivo a través del Portal Público</span>
          <span>•</span>
          <span>CSJB CHAMPIONSHIP 2026</span>
          <span>•</span>
          <span>JUEGO LIMPIO Y DEPORTIVIDAD</span>
          <span>•</span>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
      `}} />
    </main>
  );
}