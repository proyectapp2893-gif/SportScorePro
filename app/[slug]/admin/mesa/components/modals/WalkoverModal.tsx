'use client';
import React, { useState } from 'react';
import { X, AlertTriangle, RefreshCcw, School, XCircle } from 'lucide-react';

interface WalkoverModalProps {
  match: any;
  loading: boolean;
  onClose: () => void;
  onExecuteWO: (absentTeamId: string) => void;
}

export default function WalkoverModal({ match, loading, onClose, onExecuteWO }: WalkoverModalProps) {
  const [absentTeamId, setAbsentTeamId] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">
        
        <div className="bg-red-600 text-white p-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter">Reporte de Inasistencia (W.O.)</h2>
            <p className="text-red-100 text-[10px] font-bold uppercase tracking-widest mt-1">Penalización automática: -500 pts Fair Play</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><X/></button>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <XCircle size={14}/> 1. Seleccione al equipo ausente
            </label>
            <div className="grid grid-cols-2 gap-4">
              {[match.home_team, match.away_team].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAbsentTeamId(t.id)}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${absentTeamId === t.id ? 'border-red-500 bg-red-50 shadow-md' : 'border-slate-100 bg-slate-50 hover:border-red-200'}`}
                >
                  <div className="w-12 h-12 bg-white rounded-xl p-2 shadow-sm border border-slate-100 flex items-center justify-center">
                    {t.schools?.logo_url ? <img src={t.schools?.logo_url} className="max-w-full max-h-full object-contain" alt={t.name} /> : <School className="text-slate-300 w-8 h-8" />}
                  </div>
                  {/* 🔥 CORRECCIÓN AQUÍ: Se añadió text-slate-800 para forzar el color oscuro 🔥 */}
                  <span className="text-[10px] font-black uppercase truncate w-full text-center text-slate-800">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={() => { if (absentTeamId) onExecuteWO(absentTeamId); }}
            disabled={!absentTeamId || loading}
            className="w-full py-4 md:py-5 bg-red-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-all shadow-xl disabled:opacity-30 disabled:bg-slate-200 disabled:text-slate-500 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCcw className="animate-spin w-5 h-5" /> : 'Confirmar y Cerrar Partido'}
          </button>
        </div>
      </div>
    </div>
  );
}