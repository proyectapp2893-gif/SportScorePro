'use client';
import React from 'react';
import { Users, AlertTriangle, Zap, X, School, CheckCircle2, Lock, Radio } from 'lucide-react';

interface StartingLineupModalProps {
  match: any;
  maxPlayers: number;
  minPlayers: number;
  homeRoster: any[];
  awayRoster: any[];
  suspendedPlayers: Record<string, boolean | string>;
  homeStartingLineup: string[];
  awayStartingLineup: string[];
  toggleStartingPlayer: (team: 'HOME' | 'AWAY', playerId: string) => void;
  loading: boolean;
  onClose: () => void;
  onOpenWO: () => void;
  onQuickStart: () => void;
  onTurnMatchLive: () => void;
}

export default function StartingLineupModal({
  match, maxPlayers, minPlayers, homeRoster, awayRoster, suspendedPlayers,
  homeStartingLineup, awayStartingLineup, toggleStartingPlayer, loading,
  onClose, onOpenWO, onQuickStart, onTurnMatchLive
}: StartingLineupModalProps) {

  const calculateAge = (dob: string | null) => {
    if (!dob) return '';
    const diff = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(diff); 
    return `${Math.abs(ageDate.getUTCFullYear() - 1970)} años`;
  };

  const renderTeamList = (team: 'HOME' | 'AWAY', teamData: any, roster: any[], lineup: string[]) => (
    <div className="flex-1 flex flex-col h-full bg-slate-50 rounded-[2rem] border border-slate-200 overflow-hidden">
      <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center p-2 shadow-inner">
            {teamData?.schools?.logo_url ? <img src={teamData.schools.logo_url} className="w-full h-full object-contain" alt={teamData.name} /> : <School className="text-slate-300" />}
          </div>
          <div>
            <h4 className="text-lg font-black uppercase text-slate-900">{teamData?.name}</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{team === 'HOME' ? 'Local' : 'Visitante'}</p>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest border ${lineup.length >= minPlayers ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {lineup.length} / {maxPlayers}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-2">
        {roster.length === 0 ? <p className="text-center text-slate-400 py-10 font-bold text-xs uppercase tracking-widest">Nómina vacía</p> : 
          roster.map(player => {
            const isStarter = lineup.includes(player.id);
            const isSuspended = suspendedPlayers[player.id];
            return (
              <button key={player.id} disabled={Boolean(isSuspended)} onClick={() => toggleStartingPlayer(team, player.id)} className={`w-full flex items-center justify-between p-3 px-5 rounded-2xl border transition-all text-left ${isSuspended ? 'bg-slate-100 border-slate-300 opacity-60 cursor-not-allowed' : isStarter ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-700 hover:border-blue-400'}`}>
                <div className="flex items-center gap-4">
                  <span className={`text-xl font-black ${isStarter ? 'text-blue-200' : 'text-slate-400'} w-8`}>{player.shirt_number || '-'}</span>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm uppercase">{player.name}</span>
                    {player.date_of_birth && <span className={`text-[9px] uppercase font-bold tracking-widest mt-0.5 ${isStarter ? 'text-blue-300' : 'text-slate-400'}`}>{calculateAge(player.date_of_birth)}</span>}
                  </div>
                </div>
                {isSuspended ? <div className="bg-red-700 text-white p-1.5 rounded-lg flex gap-1 items-center text-[9px] font-black tracking-widest"><Lock size={12}/> {typeof isSuspended === 'string' ? isSuspended : 'NO HABILITADO'}</div> :
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isStarter ? 'bg-white border-white text-blue-600' : 'border-slate-300'}`}>{isStarter && <CheckCircle2 size={16}/>}</div>}
              </button>
            );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] w-full max-w-6xl shadow-2xl flex flex-col h-[90vh] relative overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-6 shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                <Users className="text-blue-600"/> Acta Inicial de Juego
              </h3>
              <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs mt-2">
                Seleccione hasta {maxPlayers} titulares por equipo. La alineación es opcional y puede completarse antes de iniciar.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 ml-4">
              <button onClick={onOpenWO} className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors border border-red-200 shadow-sm">
                <AlertTriangle size={16} /> W.O.
              </button>
              <button onClick={onQuickStart} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors border border-slate-200 shadow-sm">
                <Zap size={16} className="text-amber-500" /> Partido Rápido
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-colors"><X size={24} /></button>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 overflow-hidden">
          {renderTeamList('HOME', match.home_team, homeRoster, homeStartingLineup)}
          {renderTeamList('AWAY', match.away_team, awayRoster, awayStartingLineup)}
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-100 mt-6 shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:hidden w-full gap-2">
            <button onClick={onOpenWO} className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-red-200">
              <AlertTriangle size={18} /> Declarar W.O.
            </button>
            <button onClick={onQuickStart} className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200">
              <Zap size={18} className="text-amber-500" /> Partido Rápido
            </button>
          </div>
          <div className="hidden md:block"></div>
          <button onClick={onTurnMatchLive} disabled={loading} className="w-full md:w-auto px-12 py-4 md:py-5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(220,38,38,0.4)] transition-all disabled:opacity-50">
            <Radio size={20} className="animate-pulse" /> Confirmar Alineaciones e Iniciar
          </button>
        </div>

      </div>
    </div>
  );
}
