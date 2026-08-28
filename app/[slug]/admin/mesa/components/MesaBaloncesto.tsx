'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../../supabase';
import { ArrowLeft, CheckCircle2, Play, Pause, RotateCcw, Minus, Plus, School, CalendarDays, X, Flame, AlertTriangle, Radio, RefreshCcw, Hand, Timer, ArrowRight, BellRing } from 'lucide-react';
import toast from 'react-hot-toast';
import { FaBasketballBall } from 'react-icons/fa';
import { useCountdownMatchTimer } from '../hooks/useCountdownMatchTimer';
import { finishCourtMatch, recordGenericMatchEvent, startLiveMatch } from '../actions';
import { evaluatePlayerEligibility } from '@/app/lib/competition/player-eligibility';

interface MesaBaloncestoProps {
  match: any;
  categoryData: any;
  slug: string;
  onClose: () => void;
  onMatchUpdate: () => void;
}

export default function MesaBaloncesto({ match, categoryData, slug, onClose, onMatchUpdate }: MesaBaloncestoProps) {
  const [homeScore, setHomeScore] = useState(match.home_score || 0);
  const [awayScore, setAwayScore] = useState(match.away_score || 0);
  const [currentPeriod, setCurrentPeriod] = useState(match.current_period || 'Q1');
  const [isMatchLive, setIsMatchLive] = useState(match.status === 'LIVE');

  const [homeRoster, setHomeRoster] = useState<any[]>([]);
  const [awayRoster, setAwayRoster] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showPeriodConfirm, setShowPeriodConfirm] = useState<{ isOpen: boolean; targetPeriod: string }>({ isOpen: false, targetPeriod: '' });
  const [showResetTimerConfirm, setShowResetTimerConfirm] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState<'HOME' | 'AWAY' | null>(null);

  const [scoringAction, setScoringAction] = useState<{ team: 'HOME' | 'AWAY', type: 'SCORE' | 'FOUL' | 'SUB', points: number } | null>(null);
  const [subOutPlayer, setSubOutPlayer] = useState<string | null>(null);
  const playerEligibility = (player: any) => evaluatePlayerEligibility({ playerId: player.id, registered: true, teamId: player.team_id, documents: player.player_documents || [], suspended: liveEvents.some((event) => event.player_id === player.id && event.event_type === 'RED'), unpaidFine: liveEvents.some((event) => event.player_id === player.id && event.fine_status === 'UNPAID') });

  const {
    timerSeconds,
    isTimerRunning,
    toggleTimer,
    pauseTimer,
    resetTimer,
  } = useCountdownMatchTimer(slug, match.id, {
    is_timer_running: match.is_timer_running || false,
    timer_start_time: match.timer_start_time || null,
    timer_accumulated_seconds: match.timer_accumulated_seconds || 0,
    match_duration_seconds: match.match_duration_seconds || (match.home_sets !== null ? match.home_sets : 600),
    home_sets: match.home_sets !== null ? match.home_sets : 600,
  }, currentPeriod === 'TE' ? 300 : 600);

  const [timeoutOverlay, setTimeoutOverlay] = useState<{ active: boolean, seconds: number, team: string }>({ active: false, seconds: 0, team: '' });
  const timeoutIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [bonusOverlay, setBonusOverlay] = useState<{ active: boolean, team: string }>({ active: false, team: '' });

  useEffect(() => {
    async function loadData() {
      if (match.status !== 'LIVE' && match.status !== 'FINISHED') {
         setHomeScore(0);
         setAwayScore(0);
      }

      const { data: homeP } = await supabase.from('players').select('*').eq('team_id', match.home_team.id).order('shirt_number');
      const { data: awayP } = await supabase.from('players').select('*').eq('team_id', match.away_team.id).order('shirt_number');
      setHomeRoster(homeP || []);
      setAwayRoster(awayP || []);

      const { data: eventsP } = await supabase.from('match_events').select('*').eq('match_id', match.id);
      setLiveEvents(eventsP || []);
    }
    loadData();
  }, [match.id, match.status]);

  useEffect(() => {
    if (timeoutOverlay.active) {
      timeoutIntervalRef.current = setInterval(() => {
        setTimeoutOverlay(prev => {
          if (prev.seconds <= 1) {
            clearInterval(timeoutIntervalRef.current!);
            return { active: false, seconds: 0, team: '' };
          }
          return { ...prev, seconds: prev.seconds - 1 };
        });
      }, 1000);
    }
    return () => { if (timeoutIntervalRef.current) clearInterval(timeoutIntervalRef.current); };
  }, [timeoutOverlay.active]);

  const executeResetTimer = async () => {
    const newTime = currentPeriod === 'TE' ? 300 : 600;
    await resetTimer(newTime, currentPeriod);
    setShowResetTimerConfirm(false);
    toast.success('Cronómetro reiniciado');
  };

  const handleToggleTimer = async () => {
    if (!isMatchLive) return toast.error('Debes arrancar el partido primero.');
    await toggleTimer();
  };

  const executeTimeout = async (team: 'HOME' | 'AWAY', teamName: string) => {
    if (!isMatchLive) return toast.error('El partido no está en vivo.');
    await pauseTimer();
    
    setTimeoutOverlay({ active: true, seconds: 60, team: teamName });
    recordGenericMatchEvent({
      slug,
      matchId: match.id,
      teamId: team === 'HOME' ? match.home_team.id : match.away_team.id,
      eventType: 'TIMEOUT',
      period: currentPeriod,
      minuteRecord: Math.floor(timerSeconds / 60),
    }).catch(console.error);
  };

  const resumeFromTimeout = async () => {
    setTimeoutOverlay({ active: false, seconds: 0, team: '' });
    if (!isTimerRunning) await handleToggleTimer();
    toast.success('Partido Reanudado', { icon: '⏱️' });
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleTurnMatchLive = async () => {
    const toastId = toast.loading('Iniciando transmisión...');
    try {
      await startLiveMatch({ slug, matchId: match.id, period: 'Q1', resetScores: true });
      
      setLiveEvents([]); 
      setHomeScore(0);
      setAwayScore(0);
      setIsMatchLive(true);
      setCurrentPeriod('Q1');
      await resetTimer(600, 'Q1');
      await toggleTimer();
      toast.success('¡Salto Inicial! Todo listo.', { id: toastId, icon: '🏀' });
    } catch (err: any) {
      toast.error(`Error al iniciar: ${err.message}`, { id: toastId });
    }
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
    const newTime = period === 'TE' ? 300 : 600;
    await resetTimer(newTime, period);
    setShowPeriodConfirm({ isOpen: false, targetPeriod: '' });
    toast.success(`Cuarto actualizado: ${period}. Presione Play para reanudar.`);
  };

  const handleRefereeAction = (team: 'HOME' | 'AWAY', type: 'SCORE' | 'FOUL' | 'SUB', points: number = 0) => {
    if (!isMatchLive) return toast.error('Inicie transmisión primero.');
    if (points < 0) {
      executeActionRecord(team, type, points); 
      return;
    }
    setSubOutPlayer(null);
    setScoringAction({ team, type, points });
  };

  const executeActionRecord = async (team: 'HOME' | 'AWAY', type: 'SCORE' | 'FOUL' | 'SUB', points: number, playerId?: string) => {
    if (playerId || type === 'SCORE' || type === 'FOUL') {
      let eventType = 'FOUL';
      if (type === 'SCORE') {
        if (points === 1) eventType = 'BASKET_1';
        else if (points === 2) eventType = 'BASKET_2';
        else if (points === 3) eventType = 'BASKET_3';
        else eventType = 'SCORE_ADJUST';
      }

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
           toast.success('Sustitución Completada', { icon: '🔄' });
           setScoringAction(null); setSubOutPlayer(null);
           const { data } = await supabase.from('match_events').select('*').eq('match_id', match.id);
           if (data) setLiveEvents(data);
           return;
        }
      }

      if (type !== 'SUB') {
        const result = await recordGenericMatchEvent({
          slug,
          matchId: match.id,
          teamId,
          playerId: playerId || null,
          eventType,
          period: currentPeriod,
          minuteRecord: Math.floor(timerSeconds / 60),
          scoreDelta: type === 'SCORE' ? points : 0,
        });

        if (typeof result?.home_score === 'number') setHomeScore(result.home_score);
        if (typeof result?.away_score === 'number') setAwayScore(result.away_score);

        const { data } = await supabase.from('match_events').select('*').eq('match_id', match.id);
        const updatedEvents = data || [];
        setLiveEvents(updatedEvents);

        if (type === 'SCORE') toast.success('Canasta registrada');
        if (type === 'FOUL') {
          toast.error(playerId ? 'Falta personal registrada' : 'Falta de equipo registrada');
          
          // TRIGGER: Notificación de Bonus (5ta falta y TODAS las superiores en el cuarto actual)
          const currentFouls = updatedEvents.filter(e => e.team_id === teamId && e.event_type === 'FOUL' && e.period === currentPeriod).length;
          
          if (currentFouls >= 5) {
            pauseTimer().catch(console.error);
            
            setBonusOverlay({ active: true, team: team === 'HOME' ? match.home_team.name : match.away_team.name });
            setTimeout(() => setBonusOverlay({ active: false, team: '' }), 8000); 
          }
        }
      }
    }
    if (type !== 'SUB') setScoringAction(null);
  };

  const handleFinishMatchClick = () => {
    if (!isMatchLive) return toast.error('El partido no está activo.');
    pauseTimer().catch(console.error);
    setShowFinishConfirm(true);
  };

  const confirmFinishMatch = async () => {
    setShowFinishConfirm(false);
    setLoading(true);
    const toastId = toast.loading('Procesando acta FIBA...');

    try {
      await finishCourtMatch({ slug, matchId: match.id, homeScore, awayScore, sport: 'basketball' });

      toast.success('Partido finalizado. Puntos asignados.', { id: toastId });
      onMatchUpdate();
      onClose();
    } catch (error) {
      toast.error('Error al cerrar acta', { id: toastId });
    }
    setLoading(false);
  };

  const isFinalPeriod = currentPeriod === 'Q4' || currentPeriod === 'TE';

  const handleSmartBottomAction = () => {
    if (!isMatchLive) return;
    if (isFinalPeriod) {
      handleFinishMatchClick();
    } else {
      const periods = ['Q1', 'Q2', 'Q3', 'Q4', 'TE'];
      const nextIdx = periods.indexOf(currentPeriod) + 1;
      if (nextIdx < periods.length) {
         requestPeriodChange(periods[nextIdx]);
      }
    }
  };

  const homeFoulsQ = liveEvents.filter(e => e.team_id === match.home_team.id && e.event_type === 'FOUL' && e.period === currentPeriod).length;
  const awayFoulsQ = liveEvents.filter(e => e.team_id === match.away_team.id && e.event_type === 'FOUL' && e.period === currentPeriod).length;

  const homeIsLeading = homeScore > awayScore;
  const awayIsLeading = awayScore > homeScore;

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden text-slate-900 font-sans animate-in slide-in-from-right duration-300">
      
      {/* OVERLAY TIEMPO FUERA */}
      {timeoutOverlay.active && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center text-white p-8 text-center animate-in zoom-in-95 duration-300">
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4 text-amber-500">Tiempo Fuera</h2>
          <p className="text-base sm:text-xl md:text-2xl font-bold tracking-widest text-slate-300 uppercase mb-8 md:mb-12">Solicitado por: {timeoutOverlay.team}</p>
          <div className="text-8xl sm:text-[10rem] md:text-[20rem] font-black leading-none tabular-nums animate-pulse drop-shadow-[0_0_50px_rgba(245,158,11,0.5)]">
            {timeoutOverlay.seconds}
          </div>
          <button onClick={resumeFromTimeout} className="mt-10 md:mt-16 px-6 sm:px-12 py-4 sm:py-6 bg-white text-slate-900 rounded-2xl sm:rounded-3xl font-black text-sm sm:text-xl uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center gap-3">
            <Play size={24} /> Reanudar Reloj Oficial
          </button>
        </div>
      )}

      {/* OVERLAY NOTIFICACIÓN DE BONUS - ROJO TRANSLÚCIDO 60% */}
      {bonusOverlay.active && (
        <div className="fixed inset-0 z-[9999] bg-red-600/60 backdrop-blur-md flex flex-col items-center justify-center text-white p-8 text-center animate-in fade-in duration-300 cursor-pointer" onClick={() => setBonusOverlay({active: false, team: ''})}>
          <div className="w-32 h-32 bg-white/30 rounded-full flex items-center justify-center mb-8 animate-bounce shadow-2xl border-4 border-white">
             <BellRing size={64} className="text-white drop-shadow-lg" />
          </div>
          <h2 className="text-4xl sm:text-6xl md:text-8xl lg:text-[10rem] font-black uppercase tracking-tighter mb-6 drop-shadow-2xl text-center text-white leading-none">¡ESTADO DE BONUS!</h2>
          <p className="text-lg sm:text-2xl md:text-4xl lg:text-5xl font-bold tracking-widest text-white uppercase mb-12 text-center drop-shadow-md">
            <span className="font-black text-white">{bonusOverlay.team}</span> está en penalización
          </p>
          <p className="text-xl md:text-3xl font-black uppercase tracking-[0.3em] bg-black/60 border border-white/20 px-12 py-6 rounded-full text-center text-white shadow-2xl">
            Tiros de Castigo a partir de ahora
          </p>
        </div>
      )}

      {/* MODALES CONFIRMACIÓN */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 shadow-inner"><AlertTriangle size={40} /></div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Cerrar Acta?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8">Se adjudicarán los puntos oficiales FIBA y se cerrará el encuentro.</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowFinishConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200">Cancelar</button>
              <button onClick={confirmFinishMatch} disabled={loading} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {showPeriodConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-6 shadow-inner"><CalendarDays size={40} /></div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Iniciar {showPeriodConfirm.targetPeriod}?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8">El reloj se reiniciará para el nuevo cuarto. Las faltas de equipo se limpiarán.</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowPeriodConfirm({ isOpen: false, targetPeriod: '' })} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200">Mantener Actual</button>
              <button onClick={executePeriodChange} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700">Sí, Avanzar</button>
            </div>
          </div>
        </div>
      )}

      {showResetTimerConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-6 shadow-inner"><RotateCcw size={40} /></div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Reiniciar Cronómetro?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8">El reloj volverá a los minutos iniciales. Las anotaciones no se borrarán.</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowResetTimerConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200">Cancelar</button>
              <button onClick={executeResetTimer} className="flex-1 py-4 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-amber-600">Reiniciar Reloj</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL JUGADORES */}
      {scoringAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                  {scoringAction.type === 'SCORE' ? 'Registro de Canasta' : 
                   scoringAction.type === 'FOUL' ? 'Falta Personal' : 
                   (scoringAction.type === 'SUB' && !subOutPlayer) ? 'Sustitución: Seleccione quién SALE ⬇️' : 'Sustitución: Seleccione quién ENTRA ⬆️'}
                </h3>
                <p className="font-black uppercase tracking-widest text-xs mt-1 flex items-center gap-2">
                  {scoringAction.type === 'SUB' && <RefreshCcw size={14} className="text-blue-500"/>}
                  {scoringAction.type === 'FOUL' && <Hand size={14} className="text-orange-500"/>}
                  <span className="text-slate-500">
                    {scoringAction.team === 'HOME' ? match.home_team.name : match.away_team.name} • {currentPeriod}
                  </span>
                </p>
              </div>
              <button onClick={() => {setScoringAction(null); setSubOutPlayer(null);}} className="p-3 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800"><X size={24}/></button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-4 scrollbar-hide">
              {(scoringAction.team === 'HOME' ? homeRoster : awayRoster).map(player => {
                const playerFouls = liveEvents.filter(e => e.player_id === player.id && e.event_type === 'FOUL').length;
                const isFouledOut = playerFouls >= 5; const eligibility = playerEligibility(player); const isIneligible = eligibility.status === 'INELIGIBLE';
                const isOut = subOutPlayer === player.id;
                
                return (
                  <button 
                    key={player.id} 
                    onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points, player.id)}
                    disabled={isIneligible || (isFouledOut && scoringAction.type !== 'SUB')}
                    className={`p-6 rounded-[1.5rem] border transition-all flex flex-col items-center group relative shadow-sm
                      ${isFouledOut ? 'bg-red-50 border-red-200 opacity-50' : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50'}
                      ${isOut ? 'ring-4 ring-red-400 scale-95' : ''}
                    `}
                  >
                    {playerFouls > 0 && (
                      <div className="absolute top-4 right-4 flex gap-1 items-center bg-orange-100 px-2 py-0.5 rounded text-[10px] font-black text-orange-600">
                         {playerFouls}F
                      </div>
                    )}
                    <span className={`text-4xl font-black transition-colors ${isFouledOut ? 'text-red-400' : 'text-slate-700 group-hover:text-blue-600'}`}>{player.shirt_number || '-'}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase mt-3 text-center line-clamp-2 leading-tight">{player.name}</span>
                    {eligibility.status !== 'ELIGIBLE' && <span className={`mt-2 text-[8px] font-black uppercase text-center ${isIneligible ? 'text-red-500' : 'text-amber-600'}`}>{eligibility.reasons[0]?.message}</span>}
                  </button>
                );
              })}
            </div>
            
            {/* BOTÓN DE ACCIÓN ANÓNIMA */}
            {scoringAction.type !== 'SUB' && (
              <div className="mt-6 flex justify-center gap-4 pt-6 border-t border-slate-100 shrink-0">
                <button 
                  onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points)} 
                  className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 border border-slate-200 transition-colors"
                >
                  Saltar ({scoringAction.type === 'FOUL' ? 'Falta de Equipo' : 'Canasta Anónima'})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL VER ROSTER */}
      {showRosterModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-200 p-2">
                   {showRosterModal === 'HOME' && match.home_team.schools.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain" /> : null}
                   {showRosterModal === 'AWAY' && match.away_team.schools.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain" /> : null}
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Nómina Oficial</h3>
                  <p className="text-blue-600 font-bold uppercase tracking-widest text-[10px] mt-1">{showRosterModal === 'HOME' ? match.home_team.name : match.away_team.name}</p>
                </div>
              </div>
              <button onClick={() => setShowRosterModal(null)} className="p-3 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800"><X size={24}/></button>
            </div>
            <div className="overflow-y-auto pr-2 pb-4 scrollbar-hide space-y-2">
              {(showRosterModal === 'HOME' ? homeRoster : awayRoster).map(player => {
                const pFouls = liveEvents.filter(e => e.player_id === player.id && e.event_type === 'FOUL').length;
                return (
                  <div key={player.id} className={`p-4 rounded-2xl border flex items-center justify-between ${pFouls >= 5 ? 'bg-red-50 border-red-200 opacity-70' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-4">
                       <span className={`text-2xl font-black ${pFouls >= 5 ? 'text-red-400' : 'text-slate-400'} w-10 text-center`}>{player.shirt_number || '-'}</span>
                       <span className="text-sm font-black text-slate-700 uppercase">{player.name}</span>
                    </div>
                    {pFouls > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-md">{pFouls} Faltas</span>
                        {pFouls >= 5 && <span className="text-[10px] font-black text-white bg-red-600 px-2 py-1 rounded-md">EXPULSADO</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* CABECERA OFICIAL */}
      <div className="bg-white px-4 md:px-8 py-3 md:py-5 border-b border-slate-200 flex items-center justify-between shadow-sm z-30 relative shrink-0">
        <div className="flex items-center gap-4 w-1/4">
          <button onClick={onClose} className="p-3 bg-slate-50 text-slate-500 rounded-xl hover:bg-slate-100 shadow-sm border border-slate-200"><ArrowLeft size={24} /></button>
          {categoryData?.tournaments?.logo_url && <img src={categoryData.tournaments.logo_url} alt="Torneo" className="h-12 md:h-16 lg:h-20 w-auto object-contain hidden sm:block" />}
        </div>
        <div className="w-2/4 text-center flex flex-col items-center">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1 md:mb-2 flex items-center gap-3">
             <FaBasketballBall className="text-orange-500" /> BALONCESTO
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
             <span className="px-3 py-1 bg-slate-100 rounded-lg text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{categoryData?.tournaments?.name}</span>
             <span className="text-[9px] md:text-xs text-blue-600 font-black uppercase tracking-widest">{categoryData?.name}</span>
          </div>
        </div>
        <div className="w-1/4 flex justify-end">
          <div className="flex items-center justify-end gap-2 md:gap-3">
             {isMatchLive && isTimerRunning && <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)] mr-1 hidden sm:block"></span>}
             <div className="flex items-center bg-slate-950 rounded-[1.2rem] p-1.5 md:p-2 shadow-xl border border-slate-800">
                <div className="px-3 md:px-5 py-2 bg-slate-900 rounded-xl mr-1 md:mr-2">
                  <span className={`text-xl md:text-3xl font-black tabular-nums tracking-wider leading-none drop-shadow-md ${timerSeconds <= 60 && timerSeconds > 0 ? 'text-amber-400 animate-pulse' : timerSeconds === 0 ? 'text-red-500' : 'text-white'}`}>
                    {formatTime(timerSeconds)}
                  </span>
                </div>
                <button onClick={handleToggleTimer} className={`p-2.5 md:p-3 rounded-xl transition-all shadow-md ${isTimerRunning ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
                  {isTimerRunning ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button onClick={() => setShowResetTimerConfirm(true)} className="p-2.5 md:p-3 ml-1 text-slate-400 hover:text-white transition-colors hidden sm:block"><RotateCcw size={18} /></button>
             </div>
          </div>
        </div>
      </div>

      {/* SELECTOR DE CUARTOS */}
      <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 py-2 md:py-3 z-20 w-full flex justify-center shadow-sm gap-1 md:gap-2 shrink-0">
         {['Q1', 'Q2', 'Q3', 'Q4', 'TE'].map(p => (
           <button
              key={p}
              onClick={() => requestPeriodChange(p)}
              disabled={!isMatchLive}
              className={`px-4 md:px-6 py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest border-2 transition-all shadow-sm ${currentPeriod === p ? 'bg-orange-500 text-white border-orange-600 scale-105 shadow-orange-200' : 'bg-white text-slate-500 border-slate-200 hover:text-orange-500 hover:border-orange-200 disabled:opacity-50'}`}
           >
             {p}
           </button>
         ))}
      </div>

      {/* CANCHA */}
      <div className="flex-1 flex flex-col md:flex-row items-stretch relative z-0 bg-[url('/bg-baloncesto.jpg')] bg-cover bg-center overflow-hidden">
        <div className="absolute inset-0 bg-white/60 z-0"></div>

        {/* BOTÓN INICIAR PARTIDO - CORRECCIÓN (zIndex alto para evitar bloqueos) */}
        {!isMatchLive && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/30 backdrop-blur-[2px]">
            <button onClick={handleTurnMatchLive} className="flex flex-col items-center justify-center gap-2 w-40 h-40 md:w-56 md:h-56 bg-red-600 rounded-full text-white shadow-[0_0_60px_rgba(220,38,38,0.6)] hover:bg-red-500 hover:scale-105 active:scale-95 transition-all border-4 border-white animate-pulse">
              <Radio size={48} className="md:w-16 md:h-16" />
              <span className="font-black uppercase tracking-[0.2em] text-[10px] md:text-sm text-center px-4 leading-tight">Iniciar Partido</span>
            </button>
          </div>
        )}

        {isMatchLive && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 hidden md:flex w-16 h-16 md:w-24 md:h-24 bg-white/90 backdrop-blur-sm border-4 border-white rounded-full items-center justify-center shadow-xl pointer-events-none">
            <span className="text-xl md:text-3xl font-black text-slate-400 italic tracking-tighter">VS</span>
          </div>
        )}

        {/* LOCAL */}
        <div className={`flex-1 flex flex-col items-center justify-center p-2 sm:p-4 border-b md:border-b-0 md:border-r border-slate-200/50 relative z-10 transition-opacity duration-300 ${!isMatchLive ? 'opacity-40 grayscale blur-[1px]' : 'opacity-100'}`}>
          
          <div className="h-6 mb-1 md:mb-2">
            {homeIsLeading && isMatchLive && <span className="flex items-center gap-1 text-amber-600 font-black text-[9px] uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-200 shadow-sm animate-pulse"><Flame size={12}/> Ganando</span>}
          </div>

          <button onClick={() => setShowRosterModal('HOME')} disabled={!isMatchLive} className="bg-white rounded-[2rem] border border-slate-200 flex items-center justify-center p-4 md:p-6 shadow-xl mb-3 md:mb-4 z-10 relative hover:scale-105 transition-transform cursor-pointer shrink-0 disabled:pointer-events-none">
            {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="h-20 w-auto md:h-32 object-contain drop-shadow-md relative z-10" /> : <School size={64} className="text-slate-300 mx-8 my-4" />}
          </button>
          
          <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 uppercase tracking-tighter text-center mb-1 drop-shadow-md leading-tight bg-white/70 px-4 md:px-6 py-1.5 rounded-3xl backdrop-blur-md border border-white max-w-[90%] truncate">{match.home_team?.name}</h3>
          <p className="text-slate-500 font-black text-[10px] md:text-xs uppercase tracking-[0.2em] mb-3 z-10">Local</p>

          <div className="mb-4 px-4 py-1.5 md:py-2 bg-slate-900 rounded-full flex items-center gap-2 md:gap-3 shadow-xl border border-slate-700 z-10 shrink-0">
            <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Faltas Eq.</span>
            <div className="flex gap-1">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${i < homeFoulsQ ? (homeFoulsQ >= 4 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-orange-500') : 'bg-slate-700'}`}></div>
              ))}
            </div>
            {homeFoulsQ >= 4 && <span className="text-[8px] md:text-[10px] font-black text-red-500 uppercase tracking-widest ml-1 animate-pulse">BONUS</span>}
          </div>

          <div className="flex gap-1.5 md:gap-2 mb-2 md:mb-4 bg-white/80 backdrop-blur-md p-1.5 md:p-2 rounded-[1rem] md:rounded-2xl shadow-xl border border-white z-10 shrink-0">
            <button onClick={() => handleRefereeAction('HOME', 'FOUL')} disabled={!isMatchLive} className="px-2 md:px-3 md:w-20 h-8 md:h-12 bg-white border border-slate-200 rounded-lg md:rounded-xl shadow-sm hover:bg-orange-50 text-orange-500 font-black text-[8px] md:text-[10px] uppercase tracking-widest gap-1 flex items-center justify-center disabled:pointer-events-none">
              <Hand size={14}/> <span className="hidden md:inline">Falta</span>
            </button>
            <button onClick={() => executeTimeout('HOME', match.home_team.name)} disabled={!isMatchLive || timeoutOverlay.active} className="px-2 md:px-4 h-8 md:h-12 bg-white border border-slate-200 rounded-lg md:rounded-xl shadow-sm hover:bg-amber-50 text-amber-600 font-black text-[8px] md:text-[10px] uppercase tracking-widest gap-1 flex items-center justify-center disabled:pointer-events-none">
              <Timer size={14}/> <span className="hidden md:inline">T. Fuera</span>
            </button>
            <button onClick={() => handleRefereeAction('HOME', 'SUB')} disabled={!isMatchLive} className="w-10 h-8 md:w-14 md:h-12 bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl shadow-sm hover:bg-slate-800 text-white flex items-center justify-center disabled:pointer-events-none">
              <RefreshCcw size={16} />
            </button>
          </div>
          
          <span className={`text-[10rem] sm:text-[14rem] md:text-[18rem] lg:text-[25rem] leading-none font-black tabular-nums text-center drop-shadow-2xl transition-colors ${(homeScore > awayScore) && isMatchLive ? 'text-slate-900' : 'text-slate-800/90'} z-10 shrink-0`}>
            {homeScore}
          </span>
          
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 z-10 bg-white/60 backdrop-blur-md p-2 md:p-3 rounded-3xl md:rounded-[2rem] border border-white shadow-xl shrink-0 mt-auto mb-2">
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', -1)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-white rounded-xl md:rounded-2xl flex items-center justify-center text-red-500 border-2 border-slate-100 shadow-md active:scale-95 transition-all disabled:pointer-events-none"><Minus size={24} /></button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', 1)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-orange-500 rounded-xl md:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-xl shadow-orange-300 border border-orange-400 disabled:pointer-events-none">
              <span className="font-black text-xl md:text-3xl leading-none">+1</span><span className="text-[7px] md:text-[9px] font-black uppercase opacity-80 mt-1 hidden sm:block">Libre</span>
            </button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', 2)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-orange-600 rounded-xl md:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-xl shadow-orange-300 border border-orange-500 disabled:pointer-events-none">
              <span className="font-black text-xl md:text-3xl leading-none">+2</span><span className="text-[7px] md:text-[9px] font-black uppercase opacity-80 mt-1 hidden sm:block">Doble</span>
            </button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', 3)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-orange-700 rounded-xl md:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-xl shadow-orange-300 border border-orange-600 disabled:pointer-events-none">
              <span className="font-black text-xl md:text-3xl leading-none">+3</span><span className="text-[7px] md:text-[9px] font-black uppercase opacity-80 mt-1 hidden sm:block">Triple</span>
            </button>
          </div>
        </div>

        {/* === VISITANTE === */}
        <div className={`flex-1 flex flex-col items-center justify-center p-2 sm:p-4 relative z-10 transition-opacity duration-300 ${!isMatchLive ? 'opacity-40 grayscale blur-[1px]' : 'opacity-100'}`}>

          <div className="h-6 mb-1 md:mb-2">
            {awayIsLeading && isMatchLive && <span className="flex items-center gap-1 text-amber-600 font-black text-[9px] uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-200 shadow-sm animate-pulse"><Flame size={12}/> Ganando</span>}
          </div>

          <button onClick={() => setShowRosterModal('AWAY')} disabled={!isMatchLive} className="bg-white rounded-[2rem] border border-slate-200 flex items-center justify-center p-4 md:p-6 shadow-xl mb-3 md:mb-4 z-10 relative hover:scale-105 transition-transform cursor-pointer shrink-0 disabled:pointer-events-none">
            {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="h-20 w-auto md:h-32 object-contain relative z-10 drop-shadow-md" /> : <School size={64} className="text-slate-300 mx-8 my-4" />}
          </button>
          
          <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 uppercase tracking-tighter text-center mb-1 drop-shadow-md leading-tight bg-white/70 px-4 md:px-6 py-1.5 rounded-3xl backdrop-blur-md border border-white max-w-[90%] truncate">{match.away_team?.name}</h3>
          <p className="text-slate-500 font-black text-[10px] md:text-xs uppercase tracking-[0.2em] mb-3 z-10">Visitante</p>

          <div className="mb-4 px-4 py-1.5 md:py-2 bg-slate-900 rounded-full flex items-center gap-2 md:gap-3 shadow-xl border border-slate-700 z-10 shrink-0">
            <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Faltas Eq.</span>
            <div className="flex gap-1">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${i < awayFoulsQ ? (awayFoulsQ >= 4 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-orange-500') : 'bg-slate-700'}`}></div>
              ))}
            </div>
            {awayFoulsQ >= 4 && <span className="text-[8px] md:text-[10px] font-black text-red-500 uppercase tracking-widest ml-1 animate-pulse">BONUS</span>}
          </div>

          <div className="flex gap-1.5 md:gap-2 mb-2 md:mb-4 bg-white/80 backdrop-blur-md p-1.5 md:p-2 rounded-[1rem] md:rounded-2xl shadow-xl border border-white z-10 mt-2 shrink-0">
            <button onClick={() => handleRefereeAction('AWAY', 'FOUL')} disabled={!isMatchLive} className="px-2 md:px-3 md:w-20 h-8 md:h-12 bg-white border border-slate-200 rounded-lg md:rounded-xl shadow-sm hover:bg-orange-50 text-orange-500 font-black text-[8px] md:text-[10px] uppercase tracking-widest gap-1 flex items-center justify-center disabled:pointer-events-none">
              <Hand size={14}/> <span className="hidden md:inline">Falta</span>
            </button>
            <button onClick={() => executeTimeout('AWAY', match.away_team.name)} disabled={!isMatchLive || timeoutOverlay.active} className="px-2 md:px-4 h-8 md:h-12 bg-white border border-slate-200 rounded-lg md:rounded-xl shadow-sm hover:bg-amber-50 text-amber-600 font-black text-[8px] md:text-[10px] uppercase tracking-widest gap-1 flex items-center justify-center disabled:pointer-events-none">
              <Timer size={14}/> <span className="hidden md:inline">T. Fuera</span>
            </button>
            <button onClick={() => handleRefereeAction('AWAY', 'SUB')} disabled={!isMatchLive} className="w-10 h-8 md:w-14 md:h-12 bg-slate-900 border border-slate-800 rounded-lg md:rounded-xl shadow-sm hover:bg-slate-800 text-white flex items-center justify-center disabled:pointer-events-none">
              <RefreshCcw size={16} />
            </button>
          </div>
          
          <span className={`text-[10rem] sm:text-[14rem] md:text-[18rem] lg:text-[25rem] leading-none font-black tabular-nums text-center drop-shadow-2xl transition-colors ${(awayScore > homeScore) && isMatchLive ? 'text-slate-900' : 'text-slate-800/90'} z-10 shrink-0`}>
            {awayScore}
          </span>
          
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 z-10 bg-white/60 backdrop-blur-md p-2 md:p-3 rounded-3xl md:rounded-[2rem] border border-white shadow-xl shrink-0 mt-auto mb-2">
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', -1)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-white rounded-xl md:rounded-2xl flex items-center justify-center text-red-500 border-2 border-slate-100 shadow-md active:scale-95 transition-all disabled:pointer-events-none"><Minus size={24} /></button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', 1)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-orange-500 rounded-xl md:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-xl shadow-orange-300 border border-orange-400 disabled:pointer-events-none">
              <span className="font-black text-xl md:text-3xl leading-none">+1</span><span className="text-[7px] md:text-[9px] font-black uppercase opacity-80 mt-1 hidden sm:block">Libre</span>
            </button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', 2)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-orange-600 rounded-xl md:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-xl shadow-orange-300 border border-orange-500 disabled:pointer-events-none">
              <span className="font-black text-xl md:text-3xl leading-none">+2</span><span className="text-[7px] md:text-[9px] font-black uppercase opacity-80 mt-1 hidden sm:block">Doble</span>
            </button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', 3)} className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20 bg-orange-700 rounded-xl md:rounded-2xl flex flex-col items-center justify-center text-white active:scale-95 transition-all shadow-xl shadow-orange-300 border border-orange-600 disabled:pointer-events-none">
              <span className="font-black text-xl md:text-3xl leading-none">+3</span><span className="text-[7px] md:text-[9px] font-black uppercase opacity-80 mt-1 hidden sm:block">Triple</span>
            </button>
          </div>
        </div>
      </div>

      {/* BOTÓN INFERIOR INTELIGENTE */}
      <div className="p-4 md:p-6 bg-slate-950 relative z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] shrink-0">
        <button 
          onClick={handleSmartBottomAction} 
          disabled={loading || !isMatchLive} 
          className={`w-full py-4 md:py-5 rounded-2xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg border disabled:opacity-30
            ${isFinalPeriod 
              ? 'bg-red-600 text-white hover:bg-red-500 border-red-500 shadow-red-500/20' 
              : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
            }
          `}
        >
          {isFinalPeriod ? (
             <><CheckCircle2 size={24} className="text-white"/> Cerrar Acta de Baloncesto FIBA</>
          ) : (
             <><ArrowRight size={24} className="text-orange-400"/> Finalizar {currentPeriod} y Avanzar</>
          )}
        </button>
      </div>
    </div>
  );
}
