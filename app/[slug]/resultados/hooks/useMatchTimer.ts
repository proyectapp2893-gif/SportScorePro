import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabase'; 
import { autoStopFootballTimer, endFootballTimer, pauseFootballTimer, resetFootballTimer, startFootballTimer } from '../../admin/mesa/actions';
import { confirmDialog } from '@/app/components/AppDialog';
import { DEMO_SLUG } from '@/app/lib/demo/config';

interface TimerState {
  is_timer_running: boolean;
  timer_start_time: string | null;
  timer_accumulated_seconds: number;
  match_duration_seconds: number;
  match_phase: 'REGULAR' | 'EXTRA' | 'FINISHED';
}

export function useMatchTimer(slug: string, matchId: string, initialData: TimerState, isAdmin: boolean = false) {
  const isDemo = slug === DEMO_SLUG;
  const [timerState, setTimerState] = useState<TimerState>(initialData);
  const [displaySeconds, setDisplaySeconds] = useState(initialData.timer_accumulated_seconds || 0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. EL CÁLCULO MATEMÁTICO (Corre cada segundo si está activo)
  useEffect(() => {
    if (timerState.is_timer_running && timerState.timer_start_time) {
      const startMs = new Date(timerState.timer_start_time).getTime();

      intervalRef.current = setInterval(() => {
        const nowMs = Date.now();
        const diffSeconds = Math.floor((nowMs - startMs) / 1000);
        const currentTotal = (timerState.timer_accumulated_seconds || 0) + diffSeconds;

        if (timerState.match_phase === 'REGULAR' && currentTotal >= (timerState.match_duration_seconds || 2400)) {
          clearInterval(intervalRef.current!);
          setDisplaySeconds(timerState.match_duration_seconds || 2400);

          if (isAdmin && !isDemo) {
            autoStopFootballTimer({ slug, matchId, duration: timerState.match_duration_seconds || 2400 }).catch(console.error);
          }
        } else {
          setDisplaySeconds(currentTotal);
        }
      }, 1000);
    } else {
      setDisplaySeconds(timerState.timer_accumulated_seconds || 0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerState.is_timer_running, timerState.timer_start_time, timerState.timer_accumulated_seconds, timerState.match_phase]);

  // 2. SINCRONIZACIÓN Y OBTENCIÓN DE LA VERDAD ABSOLUTA
  useEffect(() => {
    const fetchRealTimeState = async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('is_timer_running, timer_start_time, timer_accumulated_seconds, match_duration_seconds, match_phase')
        .eq('id', matchId)
        .single();
        
      if (data && !error) {
        setTimerState(data as TimerState); 
      }
    };
    
    fetchRealTimeState();

    const uniqueSuffix = Math.random().toString(36).substring(2, 15);
    const channelName = `match_timer_${matchId}_${uniqueSuffix}`;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => {
          setTimerState(payload.new as TimerState);
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // 3. CONTROLES CON ACTUALIZACIÓN OPTIMISTA
  const toggleTimer = async () => {
    let currentTimerState = timerState;

    if (currentTimerState.match_phase === 'FINISHED') {
      currentTimerState = {
        ...currentTimerState,
        is_timer_running: false,
        timer_start_time: null,
        timer_accumulated_seconds: 0,
        match_phase: 'REGULAR',
      };
      setTimerState(currentTimerState);
      if (isDemo) await supabase.from('matches').update({ is_timer_running: false, timer_start_time: null, timer_accumulated_seconds: 0, match_phase: 'REGULAR' }).eq('id', matchId);
      else await resetFootballTimer({ slug, matchId });
    }

    const currentlyRunning = currentTimerState.is_timer_running;
    
    setTimerState(prev => ({
      ...prev,
      is_timer_running: !currentlyRunning,
      timer_start_time: !currentlyRunning ? new Date().toISOString() : prev.timer_start_time
    }));

    if (isDemo) {
      const accumulated = currentlyRunning && currentTimerState.timer_start_time
        ? currentTimerState.timer_accumulated_seconds + Math.max(0, Math.floor((Date.now() - new Date(currentTimerState.timer_start_time).getTime()) / 1000))
        : currentTimerState.timer_accumulated_seconds;
      await supabase.from('matches').update({ is_timer_running: !currentlyRunning, timer_start_time: currentlyRunning ? null : new Date().toISOString(), timer_accumulated_seconds: accumulated }).eq('id', matchId);
    } else {
      const timerAction = currentlyRunning ? pauseFootballTimer : startFootballTimer;
      timerAction({ slug, matchId }).catch((error) => console.error('Fallo en acción de cronómetro:', error));
    }
  };

  const endMatch = async () => {
    if (await confirmDialog({
      title: 'Finalizar partido',
      description: 'El reloj se detendrá por completo y el partido quedará marcado como finalizado.',
      confirmLabel: 'Finalizar',
    })) {
      setTimerState(prev => ({ ...prev, is_timer_running: false, match_phase: 'FINISHED' }));
      if (isDemo) await supabase.from('matches').update({ is_timer_running: false, match_phase: 'FINISHED' }).eq('id', matchId);
      else await endFootballTimer({ slug, matchId });
    }
  };

  // 🔥 NUEVA FUNCIÓN: Reset Manual
  const resetTimer = async () => {
    if (await confirmDialog({
      title: 'Reiniciar reloj',
      description: 'El cronómetro volverá a 00:00. Esta acción no se puede deshacer.',
      confirmLabel: 'Reiniciar',
    })) {
      setTimerState(prev => ({
        ...prev,
        is_timer_running: false,
        timer_start_time: null,
        timer_accumulated_seconds: 0
      }));
      if (isDemo) await supabase.from('matches').update({ is_timer_running: false, timer_start_time: null, timer_accumulated_seconds: 0 }).eq('id', matchId);
      else await resetFootballTimer({ slug, matchId });
    }
  };

  const safeDuration = timerState.match_duration_seconds || 2400;
  const safeDisplay = isNaN(displaySeconds) ? 0 : displaySeconds;

  return { 
    regularSeconds: Math.min(safeDisplay, safeDuration), 
    extraSeconds: timerState.match_phase === 'EXTRA' ? Math.max(0, safeDisplay - safeDuration) : 0, 
    phase: timerState.match_phase || 'REGULAR', 
    isRunning: timerState.is_timer_running || false, 
    toggleTimer, 
    endMatch,
    resetTimer // Retornamos la nueva función
  };
}
