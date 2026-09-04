'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../supabase';
import { ArrowLeft, CheckCircle2, Minus, Plus, School, CalendarDays, X, Radio, Square, RefreshCcw, ArrowRight, PlayCircle, AlertTriangle, Handshake, Star, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { FaFutbol } from 'react-icons/fa';

// Importación de Componentes
import GlobalTimer from './GlobalTimer';
import { useMatchTimer } from '../../../resultados/hooks/useMatchTimer';
import StartingLineupModal from './modals/StartingLineupModal';
import WalkoverModal from './modals/WalkoverModal';
import MatchSummaryModal from './modals/MatchSummaryModal';
import PenaltyShootout from './PenaltyShootout';
import { applyFootballWalkover, changeMatchPeriod, finishFootballMatch, getFootballMatchRoster, recordFootballMatchEvent, resetFootballTimer, startLiveMatch, revertLastScoringEvent, removeYellowCardEvent } from '../actions';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import { applyDemoWalkover, changeDemoMatchPeriod, finishDemoFootballMatch, getDemoFootballRoster, recordDemoFootballEvent, startDemoFootballMatch, revertDemoLastFootballGoal, removeDemoYellowCard } from '@/app/lib/demo/actions';
import { evaluatePlayerEligibility, type PlayerEligibility } from '@/app/lib/competition/player-eligibility';

interface MesaFutbolProps {
  match: any;
  categoryData: any;
  onClose: () => void;
  onMatchUpdate: () => void;
  slug: string;
}

export default function MesaFutbol({ match, categoryData, onClose, onMatchUpdate, slug }: MesaFutbolProps) {
  const isDemo = slug === DEMO_SLUG;
  const [homeScore, setHomeScore] = useState(match.home_score || 0);
  const [awayScore, setAwayScore] = useState(match.away_score || 0);
  const [currentPeriod, setCurrentPeriod] = useState(match.current_period || '1T');
  const [isMatchLive, setIsMatchLive] = useState(match.status === 'LIVE');

  const [homeRoster, setHomeRoster] = useState<any[]>([]);
  const [awayRoster, setAwayRoster] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [suspendedPlayers, setSuspendedPlayers] = useState<Record<string, boolean | string>>({});
  const [playerEligibility, setPlayerEligibility] = useState<Record<string, PlayerEligibility>>({});

  const [showStartingLineupModal, setShowStartingLineupModal] = useState(false);
  const [homeStartingLineup, setHomeStartingLineup] = useState<string[]>([]);
  const [awayStartingLineup, setAwayStartingLineup] = useState<string[]>([]);

  const [showWOModal, setShowWOModal] = useState(false);
  const [showPeriodStartOverlay, setShowPeriodStartOverlay] = useState(false);

  const maxPlayers = categoryData?.sports?.name.includes('MICRO') ? 5 : 11;
  const minPlayers = categoryData?.sports?.name.includes('MICRO') ? 4 : 7;

  const [loading, setLoading] = useState(false);
  const [showPeriodConfirm, setShowPeriodConfirm] = useState<{ isOpen: boolean; targetPeriod: string }>({ isOpen: false, targetPeriod: '' });
  const [showSummaryModal, setShowSummaryModal] = useState(false); 
  const [showRosterModal, setShowRosterModal] = useState<'HOME' | 'AWAY' | null>(null); 
  const [goalCorrectionTeam, setGoalCorrectionTeam] = useState<'HOME' | 'AWAY' | null>(null);
  const [goalCorrectionPlayer, setGoalCorrectionPlayer] = useState<string>('');
  const [yellowCorrectionEvent, setYellowCorrectionEvent] = useState<any | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  
  const [scoringAction, setScoringAction] = useState<{ team: 'HOME' | 'AWAY', type: 'SCORE' | 'YELLOW' | 'RED' | 'SUB' | 'ASSIST' | 'MVP', points: number } | null>(null);
  const [subOutPlayer, setSubOutPlayer] = useState<string | null>(null);

  const [homePenalties, setHomePenalties] = useState<(boolean | null)[]>(Array(10).fill(null));
  const [awayPenalties, setAwayPenalties] = useState<(boolean | null)[]>(Array(10).fill(null));

  const defaultTimerState = {
    is_timer_running: match.is_timer_running || false,
    timer_start_time: match.timer_start_time || null,
    timer_accumulated_seconds: match.timer_accumulated_seconds || 0,
    match_duration_seconds: match.match_duration_seconds || 2400,
    match_phase: match.match_phase || 'REGULAR'
  };

  const { regularSeconds, extraSeconds, phase, isRunning, toggleTimer, endMatch, resetTimer } = useMatchTimer(slug, match.id, defaultTimerState as any, true);

  // Mesa is operated more safely in landscape on phones/tablets. Browsers
  // that support the Screen Orientation API will rotate the installed app;
  // desktop and iOS browsers simply keep their native orientation and use the
  // responsive layout below.
  useEffect(() => {
    const orientation = window.screen?.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void>; unlock?: () => void };
    if (!orientation?.lock) return;
    orientation.lock('landscape').catch(() => undefined);
    return () => { orientation.unlock?.(); };
  }, []);

  useEffect(() => {
    async function loadMatchData() {
      try {
        const roster = isDemo ? getDemoFootballRoster(match.id) : await getFootballMatchRoster(slug, match.id);
        setHomeRoster(roster.home || []);
        setAwayRoster(roster.away || []);
        setSuspendedPlayers(categoryData?.tournaments?.fair_play_enabled ? roster.suspendedPlayers : {});
        const allPlayers = [...(roster.home || []), ...(roster.away || [])];
        const eligibility: Record<string, PlayerEligibility> = {};
        allPlayers.forEach((player: any) => { eligibility[player.id] = evaluatePlayerEligibility({ playerId: player.id, registered: true, teamId: player.team_id, documents: player.player_documents || [], suspended: Boolean(roster.suspendedPlayers?.[player.id]), suspensionMessage: roster.suspendedPlayers?.[player.id] ? String(roster.suspendedPlayers[player.id]) : null }); });
        setPlayerEligibility(eligibility);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar la nómina del partido.');
      }
      await fetchLiveEvents();

      if (match.status === 'LIVE' || match.status === 'FINISHED') {
         const { data: startingEvents } = await supabase.from('match_events').select('player_id, team_id').eq('match_id', match.id).eq('event_type', 'STARTING_LINEUP');
         if (startingEvents && startingEvents.length > 0) {
            setHomeStartingLineup(startingEvents.filter(e => e.team_id === match.home_team.id).map(e => e.player_id));
            setAwayStartingLineup(startingEvents.filter(e => e.team_id === match.away_team.id).map(e => e.player_id));
         }
      }
    }
    loadMatchData();
  }, [match.id, categoryData, slug]);

  const playerAgeAtTournament = (player: any) => {
    if (!player.birth_date) return player.birth_year ? new Date().getFullYear() - Number(player.birth_year) : null;
    const startDate = categoryData?.tournaments?.schedule_dates?.[0] || `${new Date().getFullYear()}-12-31`;
    const birth = new Date(`${player.birth_date}T12:00:00`);
    const reference = new Date(`${startDate}T12:00:00`);
    let age = reference.getFullYear() - birth.getFullYear();
    if (reference.getMonth() < birth.getMonth() || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())) age -= 1;
    return age;
  };

  const hasRequiredFiles = (player: any) => ['FACE_PHOTO', 'IDENTITY_FRONT'].every((type) => player.player_documents?.some((document: any) => document.document_type === type));

  const fetchLiveEvents = async () => {
    const { data: eventsP } = await supabase.from('match_events').select('*, players(name, shirt_number)').eq('match_id', match.id).order('created_at', { ascending: true });
    const events = eventsP || [];
    setLiveEvents(events);

    // Older production RPCs could persist the GOAL event without returning the
    // updated match score. Keep the visible scoreboard truthful for an open
    // match by deriving only a missing score from the already persisted events.
    // This is read-only and never overwrites tournament data.
    if (match.status === 'LIVE') {
      const eventScore = events.reduce((score, event: any) => {
        if (event.event_type !== 'GOAL') return score;
        if (event.team_id === match.home_team_id || event.team_id === match.home_team?.id) score.home += 1;
        if (event.team_id === match.away_team_id || event.team_id === match.away_team?.id) score.away += 1;
        return score;
      }, { home: 0, away: 0 });
      setHomeScore((current: number) => Math.max(current, eventScore.home));
      setAwayScore((current: number) => Math.max(current, eventScore.away));
    }
  };

  const handlePreMatchSetup = () => setShowStartingLineupModal(true);

  const handleQuickStart = async () => {
    setLoading(true);
    const toastId = toast.loading('Iniciando partido rápido...');
    try {
      if (isDemo) startDemoFootballMatch(match.id); else await startLiveMatch({ slug, matchId: match.id, period: '1T' });
      setIsMatchLive(true);
      setCurrentPeriod('1T');
      setShowStartingLineupModal(false);
      
      if (!isRunning) toggleTimer();
      toast.success('¡Pitazo inicial! Partido en vivo.', { id: toastId, icon: '⚽' });
    } catch (error) { toast.error('Error al iniciar', { id: toastId }); }
    setLoading(false);
  };

  const handleTurnMatchLive = async () => {
    setLoading(true);
    const toastId = toast.loading('Registrando acta...');
    try {
      const startInput = {
        slug,
        matchId: match.id,
        period: '1T',
        lineups: [
          ...homeStartingLineup.map((pid) => ({ playerId: pid, teamId: match.home_team.id, period: '0T' })),
          ...awayStartingLineup.map((pid) => ({ playerId: pid, teamId: match.away_team.id, period: '0T' })),
        ],
      };
      if (isDemo) startDemoFootballMatch(match.id, startInput.lineups); else await startLiveMatch(startInput);
      await fetchLiveEvents();
      setIsMatchLive(true); 
      setCurrentPeriod('1T'); 
      setShowStartingLineupModal(false);
      
      if (!isRunning) toggleTimer();
      toast.success('¡Partido en vivo!', { id: toastId, icon: '⚽' });
    } catch (error) { toast.error('Error', { id: toastId }); }
    setLoading(false);
  };

  const toggleStartingPlayer = (team: 'HOME' | 'AWAY', playerId: string) => {
    const eligibility = playerEligibility[playerId];
    if (eligibility?.status === 'INELIGIBLE' || suspendedPlayers[playerId]) return toast.error(eligibility?.blockingReasons[0]?.message || 'Jugador no habilitado.');
    const player = [...homeRoster, ...awayRoster].find((item) => item.id === playerId);
    if (!player) return toast.error('Jugador no encontrado en la nómina.');
    if (team === 'HOME') {
      if (homeStartingLineup.includes(playerId)) setHomeStartingLineup(prev => prev.filter(id => id !== playerId));
      else { if (homeStartingLineup.length >= maxPlayers) return toast.error(`Máximo ${maxPlayers}`); setHomeStartingLineup(prev => [...prev, playerId]); }
    } else {
      if (awayStartingLineup.includes(playerId)) setAwayStartingLineup(prev => prev.filter(id => id !== playerId));
      else { if (awayStartingLineup.length >= maxPlayers) return toast.error(`Máximo ${maxPlayers}`); setAwayStartingLineup(prev => [...prev, playerId]); }
    }
  };

  const handleExecuteWO = async (absentTeamId: string) => {
    setLoading(true);
    const toastId = toast.loading("Procesando W.O...");
    try {
      if (isDemo) applyDemoWalkover(match.id, absentTeamId); else await applyFootballWalkover({
        slug,
        matchId: match.id,
        absentTeamId,
        noShowPenalty: categoryData?.tournaments?.fp_no_show_deduction || 500,
      });

      toast.success("W.O. Registrado: 3-0", { id: toastId });
      onMatchUpdate(); onClose();
    } catch (error: any) { toast.error(error.message || "Error", { id: toastId }); } finally { setLoading(false); }
  };

  const requestPeriodChange = (period: string) => {
    if (!isMatchLive) return toast.error('Inicie partido primero.');
    if (period === currentPeriod) return;
    if (isRunning) toggleTimer(); 
    setShowPeriodConfirm({ isOpen: true, targetPeriod: period });
  };

  const executePeriodChange = async () => {
    const period = showPeriodConfirm.targetPeriod;
    setCurrentPeriod(period);
    if (isDemo) changeDemoMatchPeriod(match.id, period); else await changeMatchPeriod({ slug, matchId: match.id, period });
    setShowPeriodConfirm({ isOpen: false, targetPeriod: '' });
    
    if (period !== 'PEN') {
       if (!isDemo) await resetFootballTimer({ slug, matchId: match.id });
       toast.success(`Preparando ${period}.`);
       setShowPeriodStartOverlay(true);
    } else {
       toast.success('Fase de Penales', { icon: '🥅' });
    }
  };

  const handleStartPeriodFromOverlay = () => {
      if (!isRunning) toggleTimer();
      setShowPeriodStartOverlay(false);
      toast.success(`¡Cronómetro en marcha!`, { icon: '⏱️' });
  };

  const handleRefereeAction = (team: 'HOME' | 'AWAY', type: 'SCORE' | 'YELLOW' | 'RED' | 'SUB' | 'ASSIST' | 'MVP', points: number = 0) => {
    if (!isMatchLive) return toast.error('Inicie transmisión primero.');
    
    if (points < 0) { setGoalCorrectionTeam(team); setGoalCorrectionPlayer(''); return; }
    setSubOutPlayer(null); 
    setScoringAction({ team, type, points });
  };

  const confirmGoalCorrection = async () => {
    if (!goalCorrectionTeam) return;
    const teamId = goalCorrectionTeam === 'HOME' ? match.home_team.id : match.away_team.id;
    const goals = liveEvents.filter((event) => event.team_id === teamId && event.event_type === 'GOAL');
    const latestGoal = goals[goals.length - 1];
    if (!latestGoal) { toast.error('No hay goles registrados para ese equipo.'); return; }
    if (goalCorrectionPlayer && latestGoal.player_id !== goalCorrectionPlayer) {
      toast.error('Ese jugador no corresponde al último gol registrado. Corrija primero el evento más reciente.');
      return;
    }
    // A previous press of the old minus control created SCORE_ADJUST but left
    // the GOAL event (and scorer) intact. In that case remove the event only;
    // decrementing the score again would produce an incorrect result.
    const scoreWasAlreadyAdjusted = liveEvents.some((event) => event.team_id === teamId && event.event_type === 'SCORE_ADJUST' && Number(event.score_delta ?? event.scoreDelta ?? 0) < 0);
    setLoading(true);
    try {
      const result = isDemo
        ? revertDemoLastFootballGoal(match.id, teamId, goalCorrectionPlayer || null, !scoreWasAlreadyAdjusted)
        // A goal can have been recorded in an earlier period (for example 1T)
        // while the operator is correcting it during 2T or after the period
        // changed. Passing null searches the whole match and avoids the false
        // "no hay puntos recientes" result.
        : await revertLastScoringEvent({ slug, matchId: match.id, teamId, eventId: latestGoal.id, period: null, updateMatchScore: !scoreWasAlreadyAdjusted });
      if (!result?.success) throw new Error(result?.error || 'No fue posible revertir el gol.');
      if (typeof result.home_score === 'number') setHomeScore(result.home_score);
      if (typeof result.away_score === 'number') setAwayScore(result.away_score);
      await fetchLiveEvents();
      toast.success('Gol eliminado y marcador actualizado.');
      setGoalCorrectionTeam(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No fue posible eliminar el gol.'); }
    finally { setLoading(false); }
  };

  const confirmYellowCorrection = async () => {
    if (!yellowCorrectionEvent) return;
    setLoading(true);
    try {
      const result = isDemo
        ? removeDemoYellowCard(match.id, yellowCorrectionEvent.id)
        : await removeYellowCardEvent({ slug, matchId: match.id, eventId: yellowCorrectionEvent.id });
      if (!result?.success) throw new Error(('error' in result && result.error) || 'No fue posible eliminar la tarjeta.');
      await fetchLiveEvents();
      toast.success(result.removedGeneratedRed ? 'Tarjeta eliminada y doble amarilla revertida.' : 'Tarjeta amarilla eliminada con sus efectos asociados.');
      setYellowCorrectionEvent(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible eliminar la tarjeta.');
    } finally { setLoading(false); }
  };

  const handleTimeoutOrInjury = () => {
     if (!isMatchLive) return toast.error('El partido no está en vivo.');
     toggleTimer();
     if (isRunning) {
        toast('Partido Pausado (Lesión / T. Fuera)', { icon: '🛑' });
     } else {
        toast.success('Partido Reanudado', { icon: '⏱️' });
     }
  };

  const executeActionRecord = async (team: 'HOME' | 'AWAY', type: 'SCORE' | 'YELLOW' | 'RED' | 'SUB' | 'ASSIST' | 'MVP', points: number, playerId?: string) => {
    if (playerId || type === 'SCORE' || type === 'YELLOW') {
      const exactSecond = phase === 'EXTRA' ? (match.match_duration_seconds || 2400) + extraSeconds : regularSeconds;
      const teamId = team === 'HOME' ? match.home_team.id : match.away_team.id;
      const minuteRecord = Math.floor(exactSecond / 60) + 1;

      let generatedRedEvent = null; let fairPlayPenalty = 0; 
      if (type === 'YELLOW' && playerId) {
        if (liveEvents.filter(e => e.player_id === playerId && e.event_type === 'YELLOW').length === 1) { generatedRedEvent = true; toast.error('¡Doble Amarilla!'); fairPlayPenalty = categoryData?.tournaments?.red_card_points || categoryData?.tournaments?.fp_red_deduction || 300; } 
        else { fairPlayPenalty = categoryData?.tournaments?.yellow_card_points || categoryData?.tournaments?.fp_yellow_deduction || 100; }
      } else if (type === 'RED') { fairPlayPenalty = categoryData?.tournaments?.red_card_points || categoryData?.tournaments?.fp_red_deduction || 300; }

      if (!categoryData?.tournaments?.fair_play_enabled) {
        fairPlayPenalty = 0;
      }

      if (type === 'SUB' && playerId) {
        if (!subOutPlayer) { setSubOutPlayer(playerId); toast.success('Seleccione quién ENTRA.'); return; } 
        else {
          try {
            const substitutionInput = {
              slug,
              matchId: match.id,
              teamId,
              playerId,
              eventType: 'SUB' as const,
              period: currentPeriod,
              matchSecond: exactSecond,
              minuteRecord,
              subOutPlayerId: subOutPlayer,
            };
            if (isDemo) recordDemoFootballEvent(substitutionInput); else await recordFootballMatchEvent(substitutionInput);

            if (team === 'HOME') setHomeStartingLineup(prev => prev.map(id => id === subOutPlayer ? playerId : id)); else setAwayStartingLineup(prev => prev.map(id => id === subOutPlayer ? playerId : id));
            toast.success('Sustitución', { icon: '🔄' }); setScoringAction(null); setSubOutPlayer(null); await fetchLiveEvents(); return;
          } catch (error: any) {
            toast.error("Error BD: " + error.message);
            return;
          }
        }
      }

      try {
        const eventInput = {
          slug,
          matchId: match.id,
          teamId,
          playerId: playerId || null,
          eventType: (type === 'SCORE' ? (points < 0 ? 'SCORE_ADJUST' : 'GOAL') : type) as 'RED' | 'YELLOW' | 'GOAL' | 'SCORE_ADJUST' | 'SUB' | 'ASSIST' | 'MVP',
          period: currentPeriod,
          matchSecond: exactSecond,
          minuteRecord,
          scoreDelta: type === 'SCORE' ? points : 0,
          fairPlayDelta: fairPlayPenalty,
          generatedRed: Boolean(generatedRedEvent),
        };
        const result = isDemo ? recordDemoFootballEvent(eventInput) : await recordFootballMatchEvent(eventInput);

        if (typeof result?.home_score === 'number') setHomeScore(result.home_score);
        if (typeof result?.away_score === 'number') setAwayScore(result.away_score);
      } catch (error: any) {
        console.error("Error BD:", error);
        toast.error("Error en Supabase: " + error.message);
        return;
      }

      await fetchLiveEvents(); 
      if (type === 'SCORE' && points > 0) toast.success('¡Goooool!');
    }
    if (type !== 'SUB') setScoringAction(null);
  };

  const handlePenaltyRecord = (team: 'HOME' | 'AWAY', index: number, isGoal: boolean) => {
    if (team === 'HOME') { const newPens = [...homePenalties]; newPens[index] = isGoal; setHomePenalties(newPens); } 
    else { const newPens = [...awayPenalties]; newPens[index] = isGoal; setAwayPenalties(newPens); }
  };

  const homePenaltyScore = homePenalties.filter(p => p === true).length;
  const awayPenaltyScore = awayPenalties.filter(p => p === true).length;
  const penaltyWinner = (() => {
    const hT = homePenalties.filter(p => p !== null).length; const aT = awayPenalties.filter(p => p !== null).length;
    if (hT <= 5 && aT <= 5) { if (homePenaltyScore > awayPenaltyScore + (5 - aT)) return 'HOME'; if (awayPenaltyScore > homePenaltyScore + (5 - hT)) return 'AWAY'; } 
    else if (hT > 5 && aT === hT) { if (homePenaltyScore > awayPenaltyScore) return 'HOME'; if (awayPenaltyScore > homePenaltyScore) return 'AWAY'; }
    return null;
  })();

  const handleRequestFinish = () => { if (!isMatchLive) return; if(isRunning) toggleTimer(); setShowSummaryModal(true); };

  const confirmFinishMatch = async () => {
    setShowSummaryModal(false); setLoading(true); const toastId = toast.loading('Cerrando acta...');
    try {
      if (isDemo) finishDemoFootballMatch(match.id, homeScore, awayScore, currentPeriod); else await finishFootballMatch({
        slug,
        matchId: match.id,
        homeScore,
        awayScore,
        currentPeriod,
        homePenaltyScore: currentPeriod === 'PEN' ? homePenaltyScore : null,
        awayPenaltyScore: currentPeriod === 'PEN' ? awayPenaltyScore : null,
      });
      
      toast.success('Acta Guardada', { id: toastId }); onMatchUpdate(); onClose();
    } catch (error: any) { toast.error(error.message || 'Error', { id: toastId }); }
    setLoading(false);
  };

  const handleSmartBottomAction = () => {
    if (!isMatchLive) return;
    if (currentPeriod === '2T' || currentPeriod === 'PEN') handleRequestFinish();
    else { const periods = ['1T', '2T', 'PEN']; const nextIdx = periods.indexOf(currentPeriod) + 1; if (nextIdx < periods.length) requestPeriodChange(periods[nextIdx]); }
  };

  const handlePrintMatchSheet = async () => {
    if (homeRoster.length === 0 && awayRoster.length === 0) return toast.error('No hay jugadores cargados para crear la planilla.');
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.setFillColor(7, 15, 36); pdf.rect(0, 0, 297, 28, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text('PLANILLA MANUAL DE PARTIDO', 12, 12);
    pdf.setFontSize(9); pdf.text(`${String(match.home_team?.name || '').toUpperCase()}  VS  ${String(match.away_team?.name || '').toUpperCase()}`, 12, 21);
    pdf.setTextColor(71, 85, 105); pdf.setFontSize(8);
    const date = match.matchdays?.scheduled_date || 'Fecha pendiente';
    const time = match.scheduled_time?.slice(0, 5) || '--:--';
    pdf.text(`${date} · ${time} · ${String(match.venue || 'Cancha pendiente').toUpperCase()} · Jornada ${match.matchdays?.round_number || '-'}`, 285, 20, { align: 'right' });

    const drawRoster = (title: string, roster: any[], x: number) => {
      const widths = [10, 16, 65, 13, 13, 13, 15];
      const headers = ['#', 'Dorsal', 'Jugador', 'Gol', 'TA', 'TR', 'Min.'];
      const rowCount = Math.max(roster.length, 16);
      const rowHeight = Math.min(7, 137 / rowCount);
      let y = 36;
      pdf.setFillColor(219, 234, 254); pdf.roundedRect(x, y, 137, 9, 2, 2, 'F');
      pdf.setTextColor(29, 78, 216); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.text(title.toUpperCase(), x + 4, y + 6);
      y += 11;
      pdf.setFillColor(241, 245, 249); pdf.rect(x, y, 137, 8, 'F');
      let columnX = x;
      headers.forEach((header, index) => { pdf.setTextColor(71, 85, 105); pdf.setFontSize(6); pdf.text(header, columnX + 2, y + 5); columnX += widths[index]; });
      y += 8;
      roster.forEach((player, index) => {
        pdf.setDrawColor(203, 213, 225); pdf.rect(x, y, 137, rowHeight);
        const values = [String(index + 1), String(player.shirt_number || '-'), String(player.name || '').toUpperCase(), '', '', '', ''];
        let valueX = x;
        values.forEach((value, valueIndex) => { pdf.setTextColor(15, 23, 42); pdf.setFontSize(Math.min(6.5, rowHeight)); pdf.text(pdf.splitTextToSize(value, widths[valueIndex] - 3).slice(0, 1), valueX + 2, y + Math.min(4.8, rowHeight - 1)); valueX += widths[valueIndex]; if (valueIndex < widths.length - 1) { pdf.line(valueX, y, valueX, y + rowHeight); } });
        y += rowHeight;
      });
      for (let index = roster.length; index < rowCount; index += 1) { pdf.setDrawColor(226, 232, 240); pdf.rect(x, y, 137, rowHeight); y += rowHeight; }
    };
    drawRoster(match.home_team?.name || 'Local', homeRoster, 10);
    drawRoster(match.away_team?.name || 'Visitante', awayRoster, 150);
    pdf.setTextColor(71, 85, 105); pdf.setFontSize(7); pdf.text('Marcador final: LOCAL ______  VISITANTE ______     Árbitro: ______________________________     Firma mesa: ______________________________', 12, 198);
    pdf.autoPrint();
    const url = URL.createObjectURL(pdf.output('blob'));
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) { pdf.save(`planilla-${match.home_team?.name || 'local'}-${match.away_team?.name || 'visitante'}.pdf`); URL.revokeObjectURL(url); }
    else window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden text-white font-sans animate-in slide-in-from-right duration-300 bg-[url('/bg-futbol.jpg')] bg-cover bg-center">
      
      <div className="absolute inset-0 bg-slate-900/50 z-0 backdrop-blur-[2px]"></div>

      {/* ======================================================== */}
      {/* 1. INTERFAZ PRINCIPAL (LA MESA Y LA CANCHA)              */}
      {/* ======================================================== */}
      <div className="relative z-10 flex flex-col h-full w-full">
        
        {/* BOTÓN VOLVER ABSOLUTO */}
        <div className="fixed top-2 left-2 sm:top-4 sm:left-4 z-[100]">
            <button onClick={onClose} aria-label="Volver a mesas" className="flex items-center gap-1.5 text-slate-200 hover:text-white transition-colors bg-slate-900/95 px-2.5 py-2 sm:gap-2 sm:px-4 sm:py-3 rounded-xl shadow-lg border border-slate-700 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Mesas</span>
            </button>
        </div>
        <div className="absolute right-4 top-4 z-50"><button type="button" onClick={handlePrintMatchSheet} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-600 sm:px-4 sm:py-3"><FileDown size={16} /> <span className="hidden sm:inline">Planilla impresa</span></button></div>

        {/* EL MARCADOR EXACTO */}
        <div className="w-full flex flex-col items-center justify-center pt-14 sm:pt-10 landscape:pt-8 z-40 relative shrink-0">

          {/* Nombre del Torneo / Categoría */}
          <div className="mesa-tournament-label text-white text-[9px] sm:text-xs landscape:text-[8px] font-black uppercase tracking-widest drop-shadow-md mb-1 sm:mb-2 landscape:mb-0.5 max-w-[70%] truncate">
             {categoryData?.tournaments?.name || 'TORNEO OFICIAL'} • {categoryData?.name || 'CATEGORÍA'}
          </div>

          {/* Reloj */}
          <div className="flex items-center justify-center gap-2 sm:gap-3">
          <div className="bg-[#e11d48] text-white px-4 sm:px-10 landscape:px-4 py-1 sm:py-1.5 landscape:text-sm flex items-center justify-center rounded-t-md border-x-2 border-t-2 border-[#1e1b4b] z-20 relative mb-[-2px] shadow-lg">
             <GlobalTimer 
                regularSeconds={regularSeconds} 
                extraSeconds={extraSeconds} 
                phase={phase} 
                isRunning={isRunning} 
                toggleTimer={toggleTimer} 
                endMatch={endMatch} 
                resetTimer={resetTimer}
                isAdmin={true} 
              />
          </div>
          {isMatchLive && <button type="button" title={isRunning ? 'Tiempo fuera o lesión' : 'Reanudar partido'} onClick={handleTimeoutOrInjury} aria-label={isRunning ? 'Tiempo fuera o lesión' : 'Reanudar partido'} className={`flex h-9 w-9 sm:h-11 sm:w-11 landscape:h-9 landscape:w-9 items-center justify-center rounded-full border-2 shadow-lg transition-all ${!isRunning ? 'bg-red-600 text-white border-white animate-pulse' : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'}`}>
            <AlertTriangle size={16} />
          </button>}
          </div>

          {/* Barra Principal */}
          <div className="mesa-scoreboard flex items-stretch justify-center h-12 sm:h-16 landscape:h-11 w-[95%] max-w-4xl relative z-10 shadow-2xl">
             <div className="w-4 sm:w-6 bg-red-600 transform skew-x-[-15deg] border-y-2 border-l-2 border-[#1e1b4b] relative -mr-2 sm:-mr-3 z-10"></div>

             <div className="flex-1 bg-white border-y-2 sm:border-y-4 border-l-2 sm:border-l-4 border-[#1e1b4b] flex items-center justify-center px-4 z-20 shadow-md">
                 <span className="mesa-team-name text-[#1e1b4b] font-black text-[10px] sm:text-lg uppercase tracking-widest truncate">{match.home_team?.name}</span>
             </div>

             <div className="mesa-score-value bg-[#1e1b4b] text-white flex items-center justify-center px-4 sm:px-10 landscape:px-5 font-black text-2xl sm:text-4xl landscape:text-2xl z-30 shadow-2xl min-w-[90px] sm:min-w-[140px] landscape:min-w-[110px]">
                 {currentPeriod === 'PEN' ? homePenaltyScore : homeScore} 
                 <span className="text-slate-500 mx-2 sm:mx-3 text-xl sm:text-3xl">-</span> 
                 {currentPeriod === 'PEN' ? awayPenaltyScore : awayScore}
             </div>

             <div className="flex-1 bg-white border-y-2 sm:border-y-4 border-r-2 sm:border-r-4 border-[#1e1b4b] flex items-center justify-center px-4 z-20 shadow-md">
                 <span className="mesa-team-name text-[#1e1b4b] font-black text-[10px] sm:text-lg uppercase tracking-widest truncate">{match.away_team?.name}</span>
             </div>

             <div className="w-4 sm:w-6 bg-blue-500 transform skew-x-[-15deg] border-y-2 border-r-2 border-[#1e1b4b] relative -ml-2 sm:-ml-3 z-10"></div>
          </div>

          {/* Selectores de Periodo */}
          <div className="mesa-periods flex justify-center gap-2 sm:gap-3 landscape:gap-2 mt-3 sm:mt-5 landscape:mt-1 z-40">
             {['1T', '2T', 'PEN'].map(p => (
               <button key={p} onClick={() => requestPeriodChange(p)} disabled={!isMatchLive} className={`px-4 py-1 sm:px-5 sm:py-1.5 md:py-2 rounded-full text-[9px] sm:text-[10px] md:text-xs font-black uppercase tracking-widest transition-all border ${currentPeriod === p ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.6)] scale-105 sm:scale-110' : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'}`}>
                 {p}
               </button>
             ))}
          </div>

          {!showSummaryModal && (
            <div className="mt-3 flex w-full justify-center px-4 landscape:mt-2">
              <button
                onClick={handleSmartBottomAction}
                disabled={loading || !isMatchLive}
                className={`mesa-advance-action flex min-h-9 w-full max-w-sm items-center justify-center gap-2 rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all sm:min-h-10 sm:text-[10px] ${currentPeriod === '2T' || currentPeriod === 'PEN' ? 'border border-red-500 bg-gradient-to-r from-red-700 to-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 'border border-slate-700 bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white'}`}
              >
                {currentPeriod === '2T' || currentPeriod === 'PEN' ? <><CheckCircle2 className="h-4 w-4" /> Cerrar acta oficial</> : <><ArrowRight className="h-4 w-4 text-blue-400" /> Finalizar {currentPeriod} y avanzar</>}
              </button>
            </div>
          )}
        </div>

        {/* CONTROLES INFERIORES DE LA CANCHA */}
        {currentPeriod === 'PEN' ? (
          <PenaltyShootout match={match} homeScore={homeScore} awayScore={awayScore} homePenalties={homePenalties} awayPenalties={awayPenalties} homePenaltyScore={homePenaltyScore} awayPenaltyScore={awayPenaltyScore} penaltyWinner={penaltyWinner} onRecordPenalty={handlePenaltyRecord} />
        ) : (
          <div className="flex-1 flex flex-col sm:flex-row landscape:flex-row items-stretch relative z-10 w-full max-w-7xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4 landscape:px-3 landscape:pt-4 landscape:pb-2 min-h-0">
            
            {/* BOTÓN CENTRAL DE LESIÓN / TIEMPO FUERA */}
            {/* LOCAL CONTROLES */}
            <div className={`flex-1 flex flex-col items-center justify-center p-1 sm:p-4 md:p-6 landscape:p-1 relative z-10 transition-opacity min-w-0 min-h-0 ${!isMatchLive ? 'opacity-40 grayscale blur-[1px] pointer-events-none' : 'opacity-100'}`}>
              <button onClick={() => setShowRosterModal('HOME')} className="mesa-team-logo relative shrink-0 overflow-hidden bg-white rounded-full border-2 sm:border-4 border-slate-100 p-3 sm:p-6 md:p-8 landscape:p-2 shadow-[0_0_30px_rgba(255,255,255,0.3)] sm:shadow-[0_0_50px_rgba(255,255,255,0.4)] mb-2 sm:mb-6 landscape:mb-1 hover:scale-105 transition-transform z-10 w-28 h-28 sm:w-44 sm:h-44 md:w-60 md:h-60 landscape:w-32 landscape:h-32 flex items-center justify-center group">
                 <div className="absolute inset-0 rounded-full bg-white opacity-50 blur-md group-hover:blur-xl transition-all"></div>
                 {match.home_team?.schools?.logo_url ? <img src={match.home_team.schools.logo_url} className="relative z-10 block h-auto w-auto max-h-full max-w-full object-contain drop-shadow-xl group-hover:scale-110 transition-transform" alt={`Escudo de ${match.home_team?.name || 'local'}`} /> : <School className="relative z-10 h-10 w-10 text-slate-300 sm:h-16 sm:w-16" />}
              </button>
              
              <div className="mesa-action-row flex flex-wrap justify-center gap-1 sm:gap-2 landscape:gap-1 mb-2 sm:mb-6 landscape:mb-1 bg-slate-900/80 backdrop-blur-md p-1 sm:p-2.5 rounded-2xl border border-slate-700 shadow-xl z-10">
                <button aria-label={`Amarilla para ${match.home_team?.name || 'local'}`} onClick={() => handleRefereeAction('HOME', 'YELLOW')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center hover:bg-slate-800"><Square className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-yellow-500 fill-yellow-500 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" /></button>
                <button onClick={() => handleRefereeAction('HOME', 'RED')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center hover:bg-slate-800"><Square className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500 fill-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" /></button>
                <button onClick={() => handleRefereeAction('HOME', 'SUB')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-blue-400 hover:bg-slate-800"><RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /></button>
                <button title="Asistencia" onClick={() => handleRefereeAction('HOME', 'ASSIST')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-cyan-400 hover:bg-slate-800"><Handshake className="w-5 h-5" /></button>
                <button title="Jugador MVP" onClick={() => handleRefereeAction('HOME', 'MVP')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-violet-400 hover:bg-slate-800"><Star className="w-5 h-5" /></button>
              </div>
              
              <div className="mesa-action-row mesa-score-row flex items-center justify-center gap-2 sm:gap-4 landscape:gap-1 bg-slate-900/80 backdrop-blur-md p-2 sm:p-4 landscape:p-1 rounded-2xl sm:rounded-3xl border border-slate-700 shadow-2xl z-10">
                <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', -1)} className="h-12 w-14 sm:h-14 sm:w-16 md:h-16 md:w-20 landscape:h-11 landscape:w-14 bg-slate-950 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-500 border border-slate-800 hover:text-red-400 active:scale-95 transition-all"><Minus className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 landscape:h-5 landscape:w-5" /></button>
                <button disabled={!isMatchLive} onClick={() => handleRefereeAction('HOME', 'SCORE', 1)} className="h-12 w-24 sm:h-16 sm:w-32 md:h-20 md:w-40 landscape:h-14 landscape:w-28 bg-gradient-to-b from-emerald-500 to-emerald-700 rounded-xl sm:rounded-2xl flex items-center justify-center text-white border border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] sm:shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95 transition-all"><FaFutbol className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 landscape:h-5 landscape:w-5 mr-2 sm:mr-3 opacity-70" /><Plus className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 landscape:h-7 landscape:w-7 font-black" /></button>
              </div>
            </div>

            {/* VISITANTE CONTROLES */}
            <div className={`flex-1 flex flex-col items-center justify-center p-1 sm:p-4 md:p-6 landscape:p-1 relative z-10 transition-opacity min-w-0 min-h-0 ${!isMatchLive ? 'opacity-40 grayscale blur-[1px] pointer-events-none' : 'opacity-100'}`}>
              <button onClick={() => setShowRosterModal('AWAY')} className="mesa-team-logo relative shrink-0 overflow-hidden bg-white rounded-full border-2 sm:border-4 border-slate-100 p-3 sm:p-6 md:p-8 landscape:p-2 shadow-[0_0_30px_rgba(255,255,255,0.3)] sm:shadow-[0_0_50px_rgba(255,255,255,0.4)] mb-2 sm:mb-6 landscape:mb-1 hover:scale-105 transition-transform z-10 w-28 h-28 sm:w-44 sm:h-44 md:w-60 md:h-60 landscape:w-32 landscape:h-32 flex items-center justify-center group">
                 <div className="absolute inset-0 rounded-full bg-white opacity-50 blur-md group-hover:blur-xl transition-all"></div>
                 {match.away_team?.schools?.logo_url ? <img src={match.away_team.schools.logo_url} className="relative z-10 block h-auto w-auto max-h-full max-w-full object-contain drop-shadow-xl group-hover:scale-110 transition-transform" alt={`Escudo de ${match.away_team?.name || 'visitante'}`} /> : <School className="relative z-10 h-10 w-10 text-slate-300 sm:h-16 sm:w-16" />}
              </button>
              
              <div className="mesa-action-row flex flex-wrap justify-center gap-1 sm:gap-2 landscape:gap-1 mb-2 sm:mb-6 landscape:mb-1 bg-slate-900/80 backdrop-blur-md p-1 sm:p-2.5 rounded-2xl border border-slate-700 shadow-xl z-10">
                <button aria-label={`Amarilla para ${match.away_team?.name || 'visitante'}`} onClick={() => handleRefereeAction('AWAY', 'YELLOW')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center hover:bg-slate-800"><Square className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-yellow-500 fill-yellow-500 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" /></button>
                <button onClick={() => handleRefereeAction('AWAY', 'RED')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center hover:bg-slate-800"><Square className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500 fill-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" /></button>
                <button onClick={() => handleRefereeAction('AWAY', 'SUB')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-blue-400 hover:bg-slate-800"><RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /></button>
                <button title="Asistencia" onClick={() => handleRefereeAction('AWAY', 'ASSIST')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-cyan-400 hover:bg-slate-800"><Handshake className="w-5 h-5" /></button>
                <button title="Jugador MVP" onClick={() => handleRefereeAction('AWAY', 'MVP')} disabled={!isMatchLive} className="w-12 h-10 sm:w-14 sm:h-12 md:w-16 md:h-14 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-violet-400 hover:bg-slate-800"><Star className="w-5 h-5" /></button>
              </div>
              
              <div className="mesa-action-row mesa-score-row flex items-center justify-center gap-2 sm:gap-4 landscape:gap-1 bg-slate-900/80 backdrop-blur-md p-2 sm:p-4 landscape:p-1 rounded-2xl sm:rounded-3xl border border-slate-700 shadow-2xl z-10">
                <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', -1)} className="h-12 w-14 sm:h-14 sm:w-16 md:h-16 md:w-20 landscape:h-11 landscape:w-14 bg-slate-950 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-500 border border-slate-800 hover:text-red-400 active:scale-95 transition-all"><Minus className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 landscape:h-5 landscape:w-5" /></button>
                <button disabled={!isMatchLive} onClick={() => handleRefereeAction('AWAY', 'SCORE', 1)} className="h-12 w-24 sm:h-16 sm:w-32 md:h-20 md:w-40 landscape:h-14 landscape:w-28 bg-gradient-to-b from-emerald-500 to-emerald-700 rounded-xl sm:rounded-2xl flex items-center justify-center text-white border border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] sm:shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95 transition-all"><FaFutbol className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 landscape:h-5 landscape:w-5 mr-2 sm:mr-3 opacity-70" /><Plus className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 landscape:h-7 landscape:w-7 font-black" /></button>
              </div>
            </div>
          </div>
        )}

        <div className="mesa-timeline relative z-30 mx-4 mb-3 self-end sm:mx-auto sm:w-full sm:max-w-3xl landscape:fixed landscape:bottom-4 landscape:right-4 landscape:mx-0 landscape:mb-0 landscape:w-auto landscape:max-w-none">
          <button type="button" aria-expanded={showTimeline} aria-controls="match-event-timeline" onClick={() => setShowTimeline((visible) => !visible)} className="ml-auto flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-slate-950/90 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-300 shadow-lg transition hover:bg-slate-900 hover:text-white">
            <span>{showTimeline ? 'Ocultar eventos' : 'Últimos eventos'}</span><span className="rounded-full bg-slate-800 px-2 py-0.5 text-[8px] text-slate-400">{liveEvents.length}</span>
          </button>
          {showTimeline && <section id="match-event-timeline" aria-label="Línea de tiempo del partido" className="mt-2 max-h-28 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-3 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-400"><span>Últimos eventos</span><span>{liveEvents.length} registrados</span></div>
            {liveEvents.length === 0 ? <p className="text-[10px] font-semibold text-slate-500">Aún no hay eventos registrados.</p> : <div className="space-y-1">{liveEvents.slice(-6).reverse().map((event: any) => {
              const content = <><span className="w-10 shrink-0 text-slate-400">{event.minute_record || '--'}</span><span className="w-5 shrink-0" aria-hidden="true">{event.event_type === 'GOAL' ? '⚽' : event.event_type === 'YELLOW' ? '🟨' : event.event_type === 'RED' ? '🟥' : event.event_type === 'SUB' ? '🔄' : '•'}</span><span className="truncate">{event.players?.name || 'Evento de equipo'} · {event.event_type}</span></>;
              return event.event_type === 'YELLOW'
                ? <button type="button" key={event.id} onClick={() => setYellowCorrectionEvent(event)} aria-label={`Corregir tarjeta amarilla de ${event.players?.name || 'jugador'}`} className="flex w-full items-center gap-2 rounded-lg text-left text-[10px] font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{content}</button>
                : <div key={event.id} className="flex items-center gap-2 text-[10px] font-bold text-white">{content}</div>;
            })}</div>}
          </section>}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. BOTÓN INFERIOR DE CERRAR ACTA                         */}
      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* 3. CAPA DE MODALES ABSOLUTA AL FINAL DEL ARCHIVO         */}
      {/* ======================================================== */}
      <div className="relative z-[999]">
        
        {/* 🔥 EL GRAN OVERLAY PARA INICIAR PARTIDO (AHORA SE OCULTA AL ABRIR ALINEACIÓN) 🔥 */}
        {!isMatchLive && !showStartingLineupModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/70 backdrop-blur-md">
            <button onClick={handlePreMatchSetup} className="flex flex-col items-center justify-center gap-2 w-48 h-48 sm:w-56 sm:h-56 bg-red-600 rounded-full text-white shadow-[0_0_80px_rgba(220,38,38,0.7)] hover:scale-105 active:scale-95 transition-all border-4 border-white animate-pulse">
              <Radio className="w-16 h-16 sm:w-20 sm:h-20" />
              <span className="font-black uppercase tracking-widest text-sm sm:text-lg text-center px-4 leading-tight mt-2">
                Iniciar Partido
              </span>
            </button>
          </div>
        )}

        {showStartingLineupModal && <StartingLineupModal match={match} maxPlayers={maxPlayers} minPlayers={minPlayers} homeRoster={homeRoster} awayRoster={awayRoster} suspendedPlayers={suspendedPlayers} homeStartingLineup={homeStartingLineup} awayStartingLineup={awayStartingLineup} toggleStartingPlayer={toggleStartingPlayer} loading={loading} onClose={() => setShowStartingLineupModal(false)} onOpenWO={() => setShowWOModal(true)} onQuickStart={handleQuickStart} onTurnMatchLive={handleTurnMatchLive} />}
        
        {showWOModal && <WalkoverModal match={match} loading={loading} onClose={() => setShowWOModal(false)} onExecuteWO={handleExecuteWO} />}
        
        {showSummaryModal && <MatchSummaryModal match={match} homeScore={homeScore} awayScore={awayScore} homePenaltyScore={homePenaltyScore} awayPenaltyScore={awayPenaltyScore} currentPeriod={currentPeriod} liveEvents={liveEvents} loading={loading} onClose={() => setShowSummaryModal(false)} onConfirm={confirmFinishMatch} />}
        
        {showPeriodStartOverlay && (
           <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
              <button onClick={handleStartPeriodFromOverlay} className="flex flex-col items-center justify-center gap-3 w-48 h-48 sm:w-64 sm:h-64 bg-emerald-600 rounded-full text-white shadow-[0_0_80px_rgba(16,185,129,0.7)] hover:scale-105 active:scale-95 transition-all border-4 border-white animate-pulse">
                <PlayCircle className="w-16 h-16 sm:w-20 sm:h-20" />
                <span className="font-black uppercase tracking-widest text-base sm:text-lg text-center px-4 leading-tight">
                  ARRANCAR<br/>{currentPeriod}
                </span>
              </button>
           </div>
        )}
        
        {showPeriodConfirm.isOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-slate-900">
            <div className="bg-white p-6 md:p-8 rounded-[2rem] w-full max-w-sm shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4"><CalendarDays className="w-8 h-8" /></div>
              <h3 className="text-xl md:text-2xl font-black uppercase mb-2">{showPeriodConfirm.targetPeriod === 'PEN' ? '¿Ir a Penales?' : `¿Iniciar ${showPeriodConfirm.targetPeriod}?`}</h3>
              <div className="flex w-full gap-3 mt-6">
                <button onClick={() => setShowPeriodConfirm({ isOpen: false, targetPeriod: '' })} className="flex-1 py-3 bg-slate-100 rounded-xl font-black uppercase text-xs">Cancelar</button>
                <button onClick={executePeriodChange} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs">Avanzar</button>
              </div>
            </div>
          </div>
        )}
        
        {scoringAction && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-300 text-slate-900">
            <div className="bg-white border border-slate-200 p-4 sm:p-6 md:p-8 rounded-[1.5rem] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg md:text-2xl font-black uppercase">{scoringAction.type === 'SCORE' ? 'Registro de Gol' : scoringAction.type === 'YELLOW' ? 'Tarjeta Amarilla' : scoringAction.type === 'RED' ? 'Tarjeta Roja Directa' : scoringAction.type === 'ASSIST' ? 'Registrar asistencia' : scoringAction.type === 'MVP' ? 'Jugador MVP' : (scoringAction.type === 'SUB' && !subOutPlayer) ? 'Sale ⬇️' : 'Entra ⬆️'}</h3>
                  <p className="font-black uppercase text-[10px] sm:text-xs mt-1 text-slate-500">{(scoringAction.team === 'HOME' ? match.home_team.name : match.away_team.name)} • {currentPeriod}</p>
                </div>
                <button onClick={() => {setScoringAction(null); setSubOutPlayer(null);}} className="p-2 bg-slate-100 rounded-lg text-slate-400 hover:text-slate-800"><X size={20}/></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 overflow-y-auto pr-2 pb-2 flex-1">
                {(scoringAction.team === 'HOME' ? homeRoster : awayRoster).map(player => {
                  const playerYellows = liveEvents.filter(e => e.player_id === player.id && e.event_type === 'YELLOW').length;
                  const hasRed = liveEvents.some(e => e.player_id === player.id && e.event_type === 'RED');
                  const isOut = subOutPlayer === player.id;
                    const isSuspended = suspendedPlayers[player.id];
                    const eligibility = playerEligibility[player.id] || evaluatePlayerEligibility({ playerId: player.id, registered: true, teamId: player.team_id, suspended: Boolean(isSuspended), documents: player.player_documents || [] });
                  const isCurrentlyOnPitch = (scoringAction.team === 'HOME' ? homeStartingLineup : awayStartingLineup).includes(player.id);
                  let shouldDisable = false;
                  if (scoringAction.type === 'SUB' && !subOutPlayer && !isCurrentlyOnPitch) shouldDisable = true;
                  if (scoringAction.type === 'SUB' && subOutPlayer && (isCurrentlyOnPitch || isSuspended)) shouldDisable = true;
                  if (hasRed && scoringAction.type !== 'SUB') shouldDisable = true;
                  if (eligibility.status === 'INELIGIBLE' && scoringAction.type !== 'SUB') shouldDisable = true;

                  return (
                    <button key={player.id} onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points, player.id)} disabled={shouldDisable} className={`p-3 sm:p-4 rounded-xl border flex flex-col items-center relative ${hasRed ? 'bg-red-50 border-red-200 opacity-50' : shouldDisable ? 'bg-slate-100 opacity-50' : 'hover:bg-emerald-50'} ${isOut ? 'ring-2 ring-red-400' : ''}`}>
                      {playerYellows > 0 && !isSuspended && !hasRed && <Square className="absolute top-2 right-2 text-yellow-400 fill-yellow-400 w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                      {hasRed && <Square className="absolute top-2 left-2 text-red-500 fill-red-500 w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                      <span className="text-xl sm:text-2xl font-black">{player.shirt_number || '-'}</span>
                      <span className="text-[8px] sm:text-[9px] font-bold uppercase mt-1 text-center truncate w-full">{player.name}</span>
                      <span className="mt-1 text-[8px] font-black uppercase text-blue-500">{playerAgeAtTournament(player) ?? '-'} años</span>
                      {!hasRequiredFiles(player) && <span className="mt-1 text-[7px] font-black uppercase text-amber-600">Documentos pendientes</span>}
                      {eligibility.status === 'WARNING' && <span className="mt-1 text-[7px] font-black uppercase text-amber-600">Revisión requerida</span>}
                      {eligibility.status === 'INELIGIBLE' && <span className="mt-1 text-[7px] font-black uppercase text-red-600">{eligibility.blockingReasons[0]?.message || 'No habilitado'}</span>}
                    </button>
                  );
                })}
              </div>
              {scoringAction.type !== 'SUB' && (
                <button onClick={() => executeActionRecord(scoringAction.team, scoringAction.type, scoringAction.points)} className="mt-4 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-[10px] sm:text-xs w-full">Omitir Identificación</button>
              )}
            </div>
          </div>
        )}

        {goalCorrectionTeam && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="goal-correction-title">
            <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-white p-5 text-slate-900 shadow-2xl sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Corrección de marcador</p>
                  <h3 id="goal-correction-title" className="mt-1 text-xl font-black uppercase">¿De quién fue el gol?</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Se eliminará el último gol registrado de {goalCorrectionTeam === 'HOME' ? match.home_team.name : match.away_team.name} y se actualizará el marcador.</p>
                </div>
                <button type="button" aria-label="Cerrar corrección" onClick={() => setGoalCorrectionTeam(null)} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button>
              </div>
              <label htmlFor="goal-correction-player" className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Jugador que marcó</label>
              <select id="goal-correction-player" value={goalCorrectionPlayer} onChange={(event) => setGoalCorrectionPlayer(event.target.value)} className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
                <option value="">Gol sin jugador identificado</option>
                {(goalCorrectionTeam === 'HOME' ? homeRoster : awayRoster).map((player) => <option key={player.id} value={player.id}>#{player.shirt_number || '-'} {player.name}</option>)}
              </select>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setGoalCorrectionTeam(null)} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200">Cancelar</button>
                <button type="button" disabled={loading} onClick={confirmGoalCorrection} className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50">Eliminar gol</button>
              </div>
            </div>
          </div>
        )}

        {yellowCorrectionEvent && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="yellow-correction-title">
            <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-white p-5 text-slate-900 shadow-2xl sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">Corrección disciplinaria</p>
                  <h3 id="yellow-correction-title" className="mt-1 text-xl font-black uppercase">¿Eliminar tarjeta amarilla?</h3>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">Se eliminará este evento y todos los registros asociados, incluido el comprobante de pago. Si fue la segunda amarilla, también se revertirá la expulsión generada.</p>
                </div>
                <button type="button" aria-label="Cerrar corrección de tarjeta" onClick={() => setYellowCorrectionEvent(null)} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-slate-700">{yellowCorrectionEvent.players?.name || 'Jugador'} · {yellowCorrectionEvent.minute_record || '--'} · {match.home_team.id === yellowCorrectionEvent.team_id ? match.home_team.name : match.away_team.name}</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setYellowCorrectionEvent(null)} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200">Cancelar</button>
                <button type="button" disabled={loading} onClick={confirmYellowCorrection} className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50">Eliminar tarjeta</button>
              </div>
            </div>
          </div>
        )}

        {showRosterModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-slate-900">
            <div className="bg-white p-4 sm:p-6 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-lg sm:text-xl font-black uppercase text-slate-900">Nómina - {showRosterModal === 'HOME' ? match.home_team.name : match.away_team.name}</h3>
                <button onClick={() => setShowRosterModal(null)} className="p-2 bg-slate-100 rounded-full"><X size={16}/></button>
              </div>
              <div className="overflow-y-auto space-y-2 pr-2">
                {(showRosterModal === 'HOME' ? homeRoster : awayRoster).map(p => {
                  const isStarter = (showRosterModal === 'HOME' ? homeStartingLineup : awayStartingLineup).includes(p.id);
                  return (
                    <div key={p.id} className="p-2 sm:p-3 border rounded-xl flex justify-between items-center bg-slate-50">
                      <div className="flex gap-2 sm:gap-3 items-center">
                         <span className="font-black w-6 text-center text-slate-400 text-xs sm:text-sm">{p.shirt_number||'-'}</span>
                         <div><span className="block font-bold text-[10px] sm:text-sm uppercase truncate max-w-[150px] sm:max-w-[250px]">{p.name}</span><span className="text-[8px] font-black uppercase text-blue-500">{playerAgeAtTournament(p) ?? '-'} años en el torneo</span></div>
                      </div>
                      <span className={`text-[8px] sm:text-[9px] font-bold px-2 py-1 rounded ${isStarter ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>{isStarter ? 'TITULAR' : 'SUPLENTE'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
