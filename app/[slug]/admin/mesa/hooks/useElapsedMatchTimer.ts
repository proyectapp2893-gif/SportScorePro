'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../supabase';
import { pauseElapsedClock, resetElapsedClock, startElapsedClock } from '../actions';

type ElapsedState = {
  is_timer_running: boolean;
  timer_start_time: string | null;
  timer_accumulated_seconds: number;
  home_sets: number | null;
};

type ElapsedActionResult = {
  is_timer_running?: boolean;
  timer_accumulated_seconds?: number;
  elapsed_seconds?: number;
};

function getElapsedSeconds(state: ElapsedState) {
  let elapsed = state.timer_accumulated_seconds || 0;

  if (state.is_timer_running && state.timer_start_time) {
    elapsed += Math.floor((Date.now() - new Date(state.timer_start_time).getTime()) / 1000);
  }

  return Math.max(0, elapsed);
}

function mergeActionResult(state: ElapsedState, result: ElapsedActionResult, running: boolean): ElapsedState {
  const elapsed = result.elapsed_seconds ?? result.timer_accumulated_seconds ?? getElapsedSeconds(state);

  return {
    ...state,
    is_timer_running: running,
    timer_start_time: running ? new Date().toISOString() : null,
    timer_accumulated_seconds: elapsed,
    home_sets: elapsed,
  };
}

export function useElapsedMatchTimer(slug: string, matchId: string, initialState: Partial<ElapsedState>) {
  const normalizedInitialState = useMemo<ElapsedState>(() => ({
    is_timer_running: initialState.is_timer_running || false,
    timer_start_time: initialState.timer_start_time || null,
    timer_accumulated_seconds: initialState.timer_accumulated_seconds ?? initialState.home_sets ?? 0,
    home_sets: initialState.home_sets ?? 0,
  }), [initialState.home_sets, initialState.is_timer_running, initialState.timer_accumulated_seconds, initialState.timer_start_time]);

  const [clockState, setClockState] = useState<ElapsedState>(normalizedInitialState);
  const [elapsedSeconds, setElapsedSeconds] = useState(getElapsedSeconds(normalizedInitialState));
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockStateRef = useRef<ElapsedState>(normalizedInitialState);

  const updateClockState = useCallback((nextState: ElapsedState) => {
    clockStateRef.current = nextState;
    setClockState(nextState);
    setElapsedSeconds(getElapsedSeconds(nextState));
  }, []);

  useEffect(() => {
    const fetchState = async () => {
      const { data } = await supabase
        .from('matches')
        .select('is_timer_running, timer_start_time, timer_accumulated_seconds, home_sets')
        .eq('id', matchId)
        .single();

      if (data) {
        updateClockState({
          is_timer_running: data.is_timer_running || false,
          timer_start_time: data.timer_start_time || null,
          timer_accumulated_seconds: data.timer_accumulated_seconds ?? data.home_sets ?? 0,
          home_sets: data.home_sets ?? 0,
        });
      }
    };

    fetchState();

    const channel = supabase
      .channel(`elapsed_clock_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => {
        const next = payload.new as Partial<ElapsedState>;
        updateClockState({
          ...clockStateRef.current,
          is_timer_running: next.is_timer_running ?? clockStateRef.current.is_timer_running,
          timer_start_time: next.timer_start_time ?? null,
          timer_accumulated_seconds: next.timer_accumulated_seconds ?? clockStateRef.current.timer_accumulated_seconds,
          home_sets: next.home_sets ?? clockStateRef.current.home_sets,
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId, updateClockState]);

  useEffect(() => {
    if (clockState.is_timer_running) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(getElapsedSeconds(clockStateRef.current));
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [clockState.is_timer_running]);

  const toggleTimer = async () => {
    if (clockStateRef.current.is_timer_running) {
      updateClockState({ ...clockStateRef.current, is_timer_running: false, timer_start_time: null });
      const result = await pauseElapsedClock({ slug, matchId });
      updateClockState(mergeActionResult(clockStateRef.current, result, false));
      return;
    }

    updateClockState({ ...clockStateRef.current, is_timer_running: true, timer_start_time: new Date().toISOString() });
    const result = await startElapsedClock({ slug, matchId });
    updateClockState(mergeActionResult(clockStateRef.current, result, true));
  };

  const pauseTimer = async () => {
    updateClockState({ ...clockStateRef.current, is_timer_running: false, timer_start_time: null });
    const result = await pauseElapsedClock({ slug, matchId });
    updateClockState(mergeActionResult(clockStateRef.current, result, false));
  };

  const resetTimer = async (period?: string | null) => {
    const result = await resetElapsedClock({ slug, matchId, period });
    updateClockState(mergeActionResult(clockStateRef.current, result, false));
  };

  return {
    timerSeconds: elapsedSeconds,
    isTimerRunning: clockState.is_timer_running,
    toggleTimer,
    pauseTimer,
    resetTimer,
  };
}
