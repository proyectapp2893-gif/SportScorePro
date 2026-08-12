'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../supabase';
import { pauseCountdownClock, resetCountdownClock, startCountdownClock } from '../actions';

type CountdownState = {
  is_timer_running: boolean;
  timer_start_time: string | null;
  timer_accumulated_seconds: number;
  match_duration_seconds: number;
  home_sets: number | null;
};

type CountdownActionResult = {
  is_timer_running?: boolean;
  timer_accumulated_seconds?: number;
  match_duration_seconds?: number;
  remaining_seconds?: number;
};

function getRemainingSeconds(state: CountdownState) {
  const duration = state.match_duration_seconds || 600;
  let elapsed = state.timer_accumulated_seconds || 0;

  if (state.is_timer_running && state.timer_start_time) {
    elapsed += Math.floor((Date.now() - new Date(state.timer_start_time).getTime()) / 1000);
  }

  return Math.max(0, duration - elapsed);
}

function mergeActionResult(state: CountdownState, result: CountdownActionResult, running: boolean): CountdownState {
  const duration = result.match_duration_seconds ?? state.match_duration_seconds;
  const remaining = result.remaining_seconds ?? Math.max(0, duration - (result.timer_accumulated_seconds ?? state.timer_accumulated_seconds));

  return {
    ...state,
    is_timer_running: running,
    timer_start_time: running ? new Date().toISOString() : null,
    timer_accumulated_seconds: result.timer_accumulated_seconds ?? Math.max(0, duration - remaining),
    match_duration_seconds: duration,
    home_sets: remaining,
  };
}

export function useCountdownMatchTimer(slug: string, matchId: string, initialState: Partial<CountdownState>, defaultDuration = 600) {
  const normalizedInitialState = useMemo<CountdownState>(() => ({
    is_timer_running: initialState.is_timer_running || false,
    timer_start_time: initialState.timer_start_time || null,
    timer_accumulated_seconds: initialState.timer_accumulated_seconds || 0,
    match_duration_seconds: initialState.match_duration_seconds || initialState.home_sets || defaultDuration,
    home_sets: initialState.home_sets ?? defaultDuration,
  }), [defaultDuration, initialState.home_sets, initialState.is_timer_running, initialState.match_duration_seconds, initialState.timer_accumulated_seconds, initialState.timer_start_time]);

  const [clockState, setClockState] = useState<CountdownState>(normalizedInitialState);
  const [remainingSeconds, setRemainingSeconds] = useState(getRemainingSeconds(normalizedInitialState));
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockStateRef = useRef<CountdownState>(normalizedInitialState);

  const updateClockState = useCallback((nextState: CountdownState) => {
    clockStateRef.current = nextState;
    setClockState(nextState);
    setRemainingSeconds(getRemainingSeconds(nextState));
  }, []);

  useEffect(() => {
    const fetchState = async () => {
      const { data } = await supabase
        .from('matches')
        .select('is_timer_running, timer_start_time, timer_accumulated_seconds, match_duration_seconds, home_sets')
        .eq('id', matchId)
        .single();

      if (data) {
        updateClockState({
          is_timer_running: data.is_timer_running || false,
          timer_start_time: data.timer_start_time || null,
          timer_accumulated_seconds: data.timer_accumulated_seconds || 0,
          match_duration_seconds: data.match_duration_seconds || data.home_sets || defaultDuration,
          home_sets: data.home_sets ?? defaultDuration,
        });
      }
    };

    fetchState();

    const channel = supabase
      .channel(`countdown_clock_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => {
        const next = payload.new as Partial<CountdownState>;
        updateClockState({
          ...clockStateRef.current,
          is_timer_running: next.is_timer_running ?? clockStateRef.current.is_timer_running,
          timer_start_time: next.timer_start_time ?? null,
          timer_accumulated_seconds: next.timer_accumulated_seconds ?? clockStateRef.current.timer_accumulated_seconds,
          match_duration_seconds: next.match_duration_seconds ?? clockStateRef.current.match_duration_seconds,
          home_sets: next.home_sets ?? clockStateRef.current.home_sets,
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [defaultDuration, matchId, updateClockState]);

  useEffect(() => {
    if (clockState.is_timer_running) {
      intervalRef.current = setInterval(() => {
        const remaining = getRemainingSeconds(clockStateRef.current);
        setRemainingSeconds(remaining);

        if (remaining <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          pauseCountdownClock({ slug, matchId }).catch(console.error);
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [clockState, matchId, slug]);

  const toggleTimer = async () => {
    if (clockState.is_timer_running) {
      updateClockState({ ...clockStateRef.current, is_timer_running: false, timer_start_time: null });
      const result = await pauseCountdownClock({ slug, matchId });
      updateClockState(mergeActionResult(clockStateRef.current, result, false));
      return;
    }

    updateClockState({ ...clockStateRef.current, is_timer_running: true, timer_start_time: new Date().toISOString() });
    const result = await startCountdownClock({ slug, matchId, duration: clockState.match_duration_seconds || defaultDuration });
    updateClockState(mergeActionResult(clockStateRef.current, result, true));
  };

  const pauseTimer = async () => {
    updateClockState({ ...clockStateRef.current, is_timer_running: false, timer_start_time: null });
    const result = await pauseCountdownClock({ slug, matchId });
    updateClockState(mergeActionResult(clockStateRef.current, result, false));
  };

  const resetTimer = async (duration: number, period?: string | null) => {
    const result = await resetCountdownClock({ slug, matchId, duration, period });
    updateClockState(mergeActionResult(clockStateRef.current, result, false));
  };

  return {
    timerSeconds: Math.max(0, remainingSeconds),
    isTimerRunning: clockState.is_timer_running,
    toggleTimer,
    pauseTimer,
    resetTimer,
  };
}
