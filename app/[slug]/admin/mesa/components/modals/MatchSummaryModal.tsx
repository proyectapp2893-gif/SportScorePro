'use client';
import React from 'react';
import { X, Trophy, School, CheckCircle2, Activity, Square } from 'lucide-react';
import { FaFutbol } from 'react-icons/fa';

interface MatchSummaryModalProps {
  match: any;
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number;
  awayPenaltyScore: number;
  currentPeriod: string;
  liveEvents: any[];
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function MatchSummaryModal({
  match, homeScore, awayScore, homePenaltyScore, awayPenaltyScore,
  currentPeriod, liveEvents, loading, onClose, onConfirm
}: MatchSummaryModalProps) {
  
  const homeIsLeading = currentPeriod === 'PEN' ? homePenaltyScore > awayPenaltyScore : homeScore > awayScore;
  const awayIsLeading = currentPeriod === 'PEN' ? awayPenaltyScore > homePenaltyScore : awayScore > homeScore;

  // Filtro estricto: Ocultar titulares, mostrar solo goles y tarjetas
  const validEvents = liveEvents.filter(e => 
    e.event_type === 'GOAL' || e.event_type === 'YELLOW' || e.event_type === 'RED'
  );

  return (
    // EL CONTENEDOR PRINCIPAL: Z-INDEX AL MÁXIMO ABSOLUTO Y FONDO OSCURO
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 sm:p-8 animate-in fade-in duration-300">
      
      {/* EL MODAL: ESTRUCTURA CERRADA PARA EVITAR FILTRACIONES */}
      <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative z-50">
        
        {/* ======================================================== */}
        {/* 1. HEADER OSCURO                                         */}
        {/* ======================================================== */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center shrink-0 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-full bg-[url('/bg-futbol.jpg')] opacity-20 bg-cover bg-center z-0"></div>
           <div className="relative z-10">
             <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-emerald-400 drop-shadow-md">Reporte Final</h2>
             <p className="text-slate-300 font-bold uppercase tracking-[0.2em] text-[10px] mt-1">Revisión previa al cierre de acta</p>
           </div>
           <button onClick={onClose} className="relative z-10 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
             <X size={20}/>
           </button>
        </div>
        
        {/* ======================================================== */}
        {/* 2. MARCADOR CENTRADO                                     */}
        {/* ======================================================== */}
        <div className="grid grid-cols-3 items-center gap-4 py-6 px-4 sm:px-8 border-b border-slate-100 bg-slate-50 shrink-0 relative z-10">
           
           {/* LOCAL */}
           <div className="flex flex-col sm:flex-row items-center justify-end gap-4 z-10 text-center sm:text-right">
             <div className="order-2 sm:order-1 flex flex-col items-center sm:items-end">
                <h3 className="text-sm sm:text-xl font-black uppercase leading-tight text-slate-800">{match.home_team?.name}</h3>
                {homeIsLeading && <span className="text-[9px] font-black text-white bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 rounded-full shadow-sm border border-emerald-400 uppercase tracking-widest mt-1 inline-flex items-center gap-1"><Trophy size={10} className="text-yellow-300"/> Ganador</span>}
             </div>
             <div className="order-1 sm:order-2 w-14 h-14 bg-white rounded-2xl p-2 border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="max-w-full max-h-full object-contain" alt="Local" /> : <School className="text-slate-300 w-full h-full" />}
             </div>
           </div>

           {/* NÚMEROS (SCORE) */}
           <div className="flex flex-col items-center justify-center z-10">
             <div className="bg-slate-900 text-white px-6 py-2 sm:py-3 rounded-[1.5rem] flex gap-4 text-3xl sm:text-4xl font-black tabular-nums shadow-lg border-4 border-slate-800">
                <span>{homeScore}</span><span className="text-emerald-500 opacity-50">-</span><span>{awayScore}</span>
             </div>
             {currentPeriod === 'PEN' && <div className="mt-3 text-[10px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 shadow-inner uppercase tracking-[0.2em] px-4 py-1.5 rounded-full flex items-center gap-1.5">PENALES: <span className="text-emerald-900">{homePenaltyScore} - {awayPenaltyScore}</span></div>}
           </div>

           {/* VISITANTE */}
           <div className="flex flex-col sm:flex-row items-center justify-start gap-4 z-10 text-center sm:text-left">
             <div className="w-14 h-14 bg-white rounded-2xl p-2 border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="max-w-full max-h-full object-contain" alt="Visitante" /> : <School className="text-slate-300 w-full h-full" />}
             </div>
             <div className="flex flex-col items-center sm:items-start">
                <h3 className="text-sm sm:text-xl font-black uppercase leading-tight text-slate-800">{match.away_team?.name}</h3>
                {awayIsLeading && <span className="text-[9px] font-black text-white bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 rounded-full shadow-sm border border-emerald-400 uppercase tracking-widest mt-1 inline-flex items-center gap-1"><Trophy size={10} className="text-yellow-300"/> Ganador</span>}
             </div>
           </div>
        </div>

        {/* ======================================================== */}
        {/* 3. LÍNEA DE TIEMPO (EVENTOS DE JUEGO)                      */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-50/50 relative shadow-[inset_0_10px_20px_rgba(0,0,0,0.02)] z-10">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-3 justify-center">
             <Activity size={18}/> Línea de Tiempo Oficial
          </h4>
          
          {validEvents.length === 0 ? (
             <div className="text-center py-12 text-slate-400 font-bold italic text-sm">No hay goles ni tarjetas registradas en este partido.</div>
          ) : (
             <div className="space-y-8 relative before:absolute before:inset-0 before:mx-auto before:h-full before:w-1 before:bg-slate-200 z-10 max-w-3xl mx-auto pb-8">
                {validEvents.map((event, idx) => {
                   const isHome = event.team_id === match.home_team.id;
                   const previousEvent = idx > 0 ? validEvents[idx - 1] : null;
                   const showPeriodDivider = !previousEvent || previousEvent.period !== event.period;

                   return (
                      <React.Fragment key={idx}>
                         {showPeriodDivider && (
                           <div className="relative z-20 flex justify-center py-4">
                             <span className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.3em] px-6 py-2 rounded-full shadow-md border-2 border-slate-700">
                               {event.period}
                             </span>
                           </div>
                         )}

                         <div className={`relative flex items-center justify-between ${!isHome ? 'flex-row-reverse' : ''} group z-10 mt-2`}>
                            <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border-4 border-white bg-slate-100 shadow-md shrink-0 z-10 absolute left-1/2 transform -translate-x-1/2">
                               {event.event_type === 'GOAL' && <FaFutbol className="text-emerald-500 w-5 h-5" />}
                               {event.event_type === 'YELLOW' && <Square className="text-yellow-400 fill-yellow-400 w-4 h-4" />}
                               {event.event_type === 'RED' && <Square className="text-red-600 fill-red-600 w-4 h-4" />}
                            </div>
                            
                            <div className={`w-[calc(50%-2.5rem)] p-4 sm:p-6 rounded-[2rem] border-2 shadow-sm transition-all z-0 ${event.event_type === 'GOAL' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
                               <div className={`flex flex-col ${isHome ? 'items-end' : 'items-start'}`}>
                                  <div className="flex items-center gap-3 mb-2">
                                     <span className="text-[10px] font-black text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-lg uppercase tracking-widest shadow-sm">{event.period} • Min {event.minute_record}'</span>
                                  </div>
                                  <p className={`font-black text-base sm:text-xl uppercase text-slate-800 ${isHome ? 'text-right' : 'text-left'} leading-tight`}>
                                     {event.event_type === 'GOAL' && <span className="text-emerald-600 drop-shadow-sm">GOL</span>}
                                     {event.event_type === 'YELLOW' && <span className="text-yellow-600">AMONESTACIÓN</span>}
                                     {event.event_type === 'RED' && <span className="text-red-600">EXPULSIÓN</span>}
                                  </p>
                                  <p className={`text-slate-500 font-bold text-xs uppercase mt-1 ${isHome ? 'text-right' : 'text-left'} truncate w-full`}>
                                     {event.players ? `${event.players.shirt_number || '-'} • ${event.players.name}` : '(ACCIÓN DE EQUIPO)'}
                                  </p>
                               </div>
                            </div>
                         </div>
                      </React.Fragment>
                   )
                })}
             </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 4. BOTÓN DE CONFIRMACIÓN (FOOTER DEL MODAL)                */}
        {/* ======================================================== */}
        <div className="p-5 sm:p-6 bg-slate-900 shrink-0 shadow-[0_-20px_40px_rgba(0,0,0,0.15)] relative z-20 text-center border-t border-slate-800">
           <button onClick={onConfirm} disabled={loading} className="w-full max-w-md mx-auto py-4 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50">
             <CheckCircle2 size={20}/> Confirmar y Cerrar Acta
           </button>
        </div>
      </div>
    </div>
  );
}