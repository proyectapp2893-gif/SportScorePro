'use client';
import React from 'react';
import { Trophy, School, CheckCircle2, X } from 'lucide-react';

interface PenaltyShootoutProps {
  match: any;
  homeScore: number;
  awayScore: number;
  homePenalties: (boolean | null)[];
  awayPenalties: (boolean | null)[];
  homePenaltyScore: number;
  awayPenaltyScore: number;
  penaltyWinner: 'HOME' | 'AWAY' | null;
  onRecordPenalty: (team: 'HOME' | 'AWAY', index: number, isGoal: boolean) => void;
}

export default function PenaltyShootout({
  match, homeScore, awayScore, homePenalties, awayPenalties, 
  homePenaltyScore, awayPenaltyScore, penaltyWinner, onRecordPenalty
}: PenaltyShootoutProps) {

  return (
    <div className="flex-1 flex flex-col p-2 sm:p-4 md:p-8 z-10 relative animate-in fade-in zoom-in-95 duration-500 overflow-hidden bg-slate-900">
      {penaltyWinner && (
         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-950/95 backdrop-blur-xl border border-white/10 shadow-[0_0_100px_rgba(16,185,129,0.4)] text-center animate-in zoom-in spin-in-2 duration-700 rounded-[2rem] md:rounded-[3rem] w-[90%] md:w-[95%] max-w-4xl overflow-hidden relative flex flex-col items-center justify-center min-h-[300px] md:min-h-[500px]">
            <div className="absolute inset-0 z-0 opacity-25 flex items-center justify-center pointer-events-none p-4 md:p-8 mix-blend-overlay">
               {match[penaltyWinner === 'HOME' ? 'home_team' : 'away_team']?.schools?.logo_url && <img src={match[penaltyWinner === 'HOME' ? 'home_team' : 'away_team'].schools.logo_url} alt="Logo Ganador" className="w-full h-full object-contain" />}
            </div>
            <div className="relative z-10 flex flex-col items-center w-full px-4 sm:px-8 md:px-16">
               <div className="bg-gradient-to-b from-yellow-300 to-yellow-600 p-4 md:p-6 rounded-full mb-4 md:mb-8 shadow-[0_0_50px_rgba(250,204,21,0.5)] scale-75 md:scale-100"><Trophy className="w-12 h-12 md:w-20 md:h-20 text-white drop-shadow-lg" /></div>
               <h2 className="text-2xl sm:text-4xl md:text-7xl font-black uppercase tracking-tighter mb-4 md:mb-6 text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-white to-emerald-300 drop-shadow-2xl w-full whitespace-nowrap">¡GANADOR!</h2>
               <div className="bg-white/10 px-4 sm:px-8 md:px-12 py-3 md:py-6 rounded-2xl md:rounded-[2.5rem] backdrop-blur-md border border-white/20 shadow-xl mt-1 md:mt-2 w-full max-w-2xl">
                  <p className="text-xl sm:text-3xl md:text-5xl font-black text-white uppercase tracking-widest drop-shadow-md truncate">{penaltyWinner === 'HOME' ? match.home_team.name : match.away_team.name}</p>
               </div>
            </div>
         </div>
      )}

      <div className="relative z-20 flex-1 flex flex-col h-full z-10">
         <div className="text-center mb-4 md:mb-8 bg-white/10 backdrop-blur-md py-2 md:py-4 rounded-2xl md:rounded-3xl shadow-xl border border-white/20 inline-block mx-auto px-6 md:px-12 z-10 relative shrink-0">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase text-white tracking-tighter">Penales</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] md:text-xs mt-0.5 md:mt-1">Global: {homeScore} - {awayScore}</p>
         </div>

         <div className="flex-1 flex flex-col sm:flex-row gap-4 md:gap-8 h-full max-w-5xl mx-auto w-full z-10 relative overflow-hidden">
            
            {/* PENALES LOCAL */}
            <div className="flex-1 flex flex-col bg-slate-800/80 backdrop-blur-md rounded-2xl md:rounded-[3rem] border border-slate-700 shadow-xl md:shadow-2xl p-4 md:p-8 relative z-10 overflow-hidden">
               <div className="absolute -bottom-10 -right-10 md:-bottom-20 md:-right-20 opacity-[0.05] pointer-events-none z-0">
                  {match.home_team?.schools?.logo_url && <img src={match.home_team.schools.logo_url} className="w-48 h-48 md:w-96 md:h-96 object-contain" alt="Local bg" />}
               </div>
               <div className="flex items-center justify-between border-b md:border-b-2 border-slate-700 pb-3 md:pb-6 mb-3 md:mb-6 z-10 relative shrink-0">
                  <div className="flex items-center gap-2 md:gap-4">
                     <div className="w-10 h-10 md:w-16 md:h-16 bg-slate-900 rounded-xl md:rounded-2xl p-1.5 md:p-2 border border-slate-600 z-10 relative">
                        {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain z-10 relative" alt="Local logo" /> : <School className="text-slate-500 w-full h-full z-10 relative" />}
                     </div>
                     <div className="max-w-[100px] md:max-w-none">
                        <h3 className="text-sm sm:text-base md:text-3xl font-black uppercase text-white leading-none z-10 relative truncate">{match.home_team?.name}</h3>
                        <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest z-10 relative hidden sm:block">Local</span>
                     </div>
                  </div>
                  <div className="text-3xl md:text-6xl font-black text-white bg-slate-900 w-12 h-12 md:w-24 md:h-24 rounded-xl md:rounded-3xl flex items-center justify-center border border-slate-700 shadow-inner shrink-0 z-10 relative tabular-nums">{homePenaltyScore}</div>
               </div>

               <div className="flex-1 flex flex-col gap-2 md:gap-3 overflow-y-auto scrollbar-hide z-10 pr-1 md:pr-2 relative">
                  {homePenalties.map((val, idx) => (
                     <div key={idx} className="flex items-center justify-between p-2 md:p-3 bg-slate-900/50 rounded-xl md:rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-colors z-10 relative">
                        <div className="flex items-center gap-2 md:gap-4 z-10 relative">
                           <span className="w-6 h-6 md:w-8 md:h-8 bg-slate-800 rounded-full flex items-center justify-center font-black text-slate-400 text-[10px] md:text-xs shadow-sm z-10 relative shrink-0">{idx + 1}</span>
                           <span className="font-bold text-slate-400 text-[10px] md:text-sm uppercase z-10 relative hidden md:block">Tiro {idx + 1}</span>
                        </div>
                        <div className="flex gap-1.5 md:gap-2 z-10 relative">
                           <button onClick={() => onRecordPenalty('HOME', idx, true)} className={`w-10 h-8 md:w-12 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center border transition-all z-10 relative ${val === true ? 'bg-emerald-500 border-emerald-600 text-white shadow-inner' : 'bg-slate-800 border-slate-600 text-slate-500 hover:bg-emerald-900/50 hover:border-emerald-500 hover:text-emerald-400'}`}><CheckCircle2 className="w-4 h-4 md:w-5 md:h-5"/></button>
                           <button onClick={() => onRecordPenalty('HOME', idx, false)} className={`w-10 h-8 md:w-12 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center border transition-all z-10 relative ${val === false ? 'bg-red-500 border-red-600 text-white shadow-inner' : 'bg-slate-800 border-slate-600 text-slate-500 hover:bg-red-900/50 hover:border-red-500 hover:text-red-400'}`}><X className="w-4 h-4 md:w-5 md:h-5"/></button>
                        </div>
                     </div>
                  ))}
               </div>
            </div>

            {/* PENALES VISITANTE */}
            <div className="flex-1 flex flex-col bg-slate-800/80 backdrop-blur-md rounded-2xl md:rounded-[3rem] border border-slate-700 shadow-xl md:shadow-2xl p-4 md:p-8 relative z-10 overflow-hidden">
               <div className="absolute -bottom-10 -left-10 md:-bottom-20 md:-left-20 opacity-[0.05] pointer-events-none z-0">
                  {match.away_team?.schools?.logo_url && <img src={match.away_team.schools.logo_url} className="w-48 h-48 md:w-96 md:h-96 object-contain" alt="Visitante bg" />}
               </div>

               <div className="flex items-center justify-between border-b md:border-b-2 border-slate-700 pb-3 md:pb-6 mb-3 md:mb-6 z-10 relative sm:flex-row-reverse shrink-0">
                  <div className="flex items-center gap-2 md:gap-4 sm:flex-row-reverse z-10 relative">
                     <div className="w-10 h-10 md:w-16 md:h-16 bg-slate-900 rounded-xl md:rounded-2xl p-1.5 md:p-2 border border-slate-600 z-10 relative">
                        {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain z-10 relative" alt="Visitante logo" /> : <School className="text-slate-500 w-full h-full z-10 relative" />}
                     </div>
                     <div className="sm:text-right max-w-[100px] md:max-w-none">
                        <h3 className="text-sm sm:text-base md:text-3xl font-black uppercase text-white leading-none z-10 relative truncate">{match.away_team?.name}</h3>
                        <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest z-10 relative hidden sm:block">Visitante</span>
                     </div>
                  </div>
                  <div className="text-3xl md:text-6xl font-black text-white bg-slate-900 w-12 h-12 md:w-24 md:h-24 rounded-xl md:rounded-3xl flex items-center justify-center border border-slate-700 shadow-inner shrink-0 z-10 relative tabular-nums">{awayPenaltyScore}</div>
               </div>

               <div className="flex-1 flex flex-col gap-2 md:gap-3 overflow-y-auto scrollbar-hide z-10 pr-1 md:pr-2 relative">
                  {awayPenalties.map((val, idx) => (
                     <div key={idx} className="flex items-center justify-between p-2 md:p-3 bg-slate-900/50 rounded-xl md:rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-colors z-10 relative sm:flex-row-reverse">
                        <div className="flex items-center gap-2 md:gap-4 sm:flex-row-reverse z-10 relative">
                           <span className="w-6 h-6 md:w-8 md:h-8 bg-slate-800 rounded-full flex items-center justify-center font-black text-slate-400 text-[10px] md:text-xs shadow-sm z-10 relative shrink-0">{idx + 1}</span>
                           <span className="font-bold text-slate-400 text-[10px] md:text-sm uppercase z-10 relative hidden md:block">Tiro {idx + 1}</span>
                        </div>
                        <div className="flex gap-1.5 md:gap-2 sm:flex-row-reverse z-10 relative">
                           <button onClick={() => onRecordPenalty('AWAY', idx, true)} className={`w-10 h-8 md:w-12 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center border transition-all z-10 relative ${val === true ? 'bg-emerald-500 border-emerald-600 text-white shadow-inner' : 'bg-slate-800 border-slate-600 text-slate-500 hover:bg-emerald-900/50 hover:border-emerald-500 hover:text-emerald-400'}`}><CheckCircle2 className="w-4 h-4 md:w-5 md:h-5"/></button>
                           <button onClick={() => onRecordPenalty('AWAY', idx, false)} className={`w-10 h-8 md:w-12 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center border transition-all z-10 relative ${val === false ? 'bg-red-500 border-red-600 text-white shadow-inner' : 'bg-slate-800 border-slate-600 text-slate-500 hover:bg-red-900/50 hover:border-red-500 hover:text-red-400'}`}><X className="w-4 h-4 md:w-5 md:h-5"/></button>
                        </div>
                     </div>
                  ))}
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}