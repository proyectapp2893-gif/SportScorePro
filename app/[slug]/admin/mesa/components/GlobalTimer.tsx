'use client';
import React from 'react';
import { Play, Pause, Square, RotateCcw } from 'lucide-react';

interface GlobalTimerProps {
  regularSeconds: number;
  extraSeconds: number;
  phase: 'REGULAR' | 'EXTRA' | 'FINISHED';
  isRunning: boolean;
  toggleTimer: () => void;
  endMatch: () => void;
  resetTimer?: () => void;
  isAdmin?: boolean;
}

export default function GlobalTimer({ 
  regularSeconds, extraSeconds, phase, isRunning, toggleTimer, endMatch, resetTimer, isAdmin = false 
}: GlobalTimerProps) {
  
  const formatTime = (totalSecs: number) => {
    const validSecs = isNaN(totalSecs) || totalSecs === undefined ? 0 : totalSecs;
    const m = Math.floor(validSecs / 60).toString().padStart(2, '0');
    const s = (validSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex items-center justify-center gap-3 w-full">
      <div className="flex items-center gap-2">
        <span className="text-xl sm:text-2xl font-black tabular-nums tracking-widest text-white leading-none">
          {formatTime(regularSeconds)}
        </span>
        {phase === 'EXTRA' && (
          <span className="text-xs font-black text-yellow-300 animate-pulse leading-none">
            +{formatTime(extraSeconds)}
          </span>
        )}
      </div>

      {isAdmin && phase !== 'FINISHED' && (
        <div className="flex gap-2 items-center">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleTimer(); }}
            className={`flex items-center justify-center w-6 h-6 rounded-full transition-all shadow-md border border-white/30 hover:scale-110 ${
              isRunning ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
            }`}
            title={isRunning ? "Pausar" : "Reanudar"}
          >
            {isRunning ? <Pause size={12} fill="white" /> : <Play size={12} fill="white" className="ml-0.5" />}
          </button>
          
          {resetTimer && (
             <button
               onClick={(e) => { e.preventDefault(); e.stopPropagation(); resetTimer(); }}
               className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 hover:bg-red-500 transition-all text-white"
               title="Reiniciar a 00:00"
             >
               <RotateCcw size={10} />
             </button>
          )}
        </div>
      )}
    </div>
  );
}