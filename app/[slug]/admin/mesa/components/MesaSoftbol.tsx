'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../../supabase';
import { ArrowLeft, CheckCircle2, Play, Pause, RotateCcw, Minus, Plus, School, CalendarDays, X, Flame, AlertTriangle, Radio, RefreshCcw, UsersRound, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { FaBaseballBall } from 'react-icons/fa';
import { useElapsedMatchTimer } from '../hooks/useElapsedMatchTimer';
import { changeMatchPeriod, finishCourtMatch, recordGenericMatchEvent, revertLastScoringEvent, startLiveMatch } from '../actions';
import { evaluatePlayerEligibility } from '@/app/lib/competition/player-eligibility';

interface MesaSoftbolProps {
  match: any;
  categoryData: any;
  slug: string;
  onClose: () => void;
  onMatchUpdate: () => void;
}

export default function MesaSoftbol({ match, categoryData, slug, onClose, onMatchUpdate }: MesaSoftbolProps) {
  const [homeScore, setHomeScore] = useState(match.home_score || 0);
  const [awayScore, setAwayScore] = useState(match.away_score || 0);
  const [currentPeriod, setCurrentPeriod] = useState(match.current_period || 'INN 1');
  const [isMatchLive, setIsMatchLive] = useState(match.status === 'LIVE');

  const [homeRoster, setHomeRoster] = useState<any[]>([]);
  const [awayRoster, setAwayRoster] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);

  // LOBBY PRE-PARTIDO
  const [showStartingLineupModal, setShowStartingLineupModal] = useState(false);
  const [homeStartingLineup, setHomeStartingLineup] = useState<string[]>([]);
  const [awayStartingLineup, setAwayStartingLineup] = useState<string[]>([]);
  
  const maxPlayers = 10; 
  const minPlayers = 9;

  const [loading, setLoading] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showPeriodConfirm, setShowPeriodConfirm] = useState<{ isOpen: boolean; targetPeriod: string }>({ isOpen: false, targetPeriod: '' });
  const [showResetTimerConfirm, setShowResetTimerConfirm] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState<'HOME' | 'AWAY' | null>(null);

  const [scoringAction, setScoringAction] = useState<{ team: 'HOME' | 'AWAY', type: 'SCORE' | 'SUB' | 'SCORE_MINUS', points: number } | null>(null);
  const [subOutPlayer, setSubOutPlayer] = useState<string | null>(null);
  const playerEligibility = (player: any) => evaluatePlayerEligibility({ playerId: player.id, registered: true, teamId: player.team_id, documents: player.player_documents || [], suspended: liveEvents.some((event) => event.player_id === player.id && event.event_type === 'RED'), unpaidFine: liveEvents.some((event) => event.player_id === player.id && event.fine_status === 'UNPAID') });

  const {
    timerSeconds,
    isTimerRunning,
    toggleTimer,
    pauseTimer,
    resetTimer,
  } = useElapsedMatchTimer(slug, match.id, {
    is_timer_running: match.is_timer_running || false,
    timer_start_time: match.timer_start_time || null,
    timer_accumulated_seconds: match.timer_accumulated_seconds ?? match.home_sets ?? 0,
    home_sets: match.home_sets ?? 0,
  });

  useEffect(() => {
    async function loadData() {
      const { data: homeP } = await supabase.from('players').select('*').eq('team_id', match.home_team.id).order('shirt_number');
      const { data: awayP } = await supabase.from('players').select('*').eq('team_id', match.away_team.id).order('shirt_number');
      setHomeRoster(homeP || []);
      setAwayRoster(awayP || []);

      const { data: eventsP } = await supabase.from('match_events').select('*').eq('match_id', match.id);
      setLiveEvents(eventsP || []);

      if (match.status === 'LIVE' || match.status === 'FINISHED') {
         const startingEvents = (eventsP || []).filter(e => e.event_type === 'STARTING_LINEUP');
         if (startingEvents && startingEvents.length > 0) {
            setHomeStartingLineup(startingEvents.filter(e => e.team_id === match.home_team.id).map(e => e.player_id));
            setAwayStartingLineup(startingEvents.filter(e => e.team_id === match.away_team.id).map(e => e.player_id));
         }
      }
    }
    loadData();
  }, [match.id]);

  const handleToggleTimer = async () => {
    if (!isMatchLive) return toast.error('Debes arrancar el partido primero.');
    await toggleTimer();
  };

  const executeResetTimer = async () => {
    await resetTimer(currentPeriod);
    setShowResetTimerConfirm(false);
    toast.success('Cronómetro reiniciado');
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handlePreMatchSetup = () => setShowStartingLineupModal(true);

  const handleQuickStart = async () => {
    setLoading(true);
    const toastId = toast.loading('Iniciando...');
    try {
      await startLiveMatch({ slug, matchId: match.id, period: 'INN 1' });

      setIsMatchLive(true);
      setCurrentPeriod('INN 1');
      setShowStartingLineupModal(false);
      await resetTimer('INN 1');
      await toggleTimer();
      toast.success('¡Play Ball! Partido en vivo.', { id: toastId, icon: '⚾' });
    } catch (error) { toast.error('Error al iniciar.', { id: toastId }); }
    setLoading(false);
  };

  const toggleStartingPlayer = (team: 'HOME' | 'AWAY', playerId: string) => {
    const roster = team === 'HOME' ? homeRoster : awayRoster;
    const player = roster.find((candidate) => candidate.id === playerId);
    if (player && playerEligibility(player).status === 'INELIGIBLE') {
      return toast.error('Jugador no habilitado para este partido.');
    }
    if (team === 'HOME') {
      if (homeStartingLineup.includes(playerId)) setHomeStartingLineup(prev => prev.filter(id => id !== playerId));
      else {
        if (homeStartingLineup.length >= maxPlayers) return toast.error(`Máximo ${maxPlayers} en el lineup.`);
        setHomeStartingLineup(prev => [...prev, playerId]);
      }
    } else {
      if (awayStartingLineup.includes(playerId)) setAwayStartingLineup(prev => prev.filter(id => id !== playerId));
      else {
        if (awayStartingLineup.length >= maxPlayers) return toast.error(`Máximo ${maxPlayers} en el lineup.`);
        setAwayStartingLineup(prev => [...prev, playerId]);
      }
    }
  };

  const handleTurnMatchLive = async () => {
    setLoading(true);
    const toastId = toast.loading('Registrando acta...');
    try {
      await startLiveMatch({
        slug,
        matchId: match.id,
        period: 'INN 1',
        lineups: [
          ...homeStartingLineup.map((pid) => ({ playerId: pid, teamId: match.home_team.id, period: '0 INN' })),
          ...awayStartingLineup.map((pid) => ({ playerId: pid, teamId: match.away_team.id, period: '0 INN' })),
        ],
      });
      
      const { data: eventsP } = await supabase.from('match_events').select('*').eq('match_id', match.id);
      if (eventsP) setLiveEvents(eventsP);

      setIsMatchLive(true);
      setCurrentPeriod('INN 1');
      setShowStartingLineupModal(false);
      await resetTimer('INN 1');
      await toggleTimer();
      toast.success('¡Play Ball!', { id: toastId, icon: '⚾' });
    } catch (error) { toast.error('Error al iniciar.', { id: toastId }); }
    setLoading(false);
  };

  const requestPeriodChange = (period: string) => {
    if (!isMatchLive) return toast.error('Inicie el partido primero.');
    if (period === currentPeriod) return;
    if (isTimerRunning) pauseTimer().catch(console.error);
    setShowPeriodConfirm({ isOpen: true, targetPeriod: period });
  };

  const executePeriodChange = async () => {
    const period = showPeriodConfirm.targetPeriod;
    setCurrentPeriod(period);
    await changeMatchPeriod({ slug, matchId: match.id, period });
    setShowPeriodConfirm({ isOpen: false, targetPeriod: '' });
    
    if (!isTimerRunning) toggleTimer().catch(console.error);
    toast.success(`Avanzando a ${period}`);
  };

  const handleRefereeAction = (team: 'HOME' | 'AWAY', type: 'SCORE' | 'SUB' | 'SCORE_MINUS', points: number = 0) => {
    if (!isMatchLive) return toast.error('Inicie transmisión primero.');
    if (type === 'SCORE_MINUS') {
      executeActionRecord(team, type, -1); 
      return;
    }
    setSubOutPlayer(null);
    setScoringAction({ team, type, points });
  };

  const executeActionRecord = async (team: 'HOME' | 'AWAY', type: 'SCORE' | 'SUB' | 'SCORE_MINUS', points: number, playerId?: string) => {
    
    if (type === 'SCORE_MINUS') {
      const lastGoal = [...liveEvents].reverse().find(e => e.team_id === (team === 'HOME' ? match.home_team.id : match.away_team.id) && e.event_type === 'GOAL');
      if (lastGoal) {
         const result = await revertLastScoringEvent({
           slug,
           matchId: match.id,
           teamId: team === 'HOME' ? match.home_team.id : match.away_team.id,
           eventId: lastGoal.id,
           updateMatchScore: true,
         });
         const { data: eventsP } = await supabase.from('match_events').select('*').eq('match_id', match.id);
         if (eventsP) setLiveEvents(eventsP);
         
         const newH = typeof result.home_score === 'number' ? result.home_score : (team === 'HOME' ? Math.max(0, homeScore - 1) : homeScore);
         const newA = typeof result.away_score === 'number' ? result.away_score : (team === 'AWAY' ? Math.max(0, awayScore - 1) : awayScore);
         setHomeScore(newH); setAwayScore(newA);
         toast.success('Carrera revertida');
      } else {
         toast.error('No hay carreras para restar');
      }
      return;
    }

    if (type === 'SCORE') {
      const result = await recordGenericMatchEvent({
        slug,
        matchId: match.id,
        teamId: team === 'HOME' ? match.home_team.id : match.away_team.id,
        playerId: playerId || null,
        eventType: 'GOAL',
        period: currentPeriod,
        minuteRecord: Math.floor(timerSeconds / 60),
        scoreDelta: points,
      });
      if (typeof result?.home_score === 'number') setHomeScore(result.home_score);
      if (typeof result?.away_score === 'number') setAwayScore(result.away_score);
    }

    if (playerId || type !== 'SCORE') {
      const teamId = team === 'HOME' ? match.home_team.id : match.away_team.id;

      if (type === 'SUB' && playerId) {
        if (!subOutPlayer) {
           setSubOutPlayer(playerId);
           toast.success('Sale jugador. Ahora seleccione quién ENTRA.');
           return; 
        } else {
           await recordGenericMatchEvent({
             slug,
             matchId: match.id,
             teamId,
             playerId,
             eventType: 'SUB',
             period: currentPeriod,
             minuteRecord: Math.floor(timerSeconds / 60),
             subOutPlayerId: subOutPlayer,
           });
           if (team === 'HOME') setHomeStartingLineup(prev => prev.map(id => id === subOutPlayer ? playerId : id));
           else setAwayStartingLineup(prev => prev.map(id => id === subOutPlayer ? playerId : id));
           
           toast.success('Sustitución Completada', { icon: '🔄' });
           setScoringAction(null); setSubOutPlayer(null);
           const { data } = await supabase.from('match_events').select('*').eq('match_id', match.id);
           if (data) setLiveEvents(data);
           return;
        }
      }

      if (type !== 'SCORE') {
        await recordGenericMatchEvent({
          slug,
          matchId: match.id,
          teamId,
          playerId: playerId || null,
          eventType: type,
          period: currentPeriod,
          minuteRecord: Math.floor(timerSeconds / 60),
        });
      }

      const { data } = await supabase.from('match_events').select('*').eq('match_id', match.id);
      if (data) setLiveEvents(data);

      if (type === 'SCORE') toast.success('Carrera anotada');
    }

    if (type !== 'SUB') setScoringAction(null);
  };

  const confirmFinishMatch = async () => {
    setShowFinishConfirm(false);
    setLoading(true);
    const toastId = toast.loading('Procesando acta oficial...');

    try {
      await finishCourtMatch({ slug, matchId: match.id, homeScore, awayScore, sport: 'softball' });

      toast.success('Partido finalizado correctamente', { id: toastId });
      onMatchUpdate();
      onClose();
    } catch (error) {
      toast.error('Error al cerrar acta', { id: toastId });
    }
    setLoading(false);
  };

  const homeIsLeading = homeScore > awayScore;
  const awayIsLeading = awayScore > homeScore;
  const isTimeLimitWarning = timerSeconds >= 3300; 
  
  const handleFinishMatchClick = () => {
    if (!isMatchLive) return toast.error('El partido no está activo.');
    pauseTimer().catch(console.error);
    setShowFinishConfirm(true);
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden text-slate-900 font-sans animate-in slide-in-from-right duration-300">
      
      {/* LOBBY PRE-PARTIDO LINEUP */}
      {showStartingLineupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 p-4 sm:p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] w-full max-w-6xl shadow-2xl flex flex-col h-[90vh] sm:h-[85vh] relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 md:mb-6 border-b border-slate-100 pb-4 md:pb-6 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                <div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                    <UsersRound className="text-red-600 w-6 h-6 md:w-8 md:h-8"/> Registro de Lineup
                  </h3>
                  <p className="text-slate-500 font-bold uppercase tracking-widest sm:tracking-[0.2em] text-[8px] md:text-[10px] mt-1 md:mt-2">
                    Mín {minPlayers}, Máx {maxPlayers}
                  </p>
                </div>
                <button onClick={handleQuickStart} className="hidden sm:flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors border border-slate-200">
                  <Zap size={14} className="text-amber-500" /> Partido Rápido
                </button>
              </div>
              <button onClick={() => setShowStartingLineupModal(false)} className="p-2 sm:p-3 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-colors"><X size={20} className="sm:w-6 sm:h-6" /></button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:gap-8 flex-1 overflow-hidden min-h-0">
              <div className="flex-1 flex flex-col h-full bg-slate-50 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 overflow-hidden">
                <div className="p-3 sm:p-4 md:p-6 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm">
                  <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-slate-50 border border-slate-100 rounded-lg sm:rounded-xl flex items-center justify-center p-1.5 shadow-inner shrink-0">
                      {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="text-slate-300" />}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="text-sm sm:text-base md:text-lg font-black uppercase text-slate-900 truncate">{match.home_team.name}</h4>
                      <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Local</p>
                    </div>
                  </div>
                  <div className={`px-2 sm:px-3 py-1 sm:py-2 rounded-lg font-black text-[10px] sm:text-xs uppercase tracking-widest border shrink-0 ${homeStartingLineup.length >= minPlayers ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    {homeStartingLineup.length}/{maxPlayers}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 sm:p-4 scrollbar-hide space-y-1.5 sm:space-y-2">
                  {homeRoster.length === 0 ? <p className="text-center text-slate-400 py-10 font-bold text-[10px] uppercase tracking-widest">Nómina vacía</p> : 
                    homeRoster.map(player => {
                      const isStarter = homeStartingLineup.includes(player.id);
                      return (
                        <button key={player.id} onClick={() => toggleStartingPlayer('HOME', player.id)} className={`w-full flex items-center justify-between p-2 sm:p-3 px-3 sm:px-5 rounded-xl sm:rounded-2xl border transition-all text-left ${isStarter ? 'bg-red-600 text-white border-red-700 shadow-md' : 'bg-white text-slate-700 hover:border-red-400'}`}>
                          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                            <span className={`text-base sm:text-xl font-black ${isStarter ? 'text-red-200' : 'text-slate-400'} w-6 sm:w-8 shrink-0`}>{player.shirt_number || '-'}</span>
                            <span className="font-bold text-xs sm:text-sm uppercase truncate">{player.name}</span>
                          </div>
                          <div className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${isStarter ? 'bg-white border-white text-red-600' : 'border-slate-300'}`}>{isStarter && <CheckCircle2 size={14}/>}</div>
                        </button>
                      );
                  })}
                </div>
              </div>

              <div className="flex-1 flex flex-col h-full bg-slate-50 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 overflow-hidden">
                <div className="p-3 sm:p-4 md:p-6 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm">
                  <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-slate-50 border border-slate-100 rounded-lg sm:rounded-xl flex items-center justify-center p-1.5 shadow-inner shrink-0">
                      {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="text-slate-300" />}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="text-sm sm:text-base md:text-lg font-black uppercase text-slate-900 truncate">{match.away_team.name}</h4>
                      <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visitante</p>
                    </div>
                  </div>
                  <div className={`px-2 sm:px-3 py-1 sm:py-2 rounded-lg font-black text-[10px] sm:text-xs uppercase tracking-widest border shrink-0 ${awayStartingLineup.length >= minPlayers ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    {awayStartingLineup.length}/{maxPlayers}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 sm:p-4 scrollbar-hide space-y-1.5 sm:space-y-2">
                  {awayRoster.length === 0 ? <p className="text-center text-slate-400 py-10 font-bold text-[10px] uppercase tracking-widest">Nómina vacía</p> : 
                    awayRoster.map(player => {
                      const isStarter = awayStartingLineup.includes(player.id);
                      return (
                        <button key={player.id} onClick={() => toggleStartingPlayer('AWAY', player.id)} className={`w-full flex items-center justify-between p-2 sm:p-3 px-3 sm:px-5 rounded-xl sm:rounded-2xl border transition-all text-left ${isStarter ? 'bg-red-600 text-white border-red-700 shadow-md' : 'bg-white text-slate-700 hover:border-red-400'}`}>
                          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                            <span className={`text-base sm:text-xl font-black ${isStarter ? 'text-red-200' : 'text-slate-400'} w-6 sm:w-8 shrink-0`}>{player.shirt_number || '-'}</span>
                            <span className="font-bold text-xs sm:text-sm uppercase truncate">{player.name}</span>
                          </div>
                          <div className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${isStarter ? 'bg-white border-white text-red-600' : 'border-slate-300'}`}>{isStarter && <CheckCircle2 size={14}/>}</div>
                        </button>
                      );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-4 md:pt-6 border-t border-slate-100 mt-4 md:mt-6 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-3 md:gap-4">
              <button onClick={handleQuickStart} className="w-full sm:hidden flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors border border-slate-200">
                <Zap size={16} className="text-amber-500" /> Rápido
              </button>
              <div className="hidden sm:block"></div>
              <button onClick={handleTurnMatchLive} disabled={loading} className="w-full sm:w-auto px-6 md:px-12 py-3 md:py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 md:gap-3 shadow-[0_0_30px_rgba(220,38,38,0.4)] transition-all disabled:opacity-50">
                <FaBaseballBall className="w-4 h-4 md:w-5 md:h-5 animate-spin-slow" /> <span className="truncate">Confirmar y Play Ball</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMAR FIN */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] w-full max-w-sm md:max-w-md shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-4 md:mb-6 shadow-inner"><AlertTriangle size={32} className="md:w-10 md:h-10" /></div>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Cerrar Acta Oficial?</h3>
            <p className="text-slate-500 text-[10px] md:text-sm font-medium mb-6 md:mb-8">El ganador sumará los puntos y el partido quedará oficializado.</p>
            <div className="flex w-full gap-3 md:gap-4">
              <button onClick={() => setShowFinishConfirm(false)} className="flex-1 py-3 md:py-4 bg-slate-100 text-slate-600 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-200">Cancelar</button>
              <button onClick={confirmFinishMatch} disabled={loading} className="flex-1 py-3 md:py-4 bg-red-600 text-white rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-red-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PERIODO */}
      {showPeriodConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] w-full max-w-sm md:max-w-md shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 md:mb-6 shadow-inner"><CalendarDays size={32} className="md:w-10 md:h-10" /></div>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Avanzar al {showPeriodConfirm.targetPeriod}?</h3>
            <p className="text-slate-500 text-[10px] md:text-sm font-medium mb-6 md:mb-8">Recuerde que el cronómetro global de 1 hora seguirá corriendo según reglas.</p>
            <div className="flex w-full gap-3 md:gap-4">
              <button onClick={() => setShowPeriodConfirm({ isOpen: false, targetPeriod: '' })} className="flex-1 py-3 md:py-4 bg-slate-100 text-slate-600 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-200">Mantener</button>
              <button onClick={executePeriodChange} className="flex-1 py-3 md:py-4 bg-blue-600 text-white rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-blue-700">Avanzar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESET RELOJ */}
      {showResetTimerConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] w-full max-w-sm md:max-w-md shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-4 md:mb-6 shadow-inner"><RotateCcw size={32} className="md:w-10 md:h-10" /></div>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Reiniciar Cronómetro?</h3>
            <p className="text-slate-500 text-[10px] md:text-sm font-medium mb-6 md:mb-8">El tiempo volverá a 00:00.</p>
            <div className="flex w-full gap-3 md:gap-4">
              <button onClick={() => setShowResetTimerConfirm(false)} className="flex-1 py-3 md:py-4 bg-slate-100 text-slate-600 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-200">Cancelar</button>
              <button onClick={executeResetTimer} className="flex-1 py-3 md:py-4 bg-amber-50 text-amber-600 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-amber-100">Reiniciar Reloj</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ACCIONES Y SUSTITUCIONES */}
      {scoringAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-4 md:mb-6 border-b border-slate-100 pb-3 md:pb-4 shrink-0">
              <div>
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">
                  {scoringAction.type === 'SCORE' ? 'Registro de Carrera' : 
                   (scoringAction.type === 'SUB' && !subOutPlayer) ? 'Sustitución: Sale ⬇️' : 'Sustitución: Entra ⬆️'}
                </h3>
                <p className="font-black uppercase tracking-widest text-[10px] md:text-xs mt-1 flex items-center gap-1 sm:gap-2 text-slate-500">
                  {scoringAction.type === 'SUB' && <RefreshCcw size={12} className="text-blue-500 sm:w-3.5 sm:h-3.5"/>}
                  <span className="truncate max-w-[200px] sm:max-w-none">{scoringAction.team === 'HOME' ? match.home_team.name : match.away_team.name} • {currentPeriod}</span>
                </p>
              </div>
              <button onClick={() => {setScoringAction(null); setSubOutPlayer(null);}} className="p-2 sm:p-3 bg-slate-100 rounded-lg sm:rounded-xl text-slate-400 hover:text-slate-800"><X size={18} className="sm:w-6 sm:h-6"/></button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 overflow-y-auto pr-1 sm:pr-2 pb-2 sm:pb-4 scrollbar-hide flex-1 min-h-0">
              {(scoringAction.team === 'HOME' ? homeRoster : awayRoster).map(player => {
                const isOut = subOutPlayer === player.id;
                const currentLineup = scoringAction.team === 'HOME' ? homeStartingLineup : awayStartingLineup;
                const isCurrentlyOnPitch = currentLineup.includes(player.id); const eligibility = playerEligibility(player); const isIneligible = eligibility.status === 'INELIGIBLE';
                
                let shouldDisable = false;
                if (scoringAction.type === 'SUB' && !subOutPlayer && !isCurrentlyOnPitch) shouldDisable = true;
                if (scoringAction.type === 'SUB' && subOutPlayer && isCurrentlyOnPitch) shouldDisable = true;

                return (
                  <button 
                    key={player.id} 
                    onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points, player.id)}
                    disabled={isIneligible || shouldDisable}
                    className={`p-3 sm:p-4 md:p-6 rounded-[1rem] md:rounded-[1.5rem] border transition-all flex flex-col items-center group relative shadow-sm
                      ${shouldDisable ? 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-red-400 hover:bg-red-50'}
                      ${isOut ? 'ring-2 sm:ring-4 ring-red-400 scale-95 bg-white' : ''}
                    `}
                  >
                    <span className={`text-2xl sm:text-3xl md:text-4xl font-black transition-colors ${shouldDisable ? 'text-slate-400' : 'text-slate-700 group-hover:text-red-600'}`}>{player.shirt_number || '-'}</span>
                    <span className={`text-[9px] sm:text-[10px] font-bold uppercase mt-1.5 sm:mt-2 md:mt-3 text-center line-clamp-2 leading-tight ${shouldDisable ? 'text-slate-400' : 'text-slate-500 group-hover:text-red-800'}`}>{player.name}</span>
                    {eligibility.status !== 'ELIGIBLE' && <span className={`mt-2 text-[8px] font-black uppercase text-center ${isIneligible ? 'text-red-500' : 'text-amber-600'}`}>{eligibility.reasons[0]?.message}</span>}
                    {scoringAction.type === 'SUB' && (
                       <span className={`mt-1.5 sm:mt-2 px-1.5 sm:px-2 py-0.5 rounded text-[7px] sm:text-[8px] font-black uppercase ${isCurrentlyOnPitch ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                         {isCurrentlyOnPitch ? 'En Cancha' : 'Banca'}
                       </span>
                    )}
                  </button>
                );
              })}
              {(scoringAction.team === 'HOME' ? homeRoster : awayRoster).length === 0 && (
                <div className="col-span-full py-8 sm:py-12 text-center text-slate-400 font-bold uppercase text-[10px] sm:text-xs tracking-widest bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-200">
                  No hay atletas en el line-up.
                </div>
              )}
            </div>

            {scoringAction.type === 'SCORE' && (
              <div className="mt-4 sm:mt-6 flex justify-center gap-4 pt-4 sm:pt-6 border-t border-slate-100 shrink-0">
                <button onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points)} className="px-6 sm:px-8 py-3 sm:py-4 bg-slate-100 text-slate-600 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-xs hover:bg-slate-200 border border-slate-200 transition-colors w-full sm:w-auto">
                  Saltar (Carrera Anónima)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL VER ROSTER */}
      {showRosterModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-start mb-4 md:mb-6 border-b border-slate-100 pb-3 md:pb-4 shrink-0">
              <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-50 rounded-lg md:rounded-xl border border-slate-200 p-1.5 md:p-2 shrink-0">
                   {showRosterModal === 'HOME' && match.home_team.schools.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain" /> : null}
                   {showRosterModal === 'AWAY' && match.away_team.schools.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain" /> : null}
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Line-Up Oficial</h3>
                  <p className="text-red-600 font-bold uppercase tracking-widest text-[9px] sm:text-[10px] mt-1 truncate">{showRosterModal === 'HOME' ? match.home_team.name : match.away_team.name}</p>
                </div>
              </div>
              <button onClick={() => setShowRosterModal(null)} className="p-2 sm:p-3 bg-slate-100 rounded-lg sm:rounded-xl text-slate-400 hover:text-slate-800 shrink-0"><X size={20} className="sm:w-6 sm:h-6"/></button>
            </div>
            <div className="overflow-y-auto pr-1 sm:pr-2 pb-2 sm:pb-4 scrollbar-hide space-y-1.5 sm:space-y-2 flex-1 min-h-0">
              {(showRosterModal === 'HOME' ? homeRoster : awayRoster).map(player => {
                const isStarter = (showRosterModal === 'HOME' ? homeStartingLineup : awayStartingLineup).includes(player.id);
                return (
                  <div key={player.id} className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 sm:gap-4">
                     <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
                       <span className="text-xl sm:text-2xl font-black text-slate-400 w-8 sm:w-10 text-center shrink-0">{player.shirt_number || '-'}</span>
                       <span className="text-xs sm:text-sm font-black text-slate-700 uppercase truncate">{player.name}</span>
                     </div>
                     <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-widest shrink-0 ${isStarter ? 'text-red-500' : 'text-slate-400'}`}>{isStarter ? 'TITULAR' : 'SUPLENTE'}</span>
                  </div>
                )
              })}
              {(showRosterModal === 'HOME' ? homeRoster : awayRoster).length === 0 && (
                <div className="py-8 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nómina vacía</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CABECERA OFICIAL BROADCAST */}
      <div className="bg-white px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 border-b border-slate-200 flex items-center justify-between shadow-sm z-30 relative gap-2 sm:gap-4 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 w-1/4">
          <button onClick={onClose} aria-label="Volver a mesas" className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[8px] font-black uppercase tracking-widest text-slate-500 shadow-sm hover:bg-slate-100 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-3"><ArrowLeft className="h-5 w-5" /><span className="hidden sm:inline">Mesas</span></button>
          {categoryData?.tournaments?.logo_url && <img src={categoryData.tournaments.logo_url} alt="Torneo" className="h-8 sm:h-10 md:h-14 w-auto object-contain hidden sm:block" />}
        </div>
        <div className="w-2/4 text-center flex flex-col items-center overflow-hidden">
          <h2 className="text-xl sm:text-3xl md:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-0.5 sm:mb-1 md:mb-2 flex items-center justify-center gap-1.5 sm:gap-3 w-full">
             <FaBaseballBall className="text-red-600 shrink-0 w-4 h-4 sm:w-6 sm:h-6 md:w-auto md:h-auto" /> <span className="truncate">BÉISBOL / SÓFTBOL</span>
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
             <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-slate-100 rounded-md sm:rounded-lg text-[7px] sm:text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] sm:tracking-[0.2em] max-w-[100px] sm:max-w-none truncate">{categoryData?.tournaments?.name}</span>
             <span className="text-[7px] sm:text-[9px] md:text-xs text-red-600 font-black uppercase tracking-wider md:tracking-widest hidden sm:inline truncate max-w-[80px] sm:max-w-none">{categoryData?.name}</span>
          </div>
        </div>
        <div className="w-1/4 flex justify-end">
          <div className="flex items-center justify-end gap-1.5 sm:gap-3 sm:flex">
             {isMatchLive && isTimerRunning && <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)] mr-0.5 sm:mr-1 hidden sm:block shrink-0"></span>}
             
             {isTimerRunning && timerSeconds >= 3300 && (
               <span className="text-red-500 text-[8px] sm:text-[10px] font-black uppercase tracking-widest animate-pulse mr-1 sm:mr-2 hidden md:block">¡Límite!</span>
             )}

             <div className={`flex items-center rounded-xl md:rounded-[1.2rem] p-1.5 sm:p-2 shadow-sm border shrink-0 ${timerSeconds >= 3300 ? 'bg-red-50 border-red-200' : 'bg-slate-950 border-slate-800'}`}>
                <div className={`px-2 sm:px-3 md:px-5 py-1 sm:py-2 rounded-lg sm:rounded-xl mr-1 sm:mr-2 ${timerSeconds >= 3300 ? 'bg-red-100' : 'bg-slate-900'}`}>
                  <span className={`text-lg sm:text-2xl md:text-3xl font-black tabular-nums tracking-wider leading-none ${timerSeconds >= 3300 ? 'text-red-600' : 'text-white'}`}>
                    {formatTime(timerSeconds)}
                  </span>
                </div>
                <button onClick={handleToggleTimer} className={`p-1.5 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl transition-all shadow-md ${isTimerRunning ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
                  {isTimerRunning ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 md:w-auto md:h-auto" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 md:w-auto md:h-auto" />}
                </button>
                <button onClick={() => setShowResetTimerConfirm(true)} className="p-1.5 sm:p-2 md:p-3 ml-0.5 sm:ml-1 text-slate-400 hover:text-slate-600 transition-colors hidden sm:block"><RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 md:w-auto md:h-auto" /></button>
             </div>
          </div>
        </div>
      </div>

      {/* SELECTOR DE INNINGS */}
      <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 py-2 sm:py-3 z-20 w-full flex justify-start sm:justify-center overflow-x-auto scrollbar-hide shadow-sm gap-1.5 sm:gap-2 px-2 sm:px-0 shrink-0">
         {['INN 1', 'INN 2', 'INN 3', 'INN 4', 'INN 5', 'INN 6', 'INN 7', 'EXTRA'].map(p => (
           <button
              key={p}
              onClick={() => requestPeriodChange(p)}
              disabled={!isMatchLive}
              className={`px-3 sm:px-4 md:px-6 py-1 sm:py-1.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-wider md:tracking-widest border md:border-2 transition-all shadow-sm shrink-0 ${currentPeriod === p ? 'bg-red-600 text-white border-red-600 scale-105 shadow-red-200' : 'bg-white text-slate-500 border-slate-200 hover:text-red-600 hover:border-red-200 disabled:opacity-50'}`}
           >
             {p}
           </button>
         ))}
      </div>

      {/* CANCHA */}
      <div className="flex-1 flex flex-col md:flex-row items-stretch relative z-0 bg-[url('/bg-softbol.jpg')] bg-cover bg-center overflow-hidden">
        <div className="absolute inset-0 bg-white/70 md:bg-white/50 z-0 backdrop-blur-[1px]"></div>

        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 flex items-center justify-center pointer-events-none">
          {!isMatchLive ? (
            <button onClick={handlePreMatchSetup} className="pointer-events-auto flex flex-col items-center justify-center gap-1 sm:gap-2 w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 bg-red-600 rounded-full text-white shadow-[0_0_40px_rgba(220,38,38,0.5)] hover:bg-red-500 hover:scale-105 active:scale-95 transition-all border-2 sm:border-4 border-white animate-pulse">
              <Radio className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" />
              <span className="font-black uppercase tracking-widest text-[9px] sm:text-xs md:text-sm text-center px-2 sm:px-4 leading-tight">Cantar Play Ball</span>
            </button>
          ) : (
            <div className="hidden md:flex w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white/90 backdrop-blur-sm border-4 border-white rounded-full items-center justify-center shadow-xl">
              <span className="text-xl sm:text-2xl md:text-3xl font-black text-slate-400 italic tracking-tighter">VS</span>
            </div>
          )}
        </div>

        {/* LOCAL */}
        <div className={`flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 border-b md:border-b-0 md:border-r border-slate-300/50 relative z-10 transition-opacity duration-300 ${!isMatchLive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {match.home_team?.schools?.logo_url && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15 overflow-hidden z-0">
                <img src={match.home_team.schools.logo_url} className="w-3/4 h-3/4 max-w-[400px] object-contain mix-blend-normal blur-[2px]" />
             </div>
          )}
          
          <div className="h-6 sm:h-8 mb-1 sm:mb-2 z-10">
            {homeScore > awayScore && isMatchLive && (
              <span className="flex items-center gap-1 text-amber-600 font-black text-[8px] sm:text-[10px] uppercase tracking-widest bg-amber-50 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border border-amber-200 shadow-sm animate-pulse">
                <Flame size={10} className="sm:w-3 sm:h-3"/> Ganando
              </span>
            )}
          </div>

          <button onClick={() => setShowRosterModal('HOME')} disabled={!isMatchLive} className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 bg-white/90 backdrop-blur-md rounded-2xl md:rounded-3xl border border-white flex items-center justify-center p-3 sm:p-4 md:p-6 shadow-xl mb-2 sm:mb-4 md:mb-6 z-10 overflow-hidden relative hover:scale-105 transition-transform cursor-pointer shrink-0">
            {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain drop-shadow-md relative z-10" /> : <School className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-slate-300" />}
            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-slate-100 text-slate-400 p-1 sm:p-1.5 rounded-full shadow-inner"><UsersRound size={10} className="sm:w-3 sm:h-3"/></div>
          </button>
          
          <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-black text-slate-900 uppercase tracking-tighter text-center mb-0.5 sm:mb-1 md:mb-2 drop-shadow-md leading-none bg-white/70 px-3 sm:px-4 md:px-6 py-1 sm:py-1.5 md:py-2 rounded-xl sm:rounded-2xl md:rounded-3xl backdrop-blur-md border border-white max-w-[95%] sm:max-w-[90%] truncate z-10 shrink-0">{match.home_team?.name}</h3>
          <p className="text-slate-600 font-black text-[9px] sm:text-xs md:text-sm uppercase tracking-[0.2em] mb-2 sm:mb-4 z-10 bg-white/50 px-3 py-1 rounded-full shrink-0">Local</p>

          <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-4 md:mb-8 bg-white/80 backdrop-blur-md p-1.5 sm:p-2 rounded-xl sm:rounded-2xl shadow-xl border border-white z-10 shrink-0">
            <button onClick={() => handleRefereeAction('HOME', 'SUB')} disabled={!isMatchLive} className="w-10 h-8 sm:w-12 sm:h-10 md:w-14 md:h-12 bg-slate-900 border border-slate-800 rounded-lg sm:rounded-xl shadow-sm hover:bg-slate-800 text-white flex items-center justify-center disabled:opacity-50 transition-colors" title="Cambio de Jugador">
              <RefreshCcw size={14} className="sm:w-4 sm:h-4 md:w-5 md:h-5" />
            </button>
          </div>

          <p className="text-[8px] sm:text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10 bg-white/80 backdrop-blur px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-slate-200 shadow-sm shrink-0 hidden sm:block">Carreras</p>
          <div className="flex-1 flex items-center justify-center w-full min-h-0 z-10 my-1 sm:my-2 md:my-0">
             <span className={`text-[8rem] sm:text-[10rem] md:text-[12rem] lg:text-[14rem] xl:text-[16rem] leading-none font-black tabular-nums text-center drop-shadow-2xl transition-colors ${(homeScore > awayScore) && isMatchLive ? 'text-slate-900' : 'text-slate-700/80'}`}>
               {homeScore}
             </span>
          </div>
          
          <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4 z-10 bg-white/60 backdrop-blur-md p-2 sm:p-3 md:p-4 rounded-2xl md:rounded-[2rem] border border-white shadow-xl w-full max-w-[200px] sm:max-w-[250px] md:max-w-xs shrink-0 mt-auto mb-2 sm:mb-0">
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE_MINUS', -1)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center text-red-500 border-2 border-slate-100 shadow-md active:scale-95 transition-all disabled:opacity-50 shrink-0"><Minus size={20} className="sm:w-6 sm:h-6 md:w-8 md:h-8" /></button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', 1)} className="flex-1 h-12 sm:h-14 md:h-16 bg-red-600 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-red-300 border border-red-500 disabled:opacity-50">
               <span className="font-black text-xl sm:text-2xl md:text-3xl leading-none">+1</span><span className="text-[6px] sm:text-[7px] md:text-[8px] font-black uppercase opacity-80 mt-0.5">Carrera</span>
            </button>
          </div>
        </div>

        {/* === VISITANTE === */}
        <div className={`flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 relative z-10 transition-opacity duration-300 ${!isMatchLive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {match.away_team?.schools?.logo_url && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15 overflow-hidden z-0">
                <img src={match.away_team.schools.logo_url} className="w-3/4 h-3/4 max-w-[400px] object-contain mix-blend-normal blur-[2px]" />
             </div>
          )}

          <div className="h-6 sm:h-8 mb-1 sm:mb-2 z-10">
            {awayScore > homeScore && isMatchLive && (
              <span className="flex items-center gap-1 text-amber-600 font-black text-[8px] sm:text-[10px] uppercase tracking-widest bg-amber-50 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border border-amber-200 shadow-sm animate-pulse">
                <Flame size={10} className="sm:w-3 sm:h-3"/> Ganando
              </span>
            )}
          </div>

          <button onClick={() => setShowRosterModal('AWAY')} disabled={!isMatchLive} className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 bg-white/90 backdrop-blur-md rounded-3xl border border-white flex items-center justify-center p-3 sm:p-4 md:p-6 shadow-xl mb-2 sm:mb-4 md:mb-6 z-10 overflow-hidden relative hover:scale-105 transition-transform cursor-pointer shrink-0">
            {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain relative z-10 drop-shadow-md" /> : <School className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-slate-300" />}
            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-slate-100 text-slate-400 p-1 sm:p-1.5 rounded-full shadow-inner"><UsersRound size={10} className="sm:w-3 sm:h-3"/></div>
          </button>
          
          <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-black text-slate-900 uppercase tracking-tighter text-center mb-0.5 sm:mb-1 md:mb-2 drop-shadow-md leading-none bg-white/70 px-3 sm:px-4 md:px-6 py-1 sm:py-1.5 md:py-2 rounded-xl sm:rounded-2xl md:rounded-3xl backdrop-blur-md border border-white max-w-[95%] sm:max-w-[90%] truncate z-10 shrink-0">{match.away_team?.name}</h3>
          <p className="text-slate-600 font-black text-[9px] sm:text-xs md:text-sm uppercase tracking-[0.2em] mb-2 sm:mb-4 z-10 bg-white/50 px-3 py-1 rounded-full shrink-0">Visitante</p>

          <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-4 md:mb-8 bg-white/80 backdrop-blur-md p-1.5 sm:p-2 rounded-xl sm:rounded-2xl shadow-xl border border-white z-10 shrink-0">
            <button onClick={() => handleRefereeAction('AWAY', 'SUB')} disabled={!isMatchLive} className="w-10 h-8 sm:w-12 sm:h-10 md:w-14 md:h-12 bg-slate-900 border border-slate-800 rounded-lg sm:rounded-xl shadow-sm hover:bg-slate-800 text-white flex items-center justify-center disabled:opacity-50 transition-colors" title="Cambio de Jugador">
              <RefreshCcw size={14} className="sm:w-4 sm:h-4 md:w-5 md:h-5" />
            </button>
          </div>
          
          <p className="text-[8px] sm:text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest z-10 bg-white/80 backdrop-blur px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-slate-200 shadow-sm shrink-0 hidden sm:block">Carreras</p>
          <div className="flex-1 flex items-center justify-center w-full min-h-0 z-10 my-1 sm:my-2 md:my-0">
             <span className={`text-[8rem] sm:text-[10rem] md:text-[12rem] lg:text-[14rem] xl:text-[16rem] leading-none font-black tabular-nums text-center drop-shadow-2xl transition-colors ${(awayScore > homeScore) && isMatchLive ? 'text-slate-900' : 'text-slate-700/80'}`}>
               {awayScore}
             </span>
          </div>
          
          <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4 z-10 bg-white/60 backdrop-blur-md p-2 sm:p-3 md:p-4 rounded-2xl md:rounded-[2rem] border border-white shadow-xl w-full max-w-[200px] sm:max-w-[250px] md:max-w-xs shrink-0 mt-auto mb-2 sm:mb-0">
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE_MINUS', -1)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center text-red-500 border-2 border-slate-100 shadow-md active:scale-95 transition-all disabled:opacity-50 shrink-0"><Minus size={20} className="sm:w-6 sm:h-6 md:w-8 md:h-8" /></button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', 1)} className="flex-1 h-12 sm:h-14 md:h-16 bg-red-600 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-md shadow-red-300 border border-red-500 disabled:opacity-50">
               <span className="font-black text-2xl md:text-3xl leading-none">+1</span><span className="text-[6px] sm:text-[7px] md:text-[8px] font-black uppercase opacity-80 mt-0.5">Carrera</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 md:p-6 bg-slate-950 relative z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] shrink-0">
        <button onClick={handleFinishMatchClick} disabled={loading || !isMatchLive} className="w-full py-4 sm:py-5 md:py-6 bg-slate-800 hover:bg-slate-700 rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg md:text-xl text-white uppercase tracking-widest flex items-center justify-center gap-3 sm:gap-4 active:scale-[0.98] transition-all shadow-lg border border-slate-700 disabled:opacity-30">
          <CheckCircle2 className="text-red-400 w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7"/> <span className="truncate">Finalizar Acta de Béisbol</span>
        </button>
      </div>
    </div>
  );
}
