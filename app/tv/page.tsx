'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase'; // <-- Import corregido
import { MonitorPlay, Radio, Clock, ArrowRight, Trophy, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';

export default function TvLobbyPage() {
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLiveMatches();

    // Escuchar si un juez arranca un partido nuevo para que aparezca aquí mágicamente
    const channel = supabase.channel('tv-lobby')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => {
        fetchLiveMatches();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchLiveMatches() {
    setLoading(true);
    const { data, error } = await supabase.from('matches')
      .select(`
        id, status, home_score, away_score, current_period, scheduled_time,
        home_team:teams!home_team_id(name, schools(logo_url)),
        away_team:teams!away_team_id(name, schools(logo_url)),
        matchdays!inner(categories(name, sports(name), tournaments(name)))
      `)
      .eq('status', 'LIVE')
      .order('scheduled_time', { ascending: true }); // <-- Error silencioso solucionado aquí

    if (error) {
      console.error("Error buscando partidos en vivo:", error);
    }

    if (data) setLiveMatches(data);
    setLoading(false);
  }

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol')) return <FaFutbol className="text-emerald-500" size={size} />;
    if (name.includes('baloncesto')) return <FaBasketballBall className="text-orange-500" size={size} />;
    if (name.includes('voleibol')) return <FaVolleyballBall className="text-blue-500" size={size} />;
    if (name.includes('softbol') || name.includes('softball') || name.includes('béisbol') || name.includes('beisbol') || name.includes('baseball')) return <FaBaseballBall className="text-red-500" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white font-sans flex flex-col relative overflow-hidden">
      
      {/* Fondo oscuro elegante para el lobby de TV */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-black z-0"></div>

      {/* BARRA SUPERIOR PARA VOLVER */}
      <div className="relative z-20 w-full px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest">
          <ArrowLeft size={16} /> Volver al Inicio
        </Link>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 relative z-10 flex-1 flex flex-col">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8 sm:mb-12 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.1)] p-2 shrink-0">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-widest flex items-center gap-3 leading-tight">
                <MonitorPlay className="text-blue-500 shrink-0" size={28} /> Central de Transmisión
              </h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em] mt-1">Selecciona el partido para proyectar en esta pantalla</p>
            </div>
          </div>
          <div className="w-fit flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
            <Radio size={16} className="text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Buscando Señal</span>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
             <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : liveMatches.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center px-4">
            <MonitorPlay size={64} className="mb-6 opacity-20" />
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-widest text-slate-400">No hay partidos en vivo</h2>
            <p className="text-sm font-medium mt-2">El operador de la Mesa de Control debe iniciar un partido para que aparezca aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveMatches.map(match => {
              const sportName = match.matchdays?.categories?.sports?.name || '';
              return (
                <Link 
                  key={match.id}
                  href={`/tv/${match.id}`}
                  className="group bg-slate-800/50 border border-slate-700 p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] hover:bg-slate-800 hover:border-blue-500 transition-all flex flex-col shadow-xl backdrop-blur-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
                    <div className="flex items-center gap-3 min-w-0">
                      {getSportIcon(sportName, 24)}
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest truncate">{sportName}</span>
                    </div>
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse shrink-0">
                      Live
                    </span>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <div className="flex flex-col items-center gap-3 min-w-0">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-2xl p-2">
                        <img src={match.home_team?.schools?.logo_url} alt={`Logo de ${match.home_team?.name || 'local'}`} className="w-full h-full object-contain" />
                      </div>
                      <span className="text-xs font-black uppercase text-center line-clamp-2">{match.home_team?.name}</span>
                    </div>

                    <div className="flex flex-col items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-black tabular-nums whitespace-nowrap">{match.home_score} - {match.away_score}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{match.current_period}</span>
                    </div>

                    <div className="flex flex-col items-center gap-3 min-w-0">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-2xl p-2">
                        <img src={match.away_team?.schools?.logo_url} alt={`Logo de ${match.away_team?.name || 'visitante'}`} className="w-full h-full object-contain" />
                      </div>
                      <span className="text-xs font-black uppercase text-center line-clamp-2">{match.away_team?.name}</span>
                    </div>
                  </div>

                  <div className="mt-auto pt-6 border-t border-slate-700 flex items-center justify-between w-full group-hover:text-blue-400 text-slate-400 transition-colors">
                    <span className="text-[10px] font-black uppercase tracking-widest">Proyectar Pantalla</span>
                    <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
