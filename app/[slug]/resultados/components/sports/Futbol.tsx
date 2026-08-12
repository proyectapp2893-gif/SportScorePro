import { Activity, Shield, Star, Hash, School, Award } from 'lucide-react';

export function FutbolPosiciones({ teams, activeTournament }: { teams: any[], activeTournament: any }) {
  return (
    <div className="bg-white border border-slate-200 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden shadow-sm animate-in fade-in">
      <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <h3 className="text-sm md:text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
          <Activity size={18} className="text-blue-600"/> Clasificación General
        </h3>
      </div>
      
      <div className="w-full overflow-x-auto scrollbar-hide pb-2">
        <table className="w-full text-left min-w-[600px] md:min-w-[800px]">
          <thead>
            <tr className="bg-white text-[8px] md:text-[10px] text-slate-400 uppercase font-black tracking-widest border-b-2 border-slate-100">
              <th className="p-3 md:p-4 text-center w-10"><Hash size={12}/></th>
              <th className="p-3 md:p-4">Delegación</th>
              <th className="p-3 md:p-4 text-center" title="Partidos Jugados">PJ</th>
              <th className="p-3 md:p-4 text-center text-emerald-600" title="Partidos Ganados">PG</th>
              <th className="p-3 md:p-4 text-center text-amber-500" title="Partidos Empatados">PE</th>
              <th className="p-3 md:p-4 text-center text-red-500" title="Partidos Perdidos">PP</th>
              <th className="p-3 md:p-4 text-center" title="Goles a Favor">GF</th>
              <th className="p-3 md:p-4 text-center" title="Goles en Contra">GC</th>
              <th className="p-3 md:p-4 text-center" title="Diferencia de Goles">DIF</th>
              {activeTournament?.fair_play_enabled && (
                <th className="p-3 md:p-4 text-center text-blue-600 bg-blue-50/50" title="Fair Play">FP</th>
              )}
              <th className="p-3 md:p-4 text-center text-slate-900 bg-slate-50">PTS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {teams.length === 0 ? (
              <tr><td colSpan={11} className="p-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">Sin datos registrados</td></tr>
            ) : (
              teams.map((team, index) => {
                const diff = (team.goals_for || 0) - (team.goals_against || 0);
                const diffDisplay = diff > 0 ? `+${diff}` : diff;
                
                return (
                  <tr key={team.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 md:p-4 text-center font-black text-slate-400 text-[10px] md:text-sm">{index + 1}</td>
                    <td className="p-3 md:p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full border border-slate-100 flex items-center justify-center overflow-hidden shrink-0 shadow-sm bg-white p-1">
                          {team.schools?.logo_url ? <img src={team.schools.logo_url} className="w-full h-full object-contain" /> : <School size={12} className="text-slate-300"/>}
                        </div>
                        <span className="font-black uppercase text-[10px] md:text-xs text-slate-800 truncate max-w-[100px] md:max-w-[200px]">{team.name}</span>
                      </div>
                    </td>
                    <td className="p-3 md:p-4 text-center font-bold text-slate-500 text-[10px] md:text-xs">{team.played || 0}</td>
                    <td className="p-3 md:p-4 text-center font-bold text-emerald-600 text-[10px] md:text-xs">{team.won || 0}</td>
                    <td className="p-3 md:p-4 text-center font-bold text-amber-500 text-[10px] md:text-xs">{team.drawn || 0}</td>
                    <td className="p-3 md:p-4 text-center font-bold text-red-500 text-[10px] md:text-xs">{team.lost || 0}</td>
                    <td className="p-3 md:p-4 text-center font-bold text-slate-600 text-[10px] md:text-xs">{team.goals_for || 0}</td>
                    <td className="p-3 md:p-4 text-center font-bold text-slate-600 text-[10px] md:text-xs">{team.goals_against || 0}</td>
                    <td className={`p-3 md:p-4 text-center font-black text-[10px] md:text-xs ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                      {diffDisplay}
                    </td>
                    {activeTournament?.fair_play_enabled && (
                      <td className="p-3 md:p-4 text-center font-black text-[10px] md:text-xs text-blue-600 bg-blue-50/30">
                        {team.fair_play_points ?? activeTournament.fp_starting_points}
                      </td>
                    )}
                    <td className="p-3 md:p-4 pr-4 md:pr-6 text-center font-black text-sm md:text-lg text-slate-900 bg-slate-50/80">
                      {team.points || 0}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-2 text-[9px] md:text-[10px] text-slate-500 uppercase font-bold tracking-widest justify-center">
        <span><strong>PJ:</strong> Jugados</span>
        <span><strong>PG:</strong> Ganados</span>
        <span><strong>PE:</strong> Empatados</span>
        <span><strong>PP:</strong> Perdidos</span>
        <span><strong>GF:</strong> Goles a Favor</span>
        <span><strong>GC:</strong> Goles en Contra</span>
        <span><strong>DIF:</strong> Diferencia</span>
        {activeTournament?.fair_play_enabled && <span><strong>FP:</strong> Fair Play</span>}
        <span><strong>PTS:</strong> Puntos</span>
      </div>
    </div>
  );
}

export function FutbolEstadisticas({ teams, scorers }: { teams: any[], scorers: any[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 animate-in fade-in">
      
      {/* 1. GOLEADORES */}
      <div className="bg-white border border-slate-200 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-sm h-fit">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 md:p-3 bg-blue-50 text-blue-600 rounded-lg md:rounded-xl"><Star className="w-5 h-5 md:w-6 md:h-6"/></div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tighter">Tabla de Goleadores</h3>
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Top 10 Oficial</p>
          </div>
        </div>
        
        <div className="space-y-2 md:space-y-3">
          {scorers.length === 0 ? (
            <p className="text-center text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest py-10 border border-dashed border-slate-200 rounded-xl md:rounded-2xl">Sin registros</p>
          ) : (
            scorers.map((scorer, i) => (
              <div key={scorer.id} className="flex items-center w-full p-3 md:p-4 bg-slate-50 rounded-lg md:rounded-xl border border-slate-100 hover:border-blue-200 transition-colors gap-2">
                
                {/* Posición y Logo (No se encojen) */}
                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                  <span className={`font-black text-base md:text-lg w-5 md:w-6 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-300'}`}>{i+1}</span>
                  <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-white rounded-lg p-1.5 border border-slate-200 shadow-sm flex items-center justify-center">
                    {scorer.teams?.schools?.logo_url ? <img src={scorer.teams.schools.logo_url} className="max-w-full max-h-full object-contain" title={scorer.teams?.name} /> : <School size={20} className="text-slate-300"/>}
                  </div>
                </div>

                {/* Textos (Se encojen y ponen "..." si es necesario) */}
                <div className="flex flex-col justify-center flex-1 min-w-0 px-1">
                  <span className="font-black text-slate-800 uppercase text-xs md:text-sm truncate w-full leading-tight">{scorer.name}</span>
                  <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate w-full mt-0.5">{scorer.teams?.name}</span>
                </div>

                {/* Goles (No se encoje, siempre a la derecha) */}
                <div className="shrink-0 text-right pl-2">
                  <span className="font-black text-xl md:text-2xl text-blue-600 leading-none block">{scorer.totalPoints}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. VALLA MENOS VENCIDA */}
      <div className="bg-white border border-slate-200 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-sm h-fit">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 md:p-3 bg-emerald-50 text-emerald-600 rounded-lg md:rounded-xl"><Shield className="w-5 h-5 md:w-6 md:h-6"/></div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tighter">Valla Menos Vencida</h3>
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Menos goles en contra</p>
          </div>
        </div>

        <div className="space-y-2 md:space-y-3">
          {teams.filter(t => t.played > 0).length === 0 ? (
            <p className="text-center text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest py-10 border border-dashed border-slate-200 rounded-xl md:rounded-2xl">Torneo sin iniciar</p>
          ) : (
            [...teams].filter(t => t.played > 0).sort((a: any, b: any) => a.goals_against - b.goals_against).slice(0, 5).map((team, i) => (
              <div key={team.id} className="flex items-center w-full p-3 md:p-4 bg-slate-50 rounded-lg md:rounded-xl border border-slate-100 gap-2">
                
                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                  <span className="font-black text-slate-300 text-base md:text-lg w-5 md:w-6 text-center shrink-0">{i+1}</span>
                  <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-white rounded-lg p-1.5 border border-slate-200 shadow-sm flex items-center justify-center">
                    {team.schools?.logo_url ? <img src={team.schools.logo_url} className="max-w-full max-h-full object-contain"/> : <School size={20} className="text-slate-300"/>}
                  </div>
                </div>

                <div className="flex flex-col justify-center flex-1 min-w-0 px-1">
                  <span className="font-black text-slate-800 uppercase text-xs md:text-sm truncate w-full leading-tight">{team.name}</span>
                </div>

                <div className="flex flex-col items-end shrink-0 pl-2">
                  <span className="font-black text-lg md:text-xl text-emerald-600 leading-none">{team.goals_against}</span>
                  <span className="text-[7px] md:text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Goles</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. MAYOR JUEGO LIMPIO (FAIR PLAY) */}
      <div className="bg-white border border-slate-200 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-sm h-fit">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 md:p-3 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl"><Award className="w-5 h-5 md:w-6 md:h-6"/></div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tighter">Juego Limpio</h3>
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ranking Fair Play</p>
          </div>
        </div>

        <div className="space-y-2 md:space-y-3">
          {teams.length === 0 ? (
            <p className="text-center text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest py-10 border border-dashed border-slate-200 rounded-xl md:rounded-2xl">Torneo sin iniciar</p>
          ) : (
            [...teams].sort((a: any, b: any) => (b.fair_play_points ?? 10000) - (a.fair_play_points ?? 10000)).slice(0, 5).map((team, i) => (
              <div key={team.id} className="flex items-center w-full p-3 md:p-4 bg-slate-50 rounded-lg md:rounded-xl border border-slate-100 gap-2">
                
                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                  <span className={`font-black text-base md:text-lg w-5 md:w-6 text-center shrink-0 ${i === 0 ? 'text-amber-500' : 'text-slate-300'}`}>{i+1}</span>
                  <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-white rounded-lg p-1.5 border border-slate-200 shadow-sm flex items-center justify-center">
                    {team.schools?.logo_url ? <img src={team.schools.logo_url} className="max-w-full max-h-full object-contain"/> : <School size={20} className="text-slate-300"/>}
                  </div>
                </div>

                <div className="flex flex-col justify-center flex-1 min-w-0 px-1">
                  <span className="font-black text-slate-800 uppercase text-xs md:text-sm truncate w-full leading-tight">{team.name}</span>
                </div>

                <div className="flex flex-col items-end shrink-0 pl-2">
                  <span className="font-black text-lg md:text-xl text-indigo-600 leading-none">{team.fair_play_points ?? 10000}</span>
                  <span className="text-[7px] md:text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Puntos</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}