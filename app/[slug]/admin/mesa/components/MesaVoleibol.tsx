'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { ArrowLeft, CheckCircle2, Minus, Plus, School, X, Trophy, ArrowRight, Activity, ShieldCheck, Square, Play, RotateCcw, AlertTriangle, Radio, Users, Zap, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { FaVolleyballBall } from 'react-icons/fa';
import { closeVolleyballSet, finishCourtMatch, recordGenericMatchEvent, revertLastScoringEvent, startLiveMatch } from '../actions';
import { evaluatePlayerEligibility } from '@/app/lib/competition/player-eligibility';

interface MesaVoleibolProps {
  match: any;
  categoryData: any;
  slug: string;
  onClose: () => void;
  onMatchUpdate: () => void;
}

export default function MesaVoleibol({ match, categoryData, slug, onClose, onMatchUpdate }: MesaVoleibolProps) {
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  
  const [homeSetsWon, setHomeSetsWon] = useState(match.home_score || 0); 
  const [awaySetsWon, setAwaySetsWon] = useState(match.away_score || 0);

  const [setHistory, setSetHistory] = useState<any[]>([]);

  const [currentPeriod, setCurrentPeriod] = useState(match.current_period || 'S1');
  const [isMatchLive, setIsMatchLive] = useState(match.status === 'LIVE');
  const [server, setServer] = useState<'HOME' | 'AWAY' | null>(null);

  const [homeRoster, setHomeRoster] = useState<any[]>([]);
  const [awayRoster, setAwayRoster] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);

  const [showStartingLineupModal, setShowStartingLineupModal] = useState(false);
  const [homeStartingLineup, setHomeStartingLineup] = useState<string[]>([]);
  const [awayStartingLineup, setAwayStartingLineup] = useState<string[]>([]);

  const isPadel = categoryData?.sports?.name.includes('PADEL') || categoryData?.sports?.name.includes('TENIS');
  const maxPlayers = isPadel ? 2 : 6;
  const minPlayers = isPadel ? 1 : 6;
  
  const targetScore = isPadel ? 6 : (currentPeriod === 'S5' ? 15 : 25);

  const [loading, setLoading] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false); 
  const [showRosterModal, setShowRosterModal] = useState<'HOME' | 'AWAY' | null>(null); 
  const [scoringAction, setScoringAction] = useState<{ team: 'HOME' | 'AWAY', type: 'SCORE' | 'YELLOW' | 'RED' | 'SUB' | 'SCORE_MINUS', points: number } | null>(null);
  const [subOutPlayer, setSubOutPlayer] = useState<string | null>(null);
  const playerEligibility = (player: any) => evaluatePlayerEligibility({ playerId: player.id, registered: true, teamId: player.team_id, documents: player.player_documents || [], suspended: liveEvents.some((event) => event.player_id === player.id && event.event_type === 'RED'), unpaidFine: liveEvents.some((event) => event.player_id === player.id && event.fine_status === 'UNPAID') });

  useEffect(() => {
    async function loadMatchData() {
      const { data: homeP } = await supabase.from('players').select('*').eq('team_id', match.home_team.id).order('shirt_number');
      const { data: awayP } = await supabase.from('players').select('*').eq('team_id', match.away_team.id).order('shirt_number');
      setHomeRoster(homeP || []);
      setAwayRoster(awayP || []);
      
      try {
         if (match.away_sets && typeof match.away_sets === 'string') {
            const parsed = JSON.parse(match.away_sets);
            if (Array.isArray(parsed)) setSetHistory(parsed);
         }
      } catch (e) { console.error("Error parseando history"); }
      
      await fetchLiveEvents();
    }
    loadMatchData();
  }, [match.id]);

  const fetchLiveEvents = async () => {
    const { data: eventsP } = await supabase.from('match_events').select('*, players(name, shirt_number)').eq('match_id', match.id).order('created_at', { ascending: true });
    if (eventsP) {
      setLiveEvents(eventsP);
      
      const currentSetEvents = eventsP.filter(e => e.period === currentPeriod && e.event_type === 'GOAL');
      const hScore = currentSetEvents.filter(e => e.team_id === match.home_team.id).length;
      const aScore = currentSetEvents.filter(e => e.team_id === match.away_team.id).length;
      
      setHomeScore(hScore);
      setAwayScore(aScore);
      
      if (currentSetEvents.length > 0) {
        const lastPoint = currentSetEvents[currentSetEvents.length - 1];
        setServer(lastPoint.team_id === match.home_team.id ? 'HOME' : 'AWAY');
      } else {
        if (!server) setServer(null); 
      }

      if (match.status === 'LIVE' || match.status === 'FINISHED') {
         const startingEvents = eventsP.filter(e => e.event_type === 'STARTING_LINEUP');
         if (startingEvents && startingEvents.length > 0) {
            setHomeStartingLineup(startingEvents.filter(e => e.team_id === match.home_team.id).map(e => e.player_id));
            setAwayStartingLineup(startingEvents.filter(e => e.team_id === match.away_team.id).map(e => e.player_id));
         }
      }
    }
  };

  const handlePreMatchSetup = () => setShowStartingLineupModal(true);

  const handleQuickStart = async () => {
    setLoading(true);
    const toastId = toast.loading('Iniciando...');
    try {
      await startLiveMatch({ slug, matchId: match.id, period: 'S1' });

      setIsMatchLive(true);
      setCurrentPeriod('S1');
      setShowStartingLineupModal(false);
      toast.success('¡Partido en vivo!', { id: toastId, icon: '🏐' });
    } catch (error) { toast.error('Error al iniciar.', { id: toastId }); }
    setLoading(false);
  };

  const toggleStartingPlayer = (team: 'HOME' | 'AWAY', playerId: string) => {
    const roster = team === 'HOME' ? homeRoster : awayRoster;
    const player = roster.find((candidate) => candidate.id === playerId);
    if (player && playerEligibility(player).status === 'INELIGIBLE') {
      return toast.error('Jugador no habilitado para este partido.');
    }
    if (team === 'HOME') {
      if (homeStartingLineup.includes(playerId)) setHomeStartingLineup(prev => prev.filter(id => id !== playerId));
      else {
        if (homeStartingLineup.length >= maxPlayers) return toast.error(`Máximo ${maxPlayers} en cancha.`);
        setHomeStartingLineup(prev => [...prev, playerId]);
      }
    } else {
      if (awayStartingLineup.includes(playerId)) setAwayStartingLineup(prev => prev.filter(id => id !== playerId));
      else {
        if (awayStartingLineup.length >= maxPlayers) return toast.error(`Máximo ${maxPlayers} en cancha.`);
        setAwayStartingLineup(prev => [...prev, playerId]);
      }
    }
  };

  const handleTurnMatchLive = async () => {
    setLoading(true);
    const toastId = toast.loading('Registrando acta...');
    try {
      await startLiveMatch({
        slug,
        matchId: match.id,
        period: 'S1',
        lineups: [
          ...homeStartingLineup.map((pid) => ({ playerId: pid, teamId: match.home_team.id, period: '0S' })),
          ...awayStartingLineup.map((pid) => ({ playerId: pid, teamId: match.away_team.id, period: '0S' })),
        ],
      });
      
      await fetchLiveEvents();
      setIsMatchLive(true);
      setCurrentPeriod('S1');
      setShowStartingLineupModal(false);
      toast.success('¡Partido en vivo!', { id: toastId, icon: '🏐' });
    } catch (error) { toast.error('Error al iniciar.', { id: toastId }); }
    setLoading(false);
  };

  const handleRefereeAction = (team: 'HOME' | 'AWAY', type: 'SCORE' | 'YELLOW' | 'RED' | 'SUB' | 'SCORE_MINUS', points: number = 0) => {
    if (!isMatchLive) return toast.error('Inicie transmisión primero.');
    if (type === 'SCORE_MINUS') {
      executeActionRecord(team, type, -1); 
      return;
    }
    setSubOutPlayer(null); 
    setScoringAction({ team, type, points });
  };

  const executeActionRecord = async (team: 'HOME' | 'AWAY', type: 'SCORE' | 'YELLOW' | 'RED' | 'SUB' | 'SCORE_MINUS', points: number, playerId?: string) => {
    
    if (type === 'SCORE_MINUS') {
      const lastGoal = [...liveEvents].reverse().find(e => e.team_id === (team === 'HOME' ? match.home_team.id : match.away_team.id) && e.event_type === 'GOAL' && e.period === currentPeriod);
      if (lastGoal) {
         await revertLastScoringEvent({
           slug,
           matchId: match.id,
           teamId: team === 'HOME' ? match.home_team.id : match.away_team.id,
           period: currentPeriod,
           updateMatchScore: false,
         });
         await fetchLiveEvents();
         toast.success('Punto revertido');
      } else {
         toast.error('No hay puntos recientes para restar');
      }
      return;
    }

    if (playerId || type === 'SCORE' || type === 'YELLOW') {
      const teamId = team === 'HOME' ? match.home_team.id : match.away_team.id;

      if (type === 'SUB' && playerId) {
        if (!subOutPlayer) {
           setSubOutPlayer(playerId);
           toast.success('Sale jugador. Seleccione quién ENTRA.');
           return; 
        } else {
           await recordGenericMatchEvent({
             slug,
             matchId: match.id,
             teamId,
             playerId,
             eventType: 'SUB',
             period: currentPeriod,
             minuteRecord: 0,
             subOutPlayerId: subOutPlayer,
           });
           if (team === 'HOME') setHomeStartingLineup(prev => prev.map(id => id === subOutPlayer ? playerId : id));
           else setAwayStartingLineup(prev => prev.map(id => id === subOutPlayer ? playerId : id));
           
           toast.success('Sustitución Completada', { icon: '🔄' });
           setScoringAction(null); setSubOutPlayer(null);
           await fetchLiveEvents();
           return;
        }
      }

      await recordGenericMatchEvent({
        slug,
        matchId: match.id,
        teamId,
        playerId: playerId || null,
        eventType: type === 'SCORE' ? 'GOAL' : type,
        period: currentPeriod,
        minuteRecord: 0,
        scoreDelta: 0,
      });
      await fetchLiveEvents();

      if (type === 'SCORE') toast.success('¡Punto!');
      if (type === 'YELLOW') toast.success('Amonestación');
      if (type === 'RED') toast.error('Expulsión registrada');
    }
    if (type !== 'SUB') setScoringAction(null);
  };

  const handleCloseSet = async () => {
    if (!isMatchLive) return;
    
    let hSets = homeSetsWon;
    let aSets = awaySetsWon;

    if (homeScore > awayScore) hSets++;
    else if (awayScore > homeScore) aSets++;
    
    setHomeSetsWon(hSets);
    setAwaySetsWon(aSets);

    const newHistory = [...setHistory, { period: currentPeriod, home: homeScore, away: awayScore }];
    setSetHistory(newHistory);

    const nextSetNumber = parseInt(currentPeriod.replace('S', '')) + 1;
    const nextSetString = `S${nextSetNumber}`;

    await closeVolleyballSet({
       slug,
       matchId: match.id,
       homeSets: hSets,
       awaySets: aSets,
       setHistory: newHistory,
       nextPeriod: nextSetString,
    });

    setCurrentPeriod(nextSetString);
    setHomeScore(0);
    setAwayScore(0);
    setServer(null); 
    toast.success(`Set cerrado. Inicia ${nextSetString}`);
  };

  const handleRequestFinish = () => {
    if (!isMatchLive) return;
    setShowSummaryModal(true); 
  };

  const confirmFinishMatch = async () => {
    setShowSummaryModal(false);
    setLoading(true);
    const toastId = toast.loading('Procesando acta final...');

    try {
      let finalHistory = [...setHistory];
      let finalHomeSets = homeSetsWon;
      let finalAwaySets = awaySetsWon;

      if (homeScore > 0 || awayScore > 0) {
        if (homeScore > awayScore) finalHomeSets++;
        else if (awayScore > homeScore) finalAwaySets++;
        finalHistory.push({ period: currentPeriod, home: homeScore, away: awayScore });
      }

      await finishCourtMatch({
        slug,
        matchId: match.id,
        homeScore: finalHomeSets,
        awayScore: finalAwaySets,
        sport: 'volleyball',
        setHistory: finalHistory,
      });

      toast.success('Acta Guardada Exitosamente', { id: toastId });
      onMatchUpdate();
      onClose();

    } catch (error) {
      toast.error('Error al cerrar acta', { id: toastId });
    }
    setLoading(false);
  };

  const activeTournamentName = categoryData?.tournaments?.name || '';
  const activeCategoryName = categoryData?.name || '';

  const canCloseSet = (homeScore >= targetScore || awayScore >= targetScore) && Math.abs(homeScore - awayScore) >= 2;

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden text-slate-900 font-sans animate-in slide-in-from-right duration-300">
      
      {/* LOBBY PRE-PARTIDO */}
      {showStartingLineupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] w-full max-w-6xl shadow-2xl flex flex-col h-[90vh] relative overflow-hidden">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-6 shrink-0">
              <div className="flex items-center gap-6">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                    <Users className="text-yellow-500"/> Registro de Formación
                  </h3>
                  <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs mt-2">
                    Seleccione los {maxPlayers} titulares en campo.
                  </p>
                </div>
                <button onClick={handleQuickStart} className="hidden md:flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ml-4 border border-slate-200">
                  <Zap size={16} className="text-amber-500" /> Partido Rápido
                </button>
              </div>
              <button onClick={() => setShowStartingLineupModal(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-colors"><X size={24} /></button>
            </div>

            <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col h-full bg-slate-50 rounded-[2rem] border border-slate-200 overflow-hidden">
                <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center p-2 shadow-inner">
                      {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="text-slate-300" />}
                    </div>
                    <div><h4 className="text-lg font-black uppercase text-slate-900">{match.home_team.name}</h4><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Local</p></div>
                  </div>
                  <div className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest border ${homeStartingLineup.length === maxPlayers ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                    {homeStartingLineup.length} / {maxPlayers}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-2">
                  {homeRoster.length === 0 ? <p className="text-center text-slate-400 py-10 font-bold text-xs uppercase tracking-widest">Nómina vacía</p> : 
                    homeRoster.map(player => {
                      const isStarter = homeStartingLineup.includes(player.id);
                      return (
                        <button key={player.id} onClick={() => toggleStartingPlayer('HOME', player.id)} className={`w-full flex items-center justify-between p-3 px-5 rounded-2xl border transition-all text-left ${isStarter ? 'bg-yellow-500 text-white border-yellow-600 shadow-md' : 'bg-white text-slate-700 hover:border-yellow-400'}`}>
                          <div className="flex items-center gap-4"><span className={`text-xl font-black ${isStarter ? 'text-yellow-100' : 'text-slate-400'} w-8`}>{player.shirt_number || '-'}</span><span className="font-bold text-sm uppercase">{player.name}</span></div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isStarter ? 'bg-white border-white text-yellow-600' : 'border-slate-300'}`}>{isStarter && <CheckCircle2 size={16}/>}</div>
                        </button>
                      );
                  })}
                </div>
              </div>

              <div className="flex-1 flex flex-col h-full bg-slate-50 rounded-[2rem] border border-slate-200 overflow-hidden">
                <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center p-2 shadow-inner">
                      {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="text-slate-300" />}
                    </div>
                    <div><h4 className="text-lg font-black uppercase text-slate-900">{match.away_team.name}</h4><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visitante</p></div>
                  </div>
                  <div className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest border ${awayStartingLineup.length === maxPlayers ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                    {awayStartingLineup.length} / {maxPlayers}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-2">
                  {awayRoster.length === 0 ? <p className="text-center text-slate-400 py-10 font-bold text-xs uppercase tracking-widest">Nómina vacía</p> : 
                    awayRoster.map(player => {
                      const isStarter = awayStartingLineup.includes(player.id);
                      return (
                        <button key={player.id} onClick={() => toggleStartingPlayer('AWAY', player.id)} className={`w-full flex items-center justify-between p-3 px-5 rounded-2xl border transition-all text-left ${isStarter ? 'bg-yellow-500 text-white border-yellow-600 shadow-md' : 'bg-white text-slate-700 hover:border-yellow-400'}`}>
                          <div className="flex items-center gap-4"><span className={`text-xl font-black ${isStarter ? 'text-yellow-100' : 'text-slate-400'} w-8`}>{player.shirt_number || '-'}</span><span className="font-bold text-sm uppercase">{player.name}</span></div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isStarter ? 'bg-white border-white text-yellow-600' : 'border-slate-300'}`}>{isStarter && <CheckCircle2 size={16}/>}</div>
                        </button>
                      );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 mt-6 shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
              <button onClick={handleQuickStart} className="md:hidden w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors border border-slate-200">
                <Zap size={18} className="text-amber-500" /> Partido Rápido
              </button>
              <div className="hidden md:block"></div>
              <button onClick={handleTurnMatchLive} disabled={loading} className="w-full md:w-auto px-12 py-4 md:py-5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(202,138,4,0.4)] transition-all disabled:opacity-50">
                <FaVolleyballBall size={20} className="animate-spin-slow" /> Confirmar e Iniciar Set
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ACCIONES (PUNTOS) */}
      {scoringAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-4 md:mb-6 border-b border-slate-100 pb-3 md:pb-4 shrink-0">
              <div>
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter text-emerald-500">
                  {scoringAction.type === 'SCORE' ? 'Registro de Punto' : 
                   scoringAction.type === 'YELLOW' ? 'Tarjeta Amarilla' : 
                   scoringAction.type === 'RED' ? 'Tarjeta Roja Directa' : 
                   (scoringAction.type === 'SUB' && !subOutPlayer) ? 'Sale ⬇️' : 'Entra ⬆️'}
                </h3>
                <p className="font-black uppercase tracking-wider md:tracking-widest text-[10px] md:text-xs mt-1 flex items-center gap-1.5 md:gap-2">
                  <span className="text-slate-500">
                    {scoringAction.team === 'HOME' ? match.home_team.name : match.away_team.name} • {currentPeriod}
                  </span>
                </p>
              </div>
              <button onClick={() => {setScoringAction(null); setSubOutPlayer(null);}} className="p-2 md:p-3 bg-slate-100 rounded-lg md:rounded-xl text-slate-400 hover:text-slate-800"><X size={20} className="md:w-6 md:h-6"/></button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 overflow-y-auto pr-2 pb-2 md:pb-4 scrollbar-hide flex-1">
              {(scoringAction.team === 'HOME' ? homeRoster : awayRoster).map(player => {
                const hasRed = liveEvents.some(e => e.player_id === player.id && e.event_type === 'RED'); const eligibility = playerEligibility(player); const isIneligible = eligibility.status === 'INELIGIBLE';
                const isOut = subOutPlayer === player.id;
                
                const currentLineup = scoringAction.team === 'HOME' ? homeStartingLineup : awayStartingLineup;
                const isCurrentlyOnPitch = currentLineup.includes(player.id);
                
                let shouldDisable = false;
                if (hasRed && scoringAction.type !== 'SUB') shouldDisable = true;
                if (scoringAction.type === 'SUB' && !subOutPlayer && !isCurrentlyOnPitch) shouldDisable = true;
                if (scoringAction.type === 'SUB' && subOutPlayer && isCurrentlyOnPitch) shouldDisable = true;

                return (
                  <button 
                    key={player.id} 
                    onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points, player.id)}
                    disabled={isIneligible || shouldDisable}
                    className={`p-4 md:p-6 rounded-[1rem] md:rounded-[1.5rem] border transition-all flex flex-col items-center group relative shadow-sm
                      ${shouldDisable ? 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-yellow-400 hover:bg-yellow-50'}
                      ${isOut ? 'ring-2 md:ring-4 ring-red-400 scale-95' : ''}
                    `}
                  >
                    {hasRed && <Square className="absolute top-2 left-2 md:top-4 md:left-4 text-red-500 fill-red-500 w-2.5 h-2.5 md:w-3 md:h-3" />}
                    <span className={`text-2xl md:text-4xl font-black transition-colors ${hasRed ? 'text-red-400' : shouldDisable ? 'text-slate-400' : 'text-slate-700 group-hover:text-yellow-600'}`}>{player.shirt_number || '-'}</span>
                    <span className={`text-[9px] md:text-[10px] font-bold uppercase mt-1.5 md:mt-3 text-center line-clamp-2 leading-tight ${shouldDisable ? 'text-slate-400' : 'text-slate-500'}`}>{player.name}</span>
                    {eligibility.status !== 'ELIGIBLE' && <span className={`mt-2 text-[8px] font-black uppercase text-center ${isIneligible ? 'text-red-500' : 'text-amber-600'}`}>{eligibility.reasons[0]?.message}</span>}
                    {scoringAction.type === 'SUB' && (
                       <span className={`mt-2 px-2 py-0.5 rounded text-[8px] font-black uppercase ${isCurrentlyOnPitch ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                         {isCurrentlyOnPitch ? 'En Cancha' : 'Banca'}
                       </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(!scoringAction.type.includes('SUB')) && ( 
              <div className="mt-4 md:mt-6 flex justify-center gap-4 pt-4 md:pt-6 border-t border-slate-100 shrink-0">
                <button onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points)} className="px-6 md:px-8 py-3 md:py-4 bg-slate-100 text-slate-600 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[9px] md:text-xs hover:bg-slate-200 border border-slate-200 transition-colors">
                  Omitir Identificación (Punto de Equipo)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORTE DE RESUMEN FINAL */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 md:p-8 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] w-full max-w-5xl h-[95vh] md:h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative">
            <div className="bg-slate-900 text-white p-4 sm:p-6 md:p-8 flex justify-between items-center shrink-0 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-cover bg-center z-0" style={{backgroundImage: "url('https://images.unsplash.com/photo-1592656094267-764a45160876?q=80&w=2070&auto=format&fit=crop')"}}></div>
               <div className="relative z-10">
                 <h2 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase tracking-tighter text-yellow-400 drop-shadow-md">Reporte de Sets</h2>
                 <p className="text-slate-300 font-bold uppercase tracking-[0.2em] text-[8px] sm:text-[10px] md:text-sm mt-1">Revisión previa al cierre de acta</p>
               </div>
               <button onClick={() => setShowSummaryModal(false)} className="relative z-10 p-2 sm:p-3 md:p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} className="md:w-7 md:h-7"/></button>
            </div>
            
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-6 md:gap-16 py-6 sm:py-8 px-4 md:px-8 border-b border-slate-100 bg-slate-50 shrink-0 relative">
               <div className="flex items-center gap-3 md:gap-6 flex-1 justify-center md:justify-end z-10 w-full md:w-auto">
                 <div className="text-center md:text-right flex-1 md:flex-none">
                    <h3 className="text-xl sm:text-2xl md:text-4xl font-black uppercase truncate">{match.home_team?.name}</h3>
                 </div>
                 <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white rounded-2xl md:rounded-3xl p-2 md:p-3 border border-slate-200 shadow-sm shrink-0">
                    {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="text-slate-300 w-full h-full" />}
                 </div>
               </div>
               <div className="flex flex-col items-center shrink-0 z-10 my-2 md:my-0">
                 <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px] mb-2">SETS GANADOS</p>
                 <div className="bg-slate-900 text-white px-6 sm:px-8 md:px-10 py-3 sm:py-4 md:py-6 rounded-[1.5rem] md:rounded-[2.5rem] flex gap-3 md:gap-6 text-4xl sm:text-5xl md:text-6xl font-black tabular-nums shadow-xl border-2 sm:border-4 border-slate-800">
                    <span className={homeSetsWon > awaySetsWon ? 'text-yellow-400' : ''}>{homeSetsWon}</span>
                    <span className="text-slate-600 opacity-50">-</span>
                    <span className={awaySetsWon > homeSetsWon ? 'text-yellow-400' : ''}>{awaySetsWon}</span>
                 </div>
               </div>
               <div className="flex items-center gap-3 md:gap-6 flex-1 justify-center md:justify-start z-10 flex-row-reverse md:flex-row w-full md:w-auto">
                 <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white rounded-2xl md:rounded-3xl p-2 md:p-3 border border-slate-200 shadow-sm shrink-0">
                    {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="w-full h-full object-contain" /> : <School className="text-slate-300 w-full h-full" />}
                 </div>
                 <div className="text-center md:text-left flex-1 md:flex-none">
                    <h3 className="text-xl sm:text-2xl md:text-4xl font-black uppercase truncate">{match.away_team?.name}</h3>
                 </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 bg-slate-50/50 relative shadow-[inset_0_10px_20px_rgba(0,0,0,0.02)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-slate-300">
              <h4 className="text-[10px] sm:text-xs md:text-sm font-black text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.3em] mb-6 md:mb-10 flex items-center gap-2 md:gap-3 justify-center">
                 <Activity size={16} className="md:w-[18px] md:h-[18px]"/> Historial de Sets
              </h4>
              {setHistory.length === 0 && homeScore === 0 && awayScore === 0 ? (
                 <div className="text-center py-10 md:py-20 text-slate-400 font-bold italic text-sm md:text-lg">No se completaron sets.</div>
              ) : (
                 <div className="max-w-2xl mx-auto space-y-3">
                    {setHistory.map((s, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center justify-between">
                         <span className="font-black text-slate-400 uppercase w-16 text-center">{s.period}</span>
                         <span className={`font-black text-2xl w-16 text-right ${s.home > s.away ? 'text-yellow-500' : 'text-slate-600'}`}>{s.home}</span>
                         <span className="text-slate-300 font-black">-</span>
                         <span className={`font-black text-2xl w-16 text-left ${s.away > s.home ? 'text-yellow-500' : 'text-slate-600'}`}>{s.away}</span>
                         <span className="w-16"></span>
                      </div>
                    ))}
                    {(homeScore > 0 || awayScore > 0) && (
                      <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl shadow-sm flex items-center justify-between opacity-60">
                         <span className="font-black text-blue-400 uppercase w-16 text-center">{currentPeriod}</span>
                         <span className={`font-black text-2xl w-16 text-right text-blue-600`}>{homeScore}</span>
                         <span className="text-blue-300 font-black">-</span>
                         <span className={`font-black text-2xl w-16 text-left text-blue-600`}>{awayScore}</span>
                         <span className="w-16 text-[8px] font-black uppercase text-blue-400 text-center">Set<br/>Actual</span>
                      </div>
                    )}
                 </div>
              )}
            </div>

            <div className="p-4 sm:p-5 md:p-8 bg-slate-900 shrink-0 shadow-[0_-20px_40px_rgba(0,0,0,0.15)] relative z-20">
               <button onClick={confirmFinishMatch} disabled={loading} className="w-full py-4 sm:py-5 md:py-6 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-amber-500 hover:to-yellow-400 text-white rounded-[1.5rem] md:rounded-[2rem] font-black text-sm sm:text-lg md:text-2xl uppercase tracking-widest flex items-center justify-center gap-2 sm:gap-4 transition-all shadow-[0_0_30px_rgba(234,179,8,0.3)] disabled:opacity-50">
                 <CheckCircle2 size={24} className="md:w-8 md:h-8"/> Cerrar Acta y Sumar Puntos
               </button>
            </div>
          </div>
        </div>
      )}

      {/* CABECERA OFICIAL (ESTILO VÓLEY) */}
      <div className="bg-slate-900 px-4 md:px-8 py-3 md:py-4 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between shadow-lg z-30 relative gap-4 shrink-0 text-white">
        <div className="flex items-center gap-2 sm:gap-4 w-full md:w-1/4 justify-start">
          <button onClick={onClose} className="p-2 md:p-3 bg-white/10 text-slate-300 rounded-lg md:rounded-xl hover:bg-white/20 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>
        
        <div className="w-full md:w-2/4 flex flex-col items-center justify-center">
          <div className="flex items-center gap-4 bg-slate-800 px-6 py-2 rounded-full border border-slate-700 shadow-inner">
             <div className="text-center">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{match.home_team.name}</p>
               <span className="text-3xl font-black text-yellow-400">{homeSetsWon}</span>
             </div>
             <div className="text-slate-500 font-black text-xl">-</div>
             <div className="text-center">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{match.away_team.name}</p>
               <span className="text-3xl font-black text-yellow-400">{awaySetsWon}</span>
             </div>
          </div>
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2">Sets Globales • {currentPeriod}</span>
        </div>
        
        <div className="w-full md:w-1/4 flex justify-end gap-2 overscroll-x-contain overflow-x-auto scrollbar-hide">
           {setHistory.map((s, i) => (
             <div key={i} className="flex flex-col items-center bg-slate-800 p-2 rounded-lg border border-slate-700 opacity-60 min-w-[50px]">
               <span className="text-[8px] font-black text-slate-400 uppercase">{s.period}</span>
               <span className="text-xs font-black text-white">{s.home}-{s.away}</span>
             </div>
           ))}
        </div>
      </div>

      {/* CANCHA - AQUÍ ESTÁ EL CAMBIO DE FONDO */}
      <div className="flex-1 flex flex-col sm:flex-row items-stretch relative z-0 bg-[url('/bg-voleibol.jpg')] bg-cover bg-center overflow-hidden">
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-0"></div>

        {!isMatchLive && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <button onClick={handlePreMatchSetup} className="flex flex-col items-center justify-center gap-1.5 md:gap-2 w-32 h-32 md:w-56 md:h-56 bg-yellow-600 rounded-full text-white shadow-[0_0_60px_rgba(202,138,4,0.6)] hover:bg-yellow-500 hover:scale-105 active:scale-95 transition-all border-4 border-white animate-pulse relative z-10">
              <FaVolleyballBall className="w-10 h-10 md:w-16 md:h-16 animate-spin-slow" />
              <span className="font-black uppercase tracking-[0.2em] text-[8px] md:text-sm text-center px-2 md:px-4 leading-tight relative z-10">Iniciar Partido</span>
            </button>
          </div>
        )}

        {/* LOCAL */}
        <div className={`flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 border-b sm:border-b-0 sm:border-r border-slate-700/50 relative z-10 transition-opacity duration-300 overflow-hidden ${!isMatchLive ? 'opacity-40 grayscale blur-[1px]' : 'opacity-100'}`}>
          <div className="h-8 mb-2">
            {server === 'HOME' && <div className="flex items-center gap-2 bg-yellow-500 text-slate-900 px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest shadow-lg animate-bounce"><FaVolleyballBall/> Tiene el Saque</div>}
          </div>

          <div className="bg-white/10 rounded-[2rem] border border-white/20 flex items-center justify-center p-4 shadow-lg mb-3 z-10 relative shrink-0 backdrop-blur-md">
            {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="h-16 md:h-24 w-auto object-contain drop-shadow-md" /> : <School size={64} className="text-white/50" />}
          </div>
          
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white uppercase tracking-tighter text-center mb-1 drop-shadow-md leading-tight max-w-[90%] truncate">{match.home_team?.name}</h3>
          
          <div className="flex flex-wrap justify-center gap-1 md:gap-2 bg-black/60 p-1.5 md:p-3 rounded-xl md:rounded-2xl shadow-xl border border-white/10 z-10 mt-2 shrink-0">
            <button onClick={() => handleRefereeAction('HOME', 'SUB')} disabled={!isMatchLive} className="w-10 h-10 bg-slate-800 border border-slate-600 rounded-xl hover:bg-slate-700 text-blue-400 flex items-center justify-center disabled:opacity-50 transition-colors">
              <RefreshCcw size={16} />
            </button>
            <button onClick={() => handleRefereeAction('HOME', 'YELLOW')} disabled={!isMatchLive} className="w-10 h-10 bg-slate-800 border border-slate-600 rounded-xl hover:bg-yellow-900/50 text-yellow-400 flex items-center justify-center disabled:opacity-50 transition-colors">
              <Square size={16} className="fill-yellow-400" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center w-full z-10 my-4">
            <span className={`text-7xl sm:text-9xl md:text-[14rem] lg:text-[18rem] leading-none font-black tabular-nums text-center drop-shadow-2xl transition-colors ${homeScore >= targetScore ? 'text-emerald-400' : homeScore > awayScore ? 'text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.4)]' : 'text-white'}`}>
              {homeScore}
            </span>
          </div>
          
          <div className="flex items-center justify-center gap-3 z-10 bg-white/10 backdrop-blur-md p-3 rounded-[2rem] border border-white/20 shadow-xl shrink-0 mt-auto mb-2">
            <button disabled={!isMatchLive || homeScore === 0} onClick={() => handleRefereeAction('HOME', 'SCORE_MINUS', -1)} className="h-14 w-14 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-600 active:scale-95 transition-all"><Minus size={24} /></button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', 1)} className="h-14 w-32 bg-yellow-500 rounded-2xl flex flex-col items-center justify-center text-slate-900 active:scale-95 transition-all shadow-xl shadow-yellow-500/30 border border-yellow-400 font-black text-2xl">
              +1 PUNTO
            </button>
          </div>
        </div>

        {/* VISITANTE */}
        <div className={`flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 border-b sm:border-b-0 sm:border-r border-slate-700/50 relative z-10 transition-opacity duration-300 overflow-hidden ${!isMatchLive ? 'opacity-40 grayscale blur-[1px]' : 'opacity-100'}`}>
          <div className="h-8 mb-2">
            {server === 'AWAY' && <div className="flex items-center gap-2 bg-yellow-500 text-slate-900 px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest shadow-lg animate-bounce"><FaVolleyballBall/> Tiene el Saque</div>}
          </div>

          <div className="bg-white/10 rounded-[2rem] border border-white/20 flex items-center justify-center p-4 shadow-lg mb-3 z-10 relative shrink-0 backdrop-blur-md">
            {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="h-16 md:h-24 w-auto object-contain relative z-10 drop-shadow-md" /> : <School size={64} className="text-white/50" />}
          </div>
          
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white uppercase tracking-tighter text-center mb-1 drop-shadow-md leading-tight max-w-[90%] truncate">{match.away_team?.name}</h3>
          
          <div className="flex flex-wrap justify-center gap-1 md:gap-2 bg-black/60 p-1.5 md:p-3 rounded-xl md:rounded-2xl shadow-xl border border-white/10 z-10 mt-2 shrink-0">
            <button onClick={() => handleRefereeAction('AWAY', 'SUB')} disabled={!isMatchLive} className="w-10 h-10 bg-slate-800 border border-slate-600 rounded-xl hover:bg-slate-700 text-blue-400 flex items-center justify-center disabled:opacity-50 transition-colors">
              <RefreshCcw size={16} />
            </button>
            <button onClick={() => handleRefereeAction('AWAY', 'YELLOW')} disabled={!isMatchLive} className="w-10 h-10 bg-slate-800 border border-slate-600 rounded-xl hover:bg-yellow-900/50 text-yellow-400 flex items-center justify-center disabled:opacity-50 transition-colors">
              <Square size={16} className="fill-yellow-400" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center w-full z-10 my-4">
            <span className={`text-7xl sm:text-9xl md:text-[14rem] lg:text-[18rem] leading-none font-black tabular-nums text-center drop-shadow-2xl transition-colors ${awayScore >= targetScore ? 'text-emerald-400' : awayScore > homeScore ? 'text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.4)]' : 'text-white'}`}>
              {awayScore}
            </span>
          </div>
          
          <div className="flex items-center justify-center gap-3 z-10 bg-white/10 backdrop-blur-md p-3 rounded-[2rem] border border-white/20 shadow-xl shrink-0 mt-auto mb-2">
            <button disabled={!isMatchLive || awayScore === 0} onClick={() => handleRefereeAction('AWAY', 'SCORE_MINUS', -1)} className="h-14 w-14 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-600 active:scale-95 transition-all"><Minus size={24} /></button>
            <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', 1)} className="h-14 w-32 bg-yellow-500 rounded-2xl flex flex-col items-center justify-center text-slate-900 active:scale-95 transition-all shadow-xl shadow-yellow-500/30 border border-yellow-400 font-black text-2xl">
              +1 PUNTO
            </button>
          </div>
        </div>
      </div>

      {/* BOTÓN INFERIOR INTELIGENTE (CIERRE DE SET / CIERRE PARTIDO) */}
      <div className="p-4 md:p-6 bg-slate-950 relative z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] shrink-0 flex gap-4">
        {canCloseSet ? (
           <button onClick={handleCloseSet} disabled={loading || !isMatchLive} className="w-full py-4 md:py-5 rounded-2xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg border bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-emerald-500/20 animate-pulse">
             <Trophy size={24}/> ¡Set Completado! (Pasar al siguiente)
           </button>
        ) : (
           <button onClick={handleRequestFinish} disabled={loading || !isMatchLive} className="w-full py-4 md:py-5 rounded-2xl font-black text-sm md:text-lg uppercase tracking-widest flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg border bg-red-600 text-white hover:bg-red-500 border-red-500 shadow-red-500/20">
             <CheckCircle2 size={24} className="text-white"/> Terminar Partido Definitivamente
           </button>
        )}
      </div>
    </div>
  );
}
