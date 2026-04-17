'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../supabase'; 
import { ArrowLeft, ArrowRight, MonitorPlay, CheckCircle2, Play, Minus, Plus, School, CalendarDays, Trophy, X, Flame, AlertTriangle, Radio } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';

function MesaControlContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlCategory = searchParams.get('cat'); 

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(urlCategory || null);
  
  const [pendingMatches, setPendingMatches] = useState<any[]>([]);
  const [activeRound, setActiveRound] = useState<number>(1);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeMatch, setActiveMatch] = useState<any | null>(null);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [homeSets, setHomeSets] = useState(0);
  const [awaySets, setAwaySets] = useState(0);
  const [currentPeriod, setCurrentPeriod] = useState('1'); 

  const [homeRoster, setHomeRoster] = useState<any[]>([]);
  const [awayRoster, setAwayRoster] = useState<any[]>([]);
  const [scoringAction, setScoringAction] = useState<{ team: 'HOME' | 'AWAY', type: 'SCORE' | 'SET', points: number } | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  // Nuevo estado para saber si el partido ya está 'LIVE' en la UI actual
  const [isMatchLive, setIsMatchLive] = useState(false);

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('categories').select('*, sports(name, scoring_system), tournaments(name, logo_url)').order('name');
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
        home_team:teams!home_team_id(id, name, schools(logo_url)),
        away_team:teams!away_team_id(id, name, schools(logo_url)),
        matchdays!inner(category_id, round_number, scheduled_date, categories(name, sports(name, scoring_system), tournaments(name, logo_url)))
      `)
      .eq('matchdays.category_id', selectedCategory)
      .in('status', ['SCHEDULED', 'LIVE'])
      .order('scheduled_time', { ascending: true });
    
    if (data) {
      setPendingMatches(data);
      const rounds = Array.from(new Set<number>(data.map((m: any) => Number(m.matchdays.round_number))))
        .sort((a: number, b: number) => a - b);
      
      setAvailableRounds(rounds);
      
      if (rounds.length > 0 && !rounds.includes(activeRound)) {
        setActiveRound(rounds[0]);
      }
    }
    setLoading(false);
  }

  const startMatchControl = async (match: any) => {
    setActiveMatch(match);
    setHomeScore(match.home_score || 0);
    setAwayScore(match.away_score || 0);
    setHomeSets(match.home_sets || 0);
    setAwaySets(match.away_sets || 0);
    setIsMatchLive(match.status === 'LIVE');
    
    const sportName = match.matchdays?.categories?.sports?.name?.toUpperCase() || '';
    let defaultPeriod = '1';
    if (sportName.includes('FÚTBOL')) defaultPeriod = '1T';
    else if (sportName.includes('BALONCESTO')) defaultPeriod = 'Q1';
    else if (sportName.includes('VOLEIBOL')) defaultPeriod = 'SET 1';
    else if (sportName.includes('SOFTBOL') || sportName.includes('SOFTBALL') || sportName.includes('BÉISBOL') || sportName.includes('BASEBALL')) defaultPeriod = 'INN 1';
    
    setCurrentPeriod(match.current_period || defaultPeriod);

    const { data: homeP } = await supabase.from('players').select('*').eq('team_id', match.home_team.id).order('shirt_number');
    const { data: awayP } = await supabase.from('players').select('*').eq('team_id', match.away_team.id).order('shirt_number');
    setHomeRoster(homeP || []);
    setAwayRoster(awayP || []);
  };

  // NUEVA FUNCIÓN: Ahora sí lo marcamos como 'LIVE' explícitamente
  const handleTurnMatchLive = async () => {
    if (!activeMatch) return;
    const { error } = await supabase.from('matches').update({ status: 'LIVE' }).eq('id', activeMatch.id);
    if (!error) {
      setIsMatchLive(true);
      toast.success('¡Partido en vivo! Transmitiendo resultados...');
    } else {
      toast.error('Error al iniciar el partido.');
    }
  };

  const handlePeriodChange = async (period: string) => {
    setCurrentPeriod(period);
    await supabase.from('matches').update({ current_period: period }).eq('id', activeMatch.id);
    toast.success(`Cambiado a ${period}`, { icon: '⏱️' });
  };

  const handleScoreClick = (team: 'HOME' | 'AWAY', type: 'SCORE' | 'SET', points: number) => {
    if (!isMatchLive) return toast.error('Debes arrancar el partido primero.');

    const sportName = activeMatch?.matchdays?.categories?.sports?.name?.toUpperCase() || '';
    const isRosterSport = sportName.includes('FÚTBOL') || sportName.includes('BALONCESTO');

    if (points < 0 || type === 'SET' || !isRosterSport) {
      executeScoreUpdate(team, type, points);
      return;
    }

    setScoringAction({ team, type, points });
  };

  const executeScoreUpdate = async (team: 'HOME' | 'AWAY', type: 'SCORE' | 'SET', points: number, playerId?: string) => {
    let newHomeScore = homeScore;
    let newAwayScore = awayScore;
    let newHomeSets = homeSets;
    let newAwaySets = awaySets;

    if (type === 'SCORE') {
      if (team === 'HOME') {
        newHomeScore = Math.max(0, homeScore + points);
        setHomeScore(newHomeScore);
      } else {
        newAwayScore = Math.max(0, awayScore + points);
        setAwayScore(newAwayScore);
      }
    } else if (type === 'SET') {
      if (team === 'HOME') {
        newHomeSets = Math.max(0, homeSets + points);
        setHomeSets(newHomeSets);
      } else {
        newAwaySets = Math.max(0, awaySets + points);
        setAwaySets(newAwaySets);
      }
    }

    await supabase.from('matches').update({ 
      home_score: newHomeScore, 
      away_score: newAwayScore,
      home_sets: newHomeSets,
      away_sets: newAwaySets
    }).eq('id', activeMatch.id);

    if (playerId && points > 0) {
      const sportName = activeMatch?.matchdays?.categories?.sports?.name?.toUpperCase() || '';
      let eventType = 'GOAL';
      
      if (sportName.includes('BALONCESTO')) {
        if (points === 1) eventType = 'BASKET_1';
        if (points === 2) eventType = 'BASKET_2';
        if (points === 3) eventType = 'BASKET_3';
      }

      await supabase.from('match_events').insert({
        match_id: activeMatch.id,
        player_id: playerId,
        team_id: team === 'HOME' ? activeMatch.home_team.id : activeMatch.away_team.id,
        event_type: eventType,
        period: currentPeriod 
      });
      toast.success('Punto registrado al jugador');
    }

    setScoringAction(null);
  };

  const handleFinishMatchClick = () => {
    if (!isMatchLive) return toast.error('El partido aún no ha comenzado.');
    setShowFinishConfirm(true);
  };

  const confirmFinishMatch = async () => {
    setShowFinishConfirm(false);
    setLoading(true);
    const toastId = toast.loading('Procesando estadísticas oficiales...');

    try {
      await supabase.from('matches').update({ 
        home_score: homeScore, 
        away_score: awayScore, 
        home_sets: homeSets,
        away_sets: awaySets,
        status: 'FINISHED' 
      }).eq('id', activeMatch.id);

      const { data: homeTeamStats } = await supabase.from('teams').select('*').eq('id', activeMatch.home_team.id).single();
      const { data: awayTeamStats } = await supabase.from('teams').select('*').eq('id', activeMatch.away_team.id).single();

      const scoringSystem = activeMatch.matchdays.categories.sports.scoring_system; 
      
      let homePointsToAdd = 0; let awayPointsToAdd = 0;
      let homeWon = 0, homeDrawn = 0, homeLost = 0;
      let awayWon = 0, awayDrawn = 0, awayLost = 0;

      let homeIsWinner = false;
      let awayIsWinner = false;

      if (scoringSystem === 'SETS') { 
         if (homeSets > awaySets) homeIsWinner = true;
         else if (awaySets > homeSets) awayIsWinner = true;
      } else { 
         if (homeScore > awayScore) homeIsWinner = true;
         else if (awayScore > homeScore) awayIsWinner = true;
      }

      if (homeIsWinner) {
        homePointsToAdd = scoringSystem === 'FIFA' ? 3 : (scoringSystem === 'FIBA' ? 2 : 3);
        awayPointsToAdd = scoringSystem === 'FIBA' ? 1 : 0; 
        homeWon = 1; awayLost = 1;
      } else if (awayIsWinner) {
        awayPointsToAdd = scoringSystem === 'FIFA' ? 3 : (scoringSystem === 'FIBA' ? 2 : 3);
        homePointsToAdd = scoringSystem === 'FIBA' ? 1 : 0;
        awayWon = 1; homeLost = 1;
      } else {
        homePointsToAdd = 1; awayPointsToAdd = 1;
        homeDrawn = 1; awayDrawn = 1;
      }

      await supabase.from('teams').update({
        played: (homeTeamStats?.played || 0) + 1,
        won: (homeTeamStats?.won || 0) + homeWon,
        drawn: (homeTeamStats?.drawn || 0) + homeDrawn,
        lost: (homeTeamStats?.lost || 0) + homeLost,
        goals_for: (homeTeamStats?.goals_for || 0) + homeScore,
        goals_against: (homeTeamStats?.goals_against || 0) + awayScore,
        points: (homeTeamStats?.points || 0) + homePointsToAdd
      }).eq('id', activeMatch.home_team.id);

      await supabase.from('teams').update({
        played: (awayTeamStats?.played || 0) + 1,
        won: (awayTeamStats?.won || 0) + awayWon,
        drawn: (awayTeamStats?.drawn || 0) + awayDrawn,
        lost: (awayTeamStats?.lost || 0) + awayLost,
        goals_for: (awayTeamStats?.goals_for || 0) + awayScore,
        goals_against: (awayTeamStats?.goals_against || 0) + homeScore,
        points: (awayTeamStats?.points || 0) + awayPointsToAdd
      }).eq('id', activeMatch.away_team.id);

      toast.success('Partido finalizado correctamente', { id: toastId });
      setActiveMatch(null);
      fetchPendingMatches();

    } catch (error) {
      toast.error('Ocurrió un error al procesar el partido', { id: toastId });
      console.error(error);
    }
    setLoading(false);
  };

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol') || name.includes('soccer')) return <FaFutbol className="text-emerald-500" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-500" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-yellow-500" size={size} />;
    if (name.includes('softball') || name.includes('béisbol') || name.includes('baseball')) return <FaBaseballBall className="text-red-500" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  const matchesToShow = pendingMatches.filter(m => m.matchdays?.round_number === activeRound);
  const activeSportName = activeMatch?.matchdays?.categories?.sports?.name?.toUpperCase() || '';
  const activeTournamentName = activeMatch?.matchdays?.categories?.tournaments?.name || '';
  const activeTournamentLogo = activeMatch?.matchdays?.categories?.tournaments?.logo_url || null;
  const activeCategoryName = activeMatch?.matchdays?.categories?.name || '';

  const homeIsLeading = homeScore > awayScore;
  const awayIsLeading = awayScore > homeScore;

  const getSportBackground = () => {
    if (activeSportName.includes('BALONCESTO')) return '/bg-baloncesto.jpg';
    if (activeSportName.includes('FÚTBOL')) return '/bg-futbol.jpg';
    if (activeSportName.includes('VOLEIBOL')) return '/bg-voleibol.jpg';
    if (activeSportName.includes('SOFTBOL') || activeSportName.includes('SOFTBALL') || activeSportName.includes('BÉISBOL')) return '/bg-softbol.jpg';
    return null;
  };
  const bgImage = getSportBackground();

  const renderPeriodSelector = () => {
    let periods = ['1', '2', '3'];
    if (activeSportName.includes('FÚTBOL')) periods = ['1T', '2T', 'PEN'];
    else if (activeSportName.includes('BALONCESTO')) periods = ['Q1', 'Q2', 'Q3', 'Q4', 'TE'];
    else if (activeSportName.includes('VOLEIBOL')) periods = ['SET 1', 'SET 2', 'SET 3', 'SET 4', 'SET 5'];
    else if (activeSportName.includes('SOFTBOL') || activeSportName.includes('SOFTBALL') || activeSportName.includes('BÉISBOL')) periods = ['INN 1', 'INN 2', 'INN 3', 'INN 4', 'INN 5', 'INN 6', 'INN 7', 'EXTRA'];

    return (
      <div className="flex justify-center flex-wrap gap-2 mt-3 z-10 relative">
         {periods.map(p => (
           <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              disabled={!isMatchLive}
              className={`px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all shadow-sm ${currentPeriod === p ? 'bg-emerald-500 text-white border-emerald-600 scale-105' : 'bg-white text-slate-500 border-slate-200 hover:text-emerald-600 hover:border-emerald-200 disabled:opacity-50 disabled:hover:text-slate-500 disabled:hover:border-slate-200'}`}
           >
             {p}
           </button>
         ))}
      </div>
    );
  };

  // ============================================================================
  // VISTA MESA DE CONTROL EN VIVO (PARTIDO ACTIVO)
  // ============================================================================
  if (activeMatch) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden text-slate-900 font-sans">
        
        {/* MODAL DE CONFIRMACIÓN DE FINALIZACIÓN */}
        {showFinishConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
                <AlertTriangle size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Finalizar Partido?</h3>
              <p className="text-slate-500 text-sm font-bold mb-8">Esta action calculará los puntos oficiales y actualizará la tabla de posiciones permanentemente.</p>
              
              <div className="flex w-full gap-4">
                <button 
                  onClick={() => setShowFinishConfirm(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmFinishMatch}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE SELECCIÓN DE JUGADOR */}
        {scoringAction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">¿Quién anotó?</h3>
                  <p className="text-emerald-600 font-bold uppercase tracking-widest text-xs mt-1">
                    Sumando +{scoringAction.points} en el {currentPeriod} para {scoringAction.team === 'HOME' ? activeMatch.home_team.name : activeMatch.away_team.name}
                  </p>
                </div>
                <button onClick={() => setScoringAction(null)} className="p-3 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 transition-colors">
                  <X size={24}/>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-4 scrollbar-hide">
                {(scoringAction.team === 'HOME' ? homeRoster : awayRoster).map(player => (
                  <button 
                    key={player.id} 
                    onClick={() => executeScoreUpdate(scoringAction.team, scoringAction.type, scoringAction.points, player.id)}
                    className="bg-white p-6 rounded-[1.5rem] border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex flex-col items-center group shadow-sm hover:shadow-md"
                  >
                    <span className="text-4xl font-black text-slate-700 group-hover:text-emerald-600 transition-colors">{player.shirt_number || '-'}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase mt-3 text-center line-clamp-2 leading-tight group-hover:text-emerald-800">{player.name}</span>
                  </button>
                ))}
                {(scoringAction.team === 'HOME' ? homeRoster : awayRoster).length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-400 font-bold uppercase text-xs tracking-widest bg-slate-50 rounded-3xl border border-slate-200">
                    No hay jugadores inscritos en este equipo.
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-center gap-4 pt-6 border-t border-slate-100 shrink-0">
                <button 
                  onClick={() => executeScoreUpdate(scoringAction.team, scoringAction.type, scoringAction.points)} 
                  className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm"
                >
                  Saltar (Solo sumar punto)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CABECERA CON LOGO OFICIAL DEL TORNEO */}
        <div className="bg-white p-6 border-b border-slate-200 flex items-center justify-between shadow-sm z-20 relative">
          <button onClick={() => setActiveMatch(null)} className="p-3 bg-slate-50 text-slate-500 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0 shadow-sm border border-slate-200">
            <ArrowLeft size={24} />
          </button>
          
          <div className="flex-1 text-center flex flex-col items-center px-4">
            
            <div className="flex items-center justify-center gap-4 mb-1">
              {activeTournamentLogo && (
                 <img src={activeTournamentLogo} alt="Torneo" className="h-8 w-auto object-contain" />
              )}
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-widest">{activeSportName}</h2>
              <span className="hidden md:inline-block px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-widest">{activeTournamentName}</span>
            </div>

            <span className="text-sm text-blue-600 font-black uppercase tracking-widest mt-1 mb-2">{activeCategoryName}</span>
            
            {renderPeriodSelector()}

          </div>
          
          <div className="w-12 shrink-0 flex justify-end">
            {isMatchLive && <span className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" title="En Vivo"></span>}
          </div>
        </div>

        {/* CONTENEDOR PRINCIPAL: LA CANCHA UNIFICADA */}
        <div 
          className="flex-1 flex flex-col md:flex-row items-stretch relative z-10 bg-cover bg-center"
          style={bgImage ? { backgroundImage: `url(${bgImage})` } : {}}
        >
          {/* CAPA CLARA GLOBAL: Ajustada al 65% para que la cancha resalte más */}
          <div className="absolute inset-0 bg-white/65 z-0"></div>

          {/* MEDALLÓN "VS" CENTRAL O BOTÓN DE INICIAR */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 flex items-center justify-center">
            {!isMatchLive ? (
              <button 
                onClick={handleTurnMatchLive}
                className="flex flex-col items-center justify-center gap-2 w-48 h-48 bg-red-600 rounded-full text-white shadow-[0_0_30px_rgba(220,38,38,0.4)] hover:bg-red-500 hover:scale-105 active:scale-95 transition-all border-4 border-white animate-pulse"
              >
                <Radio size={48} />
                <span className="font-black uppercase tracking-widest text-sm text-center px-4 leading-tight">Arrancar Partido</span>
              </button>
            ) : (
              <div className="hidden md:flex w-24 h-24 bg-white border-4 border-slate-100 rounded-full items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.1)] pointer-events-none">
                <span className="text-3xl font-black text-slate-300 italic tracking-tighter">VS</span>
              </div>
            )}
          </div>

          {/* === PANEL LOCAL === */}
          <div className={`flex-1 flex flex-col items-center justify-center p-8 border-b md:border-b-0 md:border-r border-slate-200 relative z-10 transition-opacity duration-300 ${!isMatchLive ? 'opacity-50 grayscale' : 'opacity-100'}`}>
            
            {/* MARCA DE AGUA */}
            {activeMatch.home_team?.schools?.logo_url && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15 mix-blend-multiply overflow-hidden z-0">
                  <img src={activeMatch.home_team.schools.logo_url} alt="Watermark" className="w-3/4 h-3/4 object-contain grayscale" />
               </div>
            )}

            <div className="h-8 mb-2 z-10">
              {homeIsLeading && isMatchLive && (
                <span className="flex items-center gap-1 text-amber-600 font-black text-[10px] uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-200 shadow-sm animate-pulse">
                  <Flame size={12}/> Ganando
                </span>
              )}
            </div>

            <div className="w-32 h-32 bg-white rounded-[2rem] border border-slate-200 flex items-center justify-center p-6 shadow-xl mb-6 z-10 overflow-hidden relative">
              {activeMatch.home_team?.schools?.logo_url ? (
                <img src={activeMatch.home_team.schools.logo_url} alt="Local" className="w-full h-full object-contain relative z-10" />
              ) : <School size={48} className="text-slate-300" />}
            </div>
            
            <h3 className="text-5xl font-black text-slate-900 uppercase tracking-tighter text-center mb-3 z-10 drop-shadow-sm">{activeMatch.home_team?.name}</h3>
            <p className="text-slate-400 font-black text-sm uppercase tracking-[0.2em] mb-8 z-10 bg-slate-50 px-6 py-2 rounded-full border border-slate-200 shadow-sm">Local</p>
            
            {activeSportName.includes('VOLEIBOL') && (
              <div className="mb-6 flex flex-col items-center bg-white p-4 rounded-3xl border border-slate-200 shadow-md w-full max-w-xs z-10">
                <span className="text-slate-500 font-black text-xs uppercase tracking-widest mb-2">Sets Globales Ganados</span>
                <div className="flex items-center gap-4">
                  <button onClick={() => handleScoreClick('HOME', 'SET', -1)} disabled={!isMatchLive} className="p-3 bg-slate-50 rounded-xl text-red-500 hover:bg-slate-100 border border-slate-200 shadow-sm disabled:opacity-50"><Minus size={20}/></button>
                  <span className="text-5xl font-black text-blue-600 tabular-nums">{homeSets}</span>
                  <button onClick={() => handleScoreClick('HOME', 'SET', 1)} disabled={!isMatchLive} className="p-3 bg-slate-50 rounded-xl text-blue-600 hover:bg-slate-100 border border-slate-200 shadow-sm disabled:opacity-50"><Plus size={20}/></button>
                </div>
              </div>
            )}

            {(activeSportName.includes('VOLEIBOL') || activeSportName.includes('SOFTBOL') || activeSportName.includes('BÉISBOL')) && <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">{activeSportName.includes('VOLEIBOL') ? `Puntos del ${currentPeriod}` : 'Carreras Totales'}</p>}
            <span className={`text-[12rem] leading-none font-black tabular-nums w-full text-center mb-8 z-10 drop-shadow-md transition-colors ${homeIsLeading && isMatchLive ? 'text-slate-900' : 'text-slate-500'}`}>
              {homeScore}
            </span>
            
            <div className="flex flex-wrap items-center justify-center gap-4 z-10">
              <button disabled={!isMatchLive} onClick={() => handleScoreClick('HOME', 'SCORE', -1)} className="h-20 px-8 bg-white rounded-2xl flex items-center justify-center text-red-500 border border-slate-200 shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-50">
                <Minus size={32} />
              </button>

              {activeSportName.includes('BALONCESTO') ? (
                <>
                  <button disabled={!isMatchLive} onClick={() => handleScoreClick('HOME', 'SCORE', 1)} className="h-20 px-8 bg-blue-600 rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-blue-200 disabled:opacity-50">
                    <span className="font-black text-2xl">+1</span><span className="text-[10px] font-bold uppercase opacity-80">Libre</span>
                  </button>
                  <button disabled={!isMatchLive} onClick={() => handleScoreClick('HOME', 'SCORE', 2)} className="h-20 px-8 bg-blue-600 rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-blue-200 disabled:opacity-50">
                    <span className="font-black text-3xl">+2</span><span className="text-[10px] font-bold uppercase opacity-80">Doble</span>
                  </button>
                  <button disabled={!isMatchLive} onClick={() => handleScoreClick('HOME', 'SCORE', 3)} className="h-20 px-8 bg-blue-500 rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-blue-200 border border-blue-400 disabled:opacity-50">
                    <span className="font-black text-3xl">+3</span><span className="text-[10px] font-bold uppercase opacity-80">Triple</span>
                  </button>
                </>
              ) : (
                <button disabled={!isMatchLive} onClick={() => handleScoreClick('HOME', 'SCORE', 1)} className="w-40 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white active:scale-95 transition-all shadow-lg shadow-blue-200 disabled:opacity-50">
                  <Plus size={48} />
                </button>
              )}
            </div>
          </div>

          {/* === PANEL VISITANTE === */}
          <div className={`flex-1 flex flex-col items-center justify-center p-8 relative z-10 transition-opacity duration-300 ${!isMatchLive ? 'opacity-50 grayscale' : 'opacity-100'}`}>
            
            {/* MARCA DE AGUA */}
            {activeMatch.away_team?.schools?.logo_url && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15 mix-blend-multiply overflow-hidden z-0">
                  <img src={activeMatch.away_team.schools.logo_url} alt="Watermark" className="w-3/4 h-3/4 object-contain grayscale" />
               </div>
            )}

            <div className="h-8 mb-2 z-10">
              {awayIsLeading && isMatchLive && (
                <span className="flex items-center gap-1 text-amber-600 font-black text-[10px] uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-200 shadow-sm animate-pulse">
                  <Flame size={12}/> Ganando
                </span>
              )}
            </div>

            <div className="w-32 h-32 bg-white rounded-[2rem] border border-slate-200 flex items-center justify-center p-6 shadow-xl mb-6 z-10 overflow-hidden relative">
              {activeMatch.away_team?.schools?.logo_url ? (
                <img src={activeMatch.away_team.schools.logo_url} alt="Visitante" className="w-full h-full object-contain relative z-10" />
              ) : <School size={48} className="text-slate-300" />}
            </div>
            
            <h3 className="text-5xl font-black text-slate-900 uppercase tracking-tighter text-center mb-3 z-10 drop-shadow-md">{activeMatch.away_team?.name}</h3>
            <p className="text-slate-400 font-black text-sm uppercase tracking-[0.2em] mb-8 z-10 bg-slate-50 px-6 py-2 rounded-full border border-slate-200 shadow-sm">Visitante</p>

            {activeSportName.includes('VOLEIBOL') && (
              <div className="mb-6 flex flex-col items-center bg-white p-4 rounded-3xl border border-slate-200 shadow-md w-full max-w-xs z-10">
                <span className="text-slate-500 font-black text-xs uppercase tracking-widest mb-2">Sets Globales Ganados</span>
                <div className="flex items-center gap-4">
                  <button onClick={() => handleScoreClick('AWAY', 'SET', -1)} disabled={!isMatchLive} className="p-3 bg-slate-50 rounded-xl text-red-500 hover:bg-slate-100 border border-slate-200 shadow-sm disabled:opacity-50"><Minus size={20}/></button>
                  <span className="text-5xl font-black text-blue-600 tabular-nums">{awaySets}</span>
                  <button onClick={() => handleScoreClick('AWAY', 'SET', 1)} disabled={!isMatchLive} className="p-3 bg-slate-50 rounded-xl text-blue-600 hover:bg-slate-100 border border-slate-200 shadow-sm disabled:opacity-50"><Plus size={20}/></button>
                </div>
              </div>
            )}
            
            {(activeSportName.includes('VOLEIBOL') || activeSportName.includes('SOFTBOL') || activeSportName.includes('BÉISBOL')) && <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">{activeSportName.includes('VOLEIBOL') ? `Puntos del ${currentPeriod}` : 'Carreras Totales'}</p>}
            <span className={`text-[12rem] leading-none font-black tabular-nums w-full text-center mb-8 z-10 drop-shadow-md transition-colors ${awayIsLeading && isMatchLive ? 'text-slate-900' : 'text-slate-500'}`}>
              {awayScore}
            </span>
            
            <div className="flex flex-wrap items-center justify-center gap-4 z-10">
              <button disabled={!isMatchLive} onClick={() => handleScoreClick('AWAY', 'SCORE', -1)} className="h-20 px-8 bg-white rounded-2xl flex items-center justify-center text-red-500 border border-slate-200 shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-50">
                <Minus size={32} />
              </button>

              {activeSportName.includes('BALONCESTO') ? (
                <>
                  <button disabled={!isMatchLive} onClick={() => handleScoreClick('AWAY', 'SCORE', 1)} className="h-20 px-8 bg-blue-600 rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-blue-200 disabled:opacity-50">
                    <span className="font-black text-2xl">+1</span><span className="text-[10px] font-bold uppercase opacity-80">Libre</span>
                  </button>
                  <button disabled={!isMatchLive} onClick={() => handleScoreClick('AWAY', 'SCORE', 2)} className="h-20 px-8 bg-blue-600 rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-blue-200 disabled:opacity-50">
                    <span className="font-black text-3xl">+2</span><span className="text-[10px] font-bold uppercase opacity-80">Doble</span>
                  </button>
                  <button disabled={!isMatchLive} onClick={() => handleScoreClick('AWAY', 'SCORE', 3)} className="h-20 px-8 bg-blue-500 rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-blue-200 border border-blue-400 disabled:opacity-50">
                    <span className="font-black text-3xl">+3</span><span className="text-[10px] font-bold uppercase opacity-80">Triple</span>
                  </button>
                </>
              ) : (
                <button disabled={!isMatchLive} onClick={() => handleScoreClick('AWAY', 'SCORE', 1)} className="w-40 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white active:scale-95 transition-all shadow-lg shadow-blue-200 disabled:opacity-50">
                  <Plus size={48} />
                </button>
              )}
            </div>
          </div>

        </div>

        <div className="p-6 bg-white border-t border-slate-200 relative z-20">
          <button 
            onClick={handleFinishMatchClick} 
            disabled={loading || !isMatchLive}
            className="w-full py-6 bg-slate-900 hover:bg-slate-800 rounded-2xl font-black text-xl text-white uppercase tracking-widest flex items-center justify-center gap-4 active:scale-[0.98] transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
          >
            <CheckCircle2 size={28} /> Finalizar Partido
          </button>
        </div>
      </main>
    );
  }

  const uniqueSports = Array.from(new Set(categories.map(c => c.sports?.name).filter(Boolean)));

  // ============================================================================
  // VISTAS DE NAVEGACIÓN (DEPORTES -> CATEGORÍAS -> PARTIDOS)
  // ============================================================================
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-4 py-12 relative">
        
        {/* CABECERA Y BOTÓN DE RETROCESO INTELIGENTE */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Mesa de <span className="text-blue-600">Control</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Gestión de Marcadores Oficiales en Vivo</p>
          </div>
          
          {/* NAVEGACIÓN LÓGICA */}
          {selectedCategory ? (
            <button onClick={() => { setSelectedCategory(''); router.replace('/admin/mesa', { scroll: false }); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
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
           <div className="space-y-6">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-6">
               <MonitorPlay className="text-blue-600" size={24}/> Selecciona el Deporte a Arbitrar
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{sport as string}</h3>
                   <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 mt-4 group-hover:text-blue-600 transition-colors w-full justify-between">
                     Ver Categorías <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </p>
                 </button>
               ))}
               {uniqueSports.length === 0 && (
                 <p className="text-slate-500 font-bold text-xs uppercase tracking-widest col-span-3">No hay deportes registrados aún.</p>
               )}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIONAR CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-4 mb-6">
               {getSportIcon(selectedSport, 28)} Categorías de {selectedSport}
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => {
                     setSelectedCategory(c.id);
                     router.replace(`/admin/mesa?cat=${c.id}`, { scroll: false });
                   }}
                   className="group flex flex-col p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-emerald-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2">{c.name}</h3>
                   <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">Duración: {c.match_duration || 'Estándar'}</p>
                   
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 w-full justify-between">
                     Abrir Mesa de Control <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: MESA DE PARTIDOS PENDIENTES */}
        {selectedCategory && (
          <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="flex overflow-x-auto bg-slate-50 px-4 pt-4 border-b border-slate-200 gap-2 scrollbar-hide">
              {availableRounds.map((round) => (
                <button
                  key={round}
                  onClick={() => setActiveRound(round)}
                  className={`px-8 py-4 rounded-t-2xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap
                    ${activeRound === round 
                      ? 'bg-white text-blue-600 border-t-2 border-x border-slate-200 shadow-sm z-10 -mb-[1px]' 
                      : 'bg-slate-100 text-slate-500 hover:bg-white hover:text-slate-700 border-t border-transparent'}
                  `}
                >
                  {round >= 100 ? 'FASE FINAL' : `FECHA ${round}`}
                </button>
              ))}
              {availableRounds.length === 0 && !loading && (
                <div className="px-8 py-4 text-slate-500 font-bold text-[10px] uppercase tracking-widest">Sin partidos pendientes</div>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {loading ? (
                <p className="text-center text-slate-500 font-bold p-12 uppercase tracking-widest">Cargando partidos...</p>
              ) : matchesToShow.length === 0 ? (
                <div className="p-16 text-center">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
                  <p className="text-slate-900 font-black uppercase tracking-widest text-lg">Jornada Completada</p>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">No hay partidos pendientes para esta fecha.</p>
                </div>
              ) : (
                matchesToShow.map(match => (
                  <div key={match.id} className="p-8 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-8 group">
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest inline-block shadow-sm
                          ${match.status === 'LIVE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse' : 'bg-slate-100 text-slate-600 border border-slate-200'}
                        `}>
                          {match.status === 'LIVE' ? 'En Vivo' : 'Programado'}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <CalendarDays size={12} className="text-blue-500"/> 
                          {match.matchdays?.scheduled_date ? new Date(match.matchdays.scheduled_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : ''} 
                          {' '}|{' '} {match.scheduled_time ? match.scheduled_time.substring(0, 5) : 'Por definir'}
                        </span>
                      </div>

                      {/* CONTENEDOR FLEX-1 PARA QUE LOS NOMBRES LARGOS NO SE CORTEN */}
                      <div className="flex items-center gap-4 sm:gap-6 w-full">
                        <div className="flex items-center gap-3 flex-1 justify-end">
                           <span className="text-sm sm:text-lg font-black text-slate-900 uppercase tracking-tight text-right break-words">{match.home_team?.name}</span>
                           <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-sm">
                             {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={20} className="text-slate-300"/>}
                           </div>
                        </div>
                        
                        <div className="px-3 py-2 sm:px-4 bg-slate-50 rounded-xl border border-slate-200 font-black text-slate-400 text-xs shadow-inner shrink-0">VS</div>
                        
                        <div className="flex items-center gap-3 flex-1 justify-start">
                           <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-sm">
                             {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={20} className="text-slate-300"/>}
                           </div>
                           <span className="text-sm sm:text-lg font-black text-slate-900 uppercase tracking-tight text-left break-words">{match.away_team?.name}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => startMatchControl(match)}
                      className="w-full md:w-auto px-8 py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xs text-white uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-transform active:scale-95 shrink-0"
                    >
                      <Play size={16} /> {match.status === 'LIVE' ? 'Retomar Mesa' : 'Abrir Mesa'}
                    </button>

                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function MesaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-blue-600 font-black tracking-widest uppercase animate-pulse">Cargando Mesa de Control...</p>
      </div>
    }>
      <MesaControlContent />
    </Suspense>
  );
}