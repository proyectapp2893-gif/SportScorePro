'use client';
import React, { useState } from 'react';
import { Trophy, Star, Activity, School, Medal, Shield } from 'lucide-react';
import { getSportRules, isBasketballSport, isSetBasedSport, isSoccerSport } from '../../../lib/sports/rules';

// ============================================================================
// 1. RENDER DE LA TABLA GENERAL (POSICIONES) - GRILLA BLINDADA
// ============================================================================
export const renderPosiciones = (sportName: string, teams: any[], activeTournament: any) => {
  const sportRules = getSportRules(sportName);
  const isVolleyball = isSetBasedSport(sportName);
  const isBasketball = isBasketballSport(sportName);
  const isFairPlayActive = activeTournament?.fair_play_enabled;
  const fpStartingPoints = activeTournament?.fp_starting_points ?? 0;

  // 🔥 SOLUCIÓN DEFINITIVA DEL GRID: Usamos CSS nativo para que nunca colapse 🔥
  const gridTemplate = isFairPlayActive 
    ? "2.5rem minmax(160px, 2fr) repeat(7, minmax(30px, 1fr)) 3.5rem 3.5rem" 
    : "2.5rem minmax(160px, 2fr) repeat(7, minmax(30px, 1fr)) 3.5rem";

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 relative">
      <div className="p-4 md:p-8 flex items-center gap-3 border-b border-slate-100 relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50"></div>
         <Activity className="text-blue-500 relative z-10" size={24} />
         <h2 className="text-lg md:text-2xl font-black text-slate-800 uppercase tracking-tighter relative z-10">Clasificación General</h2>
      </div>

      <div className="overflow-x-auto w-full scrollbar-hide">
        <div className="min-w-[680px] md:min-w-[750px] w-full">
          {/* Header de la Tabla */}
          <div 
            style={{ gridTemplateColumns: gridTemplate }} 
            className="grid items-center bg-slate-50/80 px-2 md:px-6 py-3 border-b border-slate-100 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center sticky top-0 z-20 backdrop-blur-md"
          >
            <div>#</div>
            <div className="text-left px-2 md:px-4">Delegación</div>
            <div>PJ</div>
            <div className="text-emerald-600">PG</div>
            <div className="text-amber-500">PE</div>
            <div className="text-red-500">PP</div>
            <div>{isBasketball || isVolleyball ? sportRules.scoreLabels.for : 'GF'}</div>
            <div>{isBasketball || isVolleyball ? sportRules.scoreLabels.against : 'GC'}</div>
            <div>DIF</div>
            {isFairPlayActive && <div className="text-blue-500">FP</div>}
            <div className="text-slate-800 text-[10px] md:text-sm">PTS</div>
          </div>

          {/* Filas de la Tabla */}
          <div className="divide-y divide-slate-50">
            {teams.length === 0 ? (
               <div className="py-16 text-center text-slate-400 font-bold text-sm uppercase tracking-widest bg-white">No hay equipos registrados</div>
            ) : (
               teams.map((team, index) => {
                 const diff = (team.goals_for || 0) - (team.goals_against || 0);
                 const isTop = index === 0;

                 return (
                   <div 
                     key={team.id} 
                     style={{ gridTemplateColumns: gridTemplate }} 
                     className={`grid items-center px-2 md:px-6 py-2.5 md:py-3.5 transition-all text-center relative group
                       ${isTop ? 'bg-yellow-50/40 border-l-4 border-yellow-400' : 'bg-white border-l-4 border-transparent hover:bg-slate-50/80'}
                     `}
                   >
                     {/* Posición sin copa */}
                     <div className="flex justify-center">
                        <span className={`text-sm md:text-lg font-black ${isTop ? 'text-yellow-600' : 'text-slate-400 group-hover:text-slate-600'}`}>{index + 1}</span>
                     </div>
                     
                     {/* Equipo */}
                     <div className="flex items-center gap-2 md:gap-4 px-2 md:px-4 text-left">
                       <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl p-1.5 flex items-center justify-center shrink-0 border ${isTop ? 'bg-white border-yellow-200 shadow-sm' : 'bg-slate-50 border-slate-100 group-hover:border-slate-200'}`}>
                         {team.schools?.logo_url ? <img src={team.schools.logo_url} className="max-w-full max-h-full object-contain" /> : <School className="w-full h-full text-slate-300" />}
                       </div>
                       <span className={`font-black uppercase text-[10px] md:text-sm truncate w-full tracking-tight ${isTop ? 'text-yellow-900' : 'text-slate-700'}`}>{team.name}</span>
                     </div>

                     {/* Estadísticas */}
                     <div className="text-slate-500 font-bold text-[10px] md:text-sm">{team.played || 0}</div>
                     <div className="text-emerald-600 font-bold text-[10px] md:text-sm">{team.won || 0}</div>
                     <div className="text-amber-500 font-bold text-[10px] md:text-sm">{team.drawn || 0}</div>
                     <div className="text-red-500 font-bold text-[10px] md:text-sm">{team.lost || 0}</div>
                     <div className="text-slate-500 font-bold text-[10px] md:text-sm">{team.goals_for || 0}</div>
                     <div className="text-slate-500 font-bold text-[10px] md:text-sm">{team.goals_against || 0}</div>
                     <div className={`font-black text-[10px] md:text-sm ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                       {diff > 0 ? '+' : ''}{diff}
                     </div>
                     
                     {isFairPlayActive && (
                       <div className="text-blue-600 font-black text-[10px] md:text-sm">{team.fair_play_points ?? fpStartingPoints}</div>
                     )}

                     {/* Puntos */}
                     <div className="text-slate-900 font-black text-sm md:text-xl">{team.points || 0}</div>
                   </div>
                 );
               })
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-50/50 p-4 md:p-6 border-t border-slate-100 flex flex-wrap gap-x-4 md:gap-x-8 gap-y-2 md:gap-y-3 justify-center text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-400">
        <span>PJ: Jugados</span>
        <span className="text-emerald-600/70">PG: Ganados</span>
        <span className="text-amber-500/70">PE: Empatados</span>
        <span className="text-red-500/70">PP: Perdidos</span>
        <span>{isBasketball || isVolleyball ? `${sportRules.scoreLabels.for}: Puntos a Favor` : 'GF: Goles a Favor'}</span>
        <span>{isBasketball || isVolleyball ? `${sportRules.scoreLabels.against}: Puntos en Contra` : 'GC: Goles en Contra'}</span>
        <span>DIF: Diferencia</span>
        {isFairPlayActive && <span className="text-blue-500/70">FP: Fair Play</span>}
        <span className="text-slate-600">PTS: Puntos</span>
      </div>
    </div>
  );
};


// ============================================================================
// 2. RENDER DE ESTADÍSTICAS - PODIO TOP 3 + LISTA COMPLETA
// ============================================================================
const EstadisticasContent = ({ sportName, teams, scorers }: { sportName: string, teams: any[], scorers: any[] }) => {
  const [activeStatTab, setActiveStatTab] = useState<'GOLEADORES' | 'VALLA' | 'FAIRPLAY'>('GOLEADORES');
  const isSoccer = isSoccerSport(sportName);

  const scorerLabel = isSoccer ? "Goleadores" : "Anotadores";

  const sortedValla = [...teams].filter(t => t.played > 0).sort((a, b) => (a.goals_against || 0) - (b.goals_against || 0));
  const sortedFairPlay = [...teams].sort((a, b) => (b.fair_play_points || 0) - (a.fair_play_points || 0));

  // RENDER DEL PODIO TOP 3
  const renderPodium = (data: any[], type: 'GOLEADOR' | 'VALLA' | 'FAIRPLAY') => {
    const top3 = data.slice(0, 3);
    if (top3.length === 0) {
      const emptyLabel = type === 'GOLEADOR'
        ? `Aún no hay ${isSoccer ? 'goles' : 'anotaciones'} en partidos en vivo o finalizados`
        : 'Aún no hay datos suficientes';

      return <div className="text-center py-10 text-slate-400 font-bold uppercase tracking-widest text-xs">{emptyLabel}</div>;
    }

    const PodiumStep = ({ item, rank }: { item: any, rank: number }) => {
      const isGold = rank === 1;
      const isSilver = rank === 2;
      const isBronze = rank === 3;
      
      const heightClass = isGold ? 'h-32 md:h-48' : isSilver ? 'h-24 md:h-36' : 'h-20 md:h-28';
      const colorClass = isGold ? 'bg-gradient-to-t from-yellow-200 to-yellow-50 border-yellow-400' : 
                         isSilver ? 'bg-gradient-to-t from-slate-200 to-slate-50 border-slate-300' : 
                         'bg-gradient-to-t from-amber-300/40 to-amber-50/50 border-amber-400/50';
      
      const textColor = isGold ? 'text-yellow-600' : isSilver ? 'text-slate-500' : 'text-amber-700';

      let name = type === 'GOLEADOR' ? item.name : item.name;
      let sub = type === 'GOLEADOR' ? item.teams?.name : '';
      let logo = type === 'GOLEADOR' ? item.teams?.schools?.logo_url : item.schools?.logo_url;
      let score = type === 'GOLEADOR' ? item.totalPoints : type === 'VALLA' ? item.goals_against : item.fair_play_points;

      return (
        <div className={`flex flex-col items-center justify-end flex-1 min-w-0 max-w-[92px] sm:max-w-[120px] md:max-w-[160px] animate-in slide-in-from-bottom duration-500 ${isGold ? 'delay-200' : isSilver ? 'delay-100' : 'delay-300'}`}>
          <div className="flex flex-col items-center mb-2 md:mb-4 relative z-10 w-full px-1">
            <div className={`rounded-full bg-white shadow-lg mb-2 md:mb-3 flex items-center justify-center border-2 overflow-hidden shrink-0 ${isGold ? 'border-yellow-400 w-14 h-14 sm:w-16 sm:h-16 md:w-24 md:h-24 p-2 sm:p-2.5 md:p-4 shadow-yellow-200' : 'w-11 h-11 sm:w-12 sm:h-12 md:w-16 md:h-16 p-2 md:p-3'} ${isSilver ? 'border-slate-300' : ''} ${isBronze ? 'border-amber-500/50' : ''}`}>
               {logo ? <img src={logo} alt={`Logo de ${name}`} className="max-w-full max-h-full object-contain rounded-sm"/> : <School className="w-full h-full text-slate-300"/>}
            </div>
            <span className={`font-black text-[9px] sm:text-[10px] md:text-sm uppercase text-center line-clamp-2 w-full px-1 leading-tight ${isGold ? 'text-slate-900' : 'text-slate-700'}`}>{name}</span>
            {sub && <span className="text-[7px] md:text-[10px] font-bold text-slate-400 uppercase truncate w-full text-center mt-0.5">{sub}</span>}
            <span className={`font-black text-xl md:text-3xl mt-1 md:mt-2 ${textColor}`}>{score}</span>
          </div>
          
          <div className={`w-full ${heightClass} ${colorClass} border-t-4 rounded-t-xl md:rounded-t-2xl flex justify-center shadow-inner relative overflow-hidden`}>
            <span className={`text-4xl md:text-7xl font-black mt-2 md:mt-4 opacity-50 ${textColor}`}>{rank}</span>
          </div>
        </div>
      );
    };

    return (
      <div className="flex items-end justify-center gap-1.5 sm:gap-3 md:gap-6 mt-6 sm:mt-8 w-full overflow-hidden">
        {top3[1] && <PodiumStep item={top3[1]} rank={2} />}
        {top3[0] && <PodiumStep item={top3[0]} rank={1} />}
        {top3[2] && <PodiumStep item={top3[2]} rank={3} />}
      </div>
    );
  }

  // RENDER DE LA LISTA COMPLETA 
  const renderFullList = (data: any[], type: 'GOLEADOR' | 'VALLA' | 'FAIRPLAY') => {
    if (data.length === 0) return null;
    
    let scoreLabel = type === 'GOLEADOR' ? (isSoccer ? 'Goles' : 'Puntos') : type === 'VALLA' ? 'Goles' : 'Puntos';

    return (
      <div className="mt-10 pt-8 border-t border-slate-100 w-full space-y-3">
        <h4 className="text-center font-black text-slate-300 uppercase tracking-widest text-[10px] md:text-xs mb-6">Clasificación Detallada</h4>
        
        {data.map((item, idx) => {
          let name = type === 'GOLEADOR' ? item.name : item.name;
          let sub = type === 'GOLEADOR' ? item.teams?.name : '';
          let logo = type === 'GOLEADOR' ? item.teams?.schools?.logo_url : item.schools?.logo_url;
          let score = type === 'GOLEADOR' ? item.totalPoints : type === 'VALLA' ? item.goals_against : item.fair_play_points;
          let rank = idx + 1;

          return (
            <div key={item.id} className="flex items-center p-3 md:p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-100 group min-w-0">
              <span className={`w-7 sm:w-8 text-center font-black shrink-0 ${rank === 1 ? 'text-yellow-500 text-lg' : rank === 2 ? 'text-slate-400 text-lg' : rank === 3 ? 'text-amber-600 text-lg' : 'text-slate-300'}`}>{rank}</span>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl p-1.5 md:p-2 border border-slate-200 mx-3 md:mx-4 shrink-0 shadow-sm">
                {logo ? <img src={logo} alt={`Logo de ${name}`} className="w-full h-full object-contain" /> : <School className="text-slate-300 w-full h-full"/>}
              </div>
              <div className="flex-1 overflow-hidden min-w-0">
                <p className="font-black text-xs md:text-sm uppercase text-slate-800 line-clamp-2 leading-tight">{name}</p>
                {sub && <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{sub}</p>}
              </div>
              <div className="flex flex-col items-end w-14 sm:w-16 pr-1 sm:pr-2 shrink-0">
                <span className="text-lg md:text-xl font-black text-slate-700 leading-none">{score}</span>
                <span className="text-[7px] md:text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{scoreLabel}</span>
              </div>
            </div>
          )
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Botones de Pestañas (Tabs) */}
      <div className="flex justify-center bg-slate-100 p-1 md:p-1.5 rounded-2xl w-fit mx-auto shadow-inner overflow-x-auto scrollbar-hide max-w-full">
        <button 
          onClick={() => setActiveStatTab('GOLEADORES')} 
          className={`shrink-0 px-4 md:px-8 py-2 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeStatTab === 'GOLEADORES' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Star size={16} className="md:w-5 md:h-5"/> {scorerLabel}
        </button>
        {isSoccer && (
          <button 
            onClick={() => setActiveStatTab('VALLA')} 
            className={`shrink-0 px-4 md:px-8 py-2 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeStatTab === 'VALLA' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Shield size={16} className="md:w-5 md:h-5"/> Valla
          </button>
        )}
        <button 
          onClick={() => setActiveStatTab('FAIRPLAY')} 
          className={`shrink-0 px-4 md:px-8 py-2 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeStatTab === 'FAIRPLAY' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Medal size={16} className="md:w-5 md:h-5"/> Fair Play
        </button>
      </div>

      {/* Contenedor Principal del Podio + Lista */}
      <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 shadow-sm p-4 md:p-8 animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center overflow-hidden">
        
        {activeStatTab === 'GOLEADORES' && (
          <>
            <h3 className="text-xl md:text-2xl font-black uppercase text-slate-800 tracking-tighter text-center mb-2">Top 3 {scorerLabel}</h3>
            {renderPodium(scorers, 'GOLEADOR')}
            {renderFullList(scorers, 'GOLEADOR')}
          </>
        )}

        {activeStatTab === 'VALLA' && isSoccer && (
          <>
            <h3 className="text-xl md:text-2xl font-black uppercase text-slate-800 tracking-tighter text-center mb-2">Top 3 Valla Menos Vencida</h3>
            {renderPodium(sortedValla, 'VALLA')}
            {renderFullList(sortedValla, 'VALLA')}
          </>
        )}

        {activeStatTab === 'FAIRPLAY' && (
          <>
            <h3 className="text-xl md:text-2xl font-black uppercase text-slate-800 tracking-tighter text-center mb-2">Top 3 Juego Limpio</h3>
            {renderPodium(sortedFairPlay, 'FAIRPLAY')}
            {renderFullList(sortedFairPlay, 'FAIRPLAY')}
          </>
        )}

      </div>
    </div>
  );
};

export const renderEstadisticas = (sportName: string, teams: any[], scorers: any[]) => {
  return <EstadisticasContent sportName={sportName} teams={teams} scorers={scorers} />;
};
