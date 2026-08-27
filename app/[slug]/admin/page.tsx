'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { supabase } from '../../supabase'; 
import { Trophy, LogOut, ArrowRight, LayoutDashboard, Users, CalendarDays, Plus, School, MonitorPlay, BarChart3, GitMerge, Settings, Trash2, FileText, X, Download, Activity, Copy, ExternalLink, Scale, Pencil, UserCog, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import AppSelect from '@/app/components/AppSelect';
import { logoutClientAccess } from './actions';
import { deleteTournament } from './crear-torneo/actions';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '../../lib/sports/rules';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import { loadDemoDatabase, saveDemoDatabase } from '@/app/lib/demo/database';
import OperationsDashboard from './operations/OperationsDashboard';
import { getTournamentOperations } from './operations/actions';
import { getDemoTournamentOperations } from './operations/demo';
import type { TournamentOperationsData } from './operations/types';

type AdminHubProps = { demoMode?: boolean; demoBasePath?: string };

export default function AdminHub({ demoMode = false, demoBasePath = '/demo-7c9f3a-sportscore' }: AdminHubProps = {}) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const isDemo = demoMode || slug === DEMO_SLUG;
  const activeDemoBasePath = slug === DEMO_SLUG ? `/${DEMO_SLUG}` : demoBasePath;

  const [tournaments, setTournaments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(searchParams.get('tournament') || '');
  const [clientInfo, setClientInfo] = useState<{ id: string; name: string; logo_url: string } | null>(null);
  const [operations, setOperations] = useState<TournamentOperationsData | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState('');
  
  // Reportes y Eliminación
  const [reportData, setReportData] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });

  useEffect(() => {
    if (demoMode) {
      const saved = window.localStorage.getItem('sportscore:private-demo:v3');
      const demo = saved ? JSON.parse(saved) : null;
      const tournament = demo?.tournament || { name: 'Torneo Demostrativo', sport: 'Fútbol', category: 'Categoría Única' };
      setClientInfo({ id: 'demo-client', name: 'INSTITUCIÓN DEMOSTRATIVA', logo_url: '' });
      setTournaments([{ id: 'demo-tournament', name: tournament.name, is_active: true, created_at: new Date().toISOString(), tournament_format: tournament.format }]);
      setCategories([{ id: 'demo-category', name: tournament.category, tournament_id: 'demo-tournament', sports: { name: tournament.sport } }]);
      setSelectedTournamentId('demo-tournament');
      return;
    }
    if (slug) {
      fetchClientData();
    }
  }, [demoMode, slug]);

  useEffect(() => {
    if (demoMode) return;
    if (clientInfo?.id) {
      fetchTournaments();
    }
  }, [clientInfo, demoMode]);

  useEffect(() => {
    if (!selectedTournamentId || !slug) {
      setOperations(null);
      return;
    }
    let cancelled = false;
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    setOperationsLoading(true);
    setOperationsError('');
    const load = async () => {
      try {
        const result = isDemo
          ? { success: true as const, data: getDemoTournamentOperations(selectedTournamentId, localDate, slug) }
          : await getTournamentOperations(slug, selectedTournamentId, localDate);
        if (cancelled) return;
        if (!result.success) {
          setOperationsError(result.error);
          setOperations(null);
        } else setOperations(result.data);
      } catch {
        if (!cancelled) setOperationsError('Ocurrió un error al consultar el estado operativo.');
      } finally {
        if (!cancelled) setOperationsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isDemo, selectedTournamentId, slug]);

  async function fetchClientData() {
    const { data } = await supabase.from('clients').select('id, name, logo_url').eq('slug', slug).single();
    if (data) setClientInfo(data);
  }

  async function fetchTournaments() {
    if (!clientInfo?.id) return;
    const [{ data: tournamentData }, { data: categoryData }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('client_id', clientInfo.id).order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name, tournament_id, sports(name), tournaments!inner(client_id)').eq('tournaments.client_id', clientInfo.id),
    ]);

    if (tournamentData) {
      setTournaments(tournamentData);
      const urlTournament = searchParams.get('tournament');
      const storedTournament = window.localStorage.getItem(`sportscore:admin-tournament:${slug}`);
      const nextTournamentId = urlTournament && tournamentData.some((tournament: any) => tournament.id === urlTournament)
        ? urlTournament
        : storedTournament && tournamentData.some((tournament: any) => tournament.id === storedTournament)
          ? storedTournament
          : tournamentData.find((tournament: any) => tournament.is_active)?.id || tournamentData[0]?.id || '';
      setSelectedTournamentId((current) => current || nextTournamentId);
    }
    if (categoryData) setCategories(categoryData);
  }

  const handleLogout = async () => {
    if (isDemo) { window.location.href = '/demo-7c9f3a-sportscore'; return; }
    await logoutClientAccess(slug);
    window.location.href = '/';
  };

  const handleCopyLink = () => {
    const url = isDemo ? `${window.location.origin}/${DEMO_SLUG}/resultados` : `${window.location.origin}/${slug}/resultados${selectedTournamentId ? `?tournament=${selectedTournamentId}` : ''}`;
    navigator.clipboard.writeText(url);
    toast.success('¡Enlace copiado al portapapeles!');
  };

  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId);
  const selectedTournamentCategories = categories.filter((category) => category.tournament_id === selectedTournamentId);
  const primaryCategoryId = selectedTournamentCategories[0]?.id || '';
  const tournamentQuery = selectedTournamentId ? `tournament=${selectedTournamentId}` : '';
  const categoryQuery = selectedTournamentId
    ? `${primaryCategoryId ? `cat=${primaryCategoryId}&` : ''}tournament=${selectedTournamentId}`
    : '';

  const requireTournament = (callback: () => void) => {
    if (!selectedTournamentId) {
      toast.error('Selecciona un torneo antes de entrar al centro de operaciones.');
      return;
    }
    callback();
  };

  const handleTournamentChange = (tournamentId: string) => {
    setSelectedTournamentId(tournamentId);
    if (tournamentId) window.localStorage.setItem(`sportscore:admin-tournament:${slug}`, tournamentId);
    else window.localStorage.removeItem(`sportscore:admin-tournament:${slug}`);
    const base = isDemo ? `${activeDemoBasePath}/admin` : `/${slug}/admin`;
    router.replace(tournamentId ? `${base}?tournament=${tournamentId}` : base, { scroll: false });
  };

  const goToTournamentModule = (path: string) => {
    requireTournament(() => router.push(isDemo ? `${activeDemoBasePath}/admin/${path}${tournamentQuery ? `?${tournamentQuery}` : ''}` : `/${slug}/admin/${path}${tournamentQuery ? `?${tournamentQuery}` : ''}`));
  };

  const goToCategoryModule = (path: string) => {
    requireTournament(() => {
      if (!primaryCategoryId) {
        toast.error('El torneo seleccionado no tiene categorías configuradas.');
        return;
      }
      router.push(isDemo ? `${activeDemoBasePath}/admin/${path}?${categoryQuery}` : `/${slug}/admin/${path}?${categoryQuery}`);
    });
  };

  const initiateDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setShowDeleteConfirm({ isOpen: true, id, name });
  };

  const executeDeleteTournament = async () => {
    if (!showDeleteConfirm.id) return;
    if (isDemo) {
      const db = loadDemoDatabase();
      const categoryIds = db.categories.filter((category) => category.tournament_id === showDeleteConfirm.id).map((category) => category.id);
      const teamIds = db.teams.filter((team) => categoryIds.includes(team.category_id)).map((team) => team.id);
      const matchdayIds = db.matchdays.filter((day) => categoryIds.includes(day.category_id)).map((day) => day.id);
      db.tournaments = db.tournaments.filter((tournament) => tournament.id !== showDeleteConfirm.id);
      db.categories = db.categories.filter((category) => !categoryIds.includes(category.id)); db.teams = db.teams.filter((team) => !teamIds.includes(team.id)); db.players = db.players.filter((player) => !teamIds.includes(player.team_id)); db.matchdays = db.matchdays.filter((day) => !matchdayIds.includes(day.id)); db.matches = db.matches.filter((match) => !matchdayIds.includes(match.matchday_id));
      saveDemoDatabase(db); toast.success('Torneo demo eliminado'); window.location.reload();
      return;
    }
    const toastId = toast.loading('Eliminando torneo...');
    const result = await deleteTournament(slug, showDeleteConfirm.id);
    
    if (!result.success) {
      toast.error(result.error || 'No se pudo eliminar el torneo.', { id: toastId });
    } else {
      toast.success('Torneo eliminado', { id: toastId });
      setShowDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchTournaments();
    }
  };

  const generateTournamentReport = async (e: React.MouseEvent, tournament: any) => {
    e.stopPropagation();
    if (isDemo) { toast.success('Reporte demo disponible desde Resultados'); router.push(`/${DEMO_SLUG}/resultados`); return; }
    setIsGeneratingReport(true);
    const toastId = toast.loading(`Recopilando datos de ${tournament.name}...`);

    try {
      const { data: categories } = await supabase
        .from('categories')
        .select('*, sports(name, scoring_system)')
        .eq('tournament_id', tournament.id);

      if (!categories || categories.length === 0) {
        toast.error('El torneo no tiene categorías registradas para hacer un reporte.', { id: toastId });
        setIsGeneratingReport(false);
        return;
      }

      const reportCategories = [];

      for (const cat of categories) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*, schools(name)')
          .eq('category_id', cat.id);

        const { data: matchesData } = await supabase
          .from('matches')
          .select(`
            home_score, away_score, home_sets, away_sets, status,
            home_team:teams!home_team_id(id, name),
            away_team:teams!away_team_id(id, name),
            matchdays!inner(category_id, round_number)
          `)
          .eq('matchdays.category_id', cat.id)
          .eq('status', 'FINISHED')
          .order('matchdays(round_number)', { ascending: true });
        
        let sortedTeams: any[] = [];
        if (teamsData) {
          const sportRules = getSportRules(cat.sports?.name);
          const teamStats: Record<string, any> = {};

          teamsData.forEach((team: any) => {
            teamStats[team.id] = { ...team, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0 };
          });

          (matchesData || []).forEach((match: any) => {
            const homeId = match.home_team?.id;
            const awayId = match.away_team?.id;
            if (!homeId || !awayId || !teamStats[homeId] || !teamStats[awayId]) return;

            teamStats[homeId].played += 1;
            teamStats[awayId].played += 1;

            const matchScore = getMatchScoreForStandings(match, sportRules);
            const homeScore = matchScore.home;
            const awayScore = matchScore.away;

            if (matchScore.countsForScoreColumns) {
              teamStats[homeId].goals_for += homeScore;
              teamStats[homeId].goals_against += awayScore;
              teamStats[awayId].goals_for += awayScore;
              teamStats[awayId].goals_against += homeScore;
            }

            const points = getResultPoints(homeScore, awayScore, sportRules);
            teamStats[homeId].points += points.home;
            teamStats[awayId].points += points.away;

            if (homeScore > awayScore) {
              teamStats[homeId].won += 1;
              teamStats[awayId].lost += 1;
            } else if (awayScore > homeScore) {
              teamStats[awayId].won += 1;
              teamStats[homeId].lost += 1;
            } else {
              teamStats[homeId].drawn += 1;
              teamStats[awayId].drawn += 1;
            }
          });

          sortedTeams = Object.values(teamStats).sort((a: any, b: any) => compareTeamsForStandings(a, b, sportRules));
        }

        const { data: playersData } = await supabase
          .from('players')
          .select(`id, name, shirt_number, teams!inner(id, name, category_id, schools(name))`)
          .eq('teams.category_id', cat.id);
        
        let topScorers: any[] = [];
        if (playersData) {
          const { data: scoringEvents } = await supabase
            .from('match_events')
            .select('player_id, event_type, matches!inner(status, matchdays!inner(category_id))')
            .eq('matches.matchdays.category_id', cat.id)
            .in('event_type', ['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3']);

          const scoringByPlayer: Record<string, number> = {};
          (scoringEvents || []).forEach((event: any) => {
            if (!event.player_id || !['LIVE', 'FINISHED'].includes(event.matches?.status)) return;
            if (!scoringByPlayer[event.player_id]) scoringByPlayer[event.player_id] = 0;
            if (event.event_type === 'GOAL' || event.event_type === 'BASKET_1') scoringByPlayer[event.player_id] += 1;
            else if (event.event_type === 'BASKET_2') scoringByPlayer[event.player_id] += 2;
            else if (event.event_type === 'BASKET_3') scoringByPlayer[event.player_id] += 3;
          });

          const scorers = playersData.map(player => {
            const totalScore = scoringByPlayer[player.id] || 0;
            return { ...player, totalScore };
          }).filter(p => p.totalScore > 0);
          topScorers = scorers.sort((a, b) => b.totalScore - a.totalScore).slice(0, 5); 
        }

        reportCategories.push({
          info: cat,
          standings: sortedTeams,
          scorers: topScorers,
          results: matchesData || []
        });
      }

      setReportData({
        tournament,
        date: new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        categories: reportCategories
      });

      toast.success('Reporte generado. Listo para imprimir.', { id: toastId });
      setShowReportModal(true);

      setTimeout(() => {
        window.print();
      }, 1000);

    } catch (error) {
      console.error(error);
      toast.error('Error al generar el reporte.', { id: toastId });
    }
    setIsGeneratingReport(false);
  };

  const moduleGroups = [
    { title: 'Preparación', subtitle: 'Base operativa del torneo', modules: [
      { name: 'Delegaciones', description: 'Equipos, nóminas y respaldos.', icon: School, tone: 'teal', action: () => goToTournamentModule('delegaciones') },
      { name: 'Central de Inscripción', description: 'Atletas y documentación.', icon: Users, tone: 'blue', action: () => goToCategoryModule('inscripcion') },
      { name: 'Portal de Delegados', description: 'Accesos y cierres de inscripción.', icon: UserCog, tone: 'cyan', action: () => goToTournamentModule('delegados') },
      { name: 'Fixture y Resultados', description: 'Calendarios, fases y jornadas.', icon: CalendarDays, tone: 'emerald', action: () => goToCategoryModule('grupos') },
    ] },
    { title: 'Competencia', subtitle: 'Operación de los partidos', modules: [
      { name: 'Mesa de Control', description: 'Operación táctil del encuentro.', icon: MonitorPlay, tone: 'violet', action: () => goToCategoryModule('mesa') },
      { name: 'Jueces y Planilleros', description: 'Accesos y asignaciones.', icon: UserCog, tone: 'slate', action: () => goToTournamentModule('planilleros') },
      { name: 'Planillas de Partido', description: 'Impresión por fase y jornada.', icon: ClipboardList, tone: 'amber', action: () => goToCategoryModule('planillas') },
      { name: 'TV / Pantalla', description: 'Transmisión de partidos en vivo.', icon: MonitorPlay, tone: 'sky', action: () => window.open('/tv', '_blank') },
    ] },
    { title: 'Resultados', subtitle: 'Lectura deportiva y cierres', modules: [
      { name: 'Estadísticas', description: 'Posiciones y líderes.', icon: BarChart3, tone: 'fuchsia', action: () => goToCategoryModule('estadisticas') },
      { name: 'Fase Final', description: 'Llaves y eliminatorias.', icon: GitMerge, tone: 'indigo', action: () => goToCategoryModule('fase-final') },
    ] },
    { title: 'Administración', subtitle: 'Disciplina y control financiero', modules: [
      { name: 'Tribunal Disciplinario', description: 'Sanciones y multas vigentes.', icon: Scale, tone: 'rose', action: () => goToTournamentModule('tribunal') },
    ] },
  ];

  const moduleTone: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600 border-teal-100', blue: 'bg-blue-50 text-blue-600 border-blue-100', cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100', emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100', violet: 'bg-violet-50 text-violet-600 border-violet-100', slate: 'bg-slate-100 text-slate-700 border-slate-200', amber: 'bg-amber-50 text-amber-600 border-amber-100', sky: 'bg-sky-50 text-sky-600 border-sky-100', fuchsia: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100', indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100', rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white print:p-0 relative">
      
      {/* MODAL DE ELIMINACIÓN */}
      {showDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600"></div>
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <Trash2 size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Torneo?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">Peligro: Esto destruirá todos los datos, partidos y estadísticas de "{showDeleteConfirm.name}".</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowDeleteConfirm({ isOpen: false, id: null, name: '' })} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm">Cancelar</button>
              <button onClick={executeDeleteTournament} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200">Destruir</button>
            </div>
          </div>
        </div>
      )}

      {/* ESTILOS DE IMPRESIÓN */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print, .no-print * { display: none !important; }
          .print-break-inside-avoid { break-inside: avoid; }
          .print-break-before { break-before: page; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}} />

      {/* VISTA DEL REPORTE */}
      {showReportModal && reportData && (
        <div className="fixed inset-0 z-[9999] bg-white overflow-y-auto print:relative print:block print:z-auto print:overflow-visible print:bg-transparent">
          <div className="no-print sticky top-0 bg-slate-900 text-white p-4 flex items-center justify-between shadow-xl z-50">
            <div className="flex items-center gap-3">
              <FileText className="text-blue-400" />
              <h2 className="font-black uppercase tracking-widest text-sm">Vista Previa del Reporte</h2>
            </div>
            <div className="flex gap-4">
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-colors shadow-lg shadow-blue-500/20">
                <Download size={14} /> Guardar PDF
              </button>
              <button onClick={() => setShowReportModal(false)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-colors">
                <X size={14} /> Cerrar
              </button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto p-12 print:max-w-full print:p-0 print:m-0 bg-white">
            <div className="text-center mb-16 border-b-4 border-slate-900 pb-8">
              <div className="w-24 h-24 mx-auto mb-6 bg-slate-100 rounded-full flex items-center justify-center border-2 border-slate-300 overflow-hidden p-2">
                {reportData.tournament?.logo_url ? <img src={reportData.tournament.logo_url} className="w-full h-full object-contain" /> : <Trophy size={40} className="text-slate-400" />}
              </div>
              <h1 className="text-sm font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Reporte Estadístico Oficial</h1>
              <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-6">{reportData.tournament.name}</h2>
              <p className="text-slate-500 font-medium">Generado el: {reportData.date}</p>
            </div>

            {reportData.categories.map((catData: any, index: number) => {
              const isBasketball = catData.info.sports?.name?.toUpperCase().includes('BALONCESTO');
              const isVolleyball = catData.info.sports?.name?.toUpperCase().includes('VOLEIBOL');
              const colFor = isBasketball ? 'PF' : (isVolleyball ? 'SF' : 'GF');
              const colAgainst = isBasketball ? 'PC' : (isVolleyball ? 'SC' : 'GC');

              return (
                <div key={index} className="mb-16 print-break-inside-avoid">
                  <div className="bg-slate-100 p-6 rounded-2xl mb-8 border border-slate-200 flex items-center gap-4">
                    <div className="bg-slate-900 text-white p-3 rounded-xl"><Activity size={24} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{catData.info.sports?.name}</h3>
                      <p className="text-slate-600 font-bold text-xs uppercase tracking-widest">{catData.info.name} - {catData.info.gender}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-8">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">Clasificación General</h4>
                        {catData.standings.length === 0 ? (
                          <p className="text-slate-500 text-xs italic">No hay equipos registrados.</p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 uppercase">
                                <th className="p-3 border border-slate-200">#</th>
                                <th className="p-3 border border-slate-200">Equipo</th>
                                <th className="p-3 border border-slate-200 text-center">PJ</th>
                                <th className="p-3 border border-slate-200 text-center">PG</th>
                                <th className="p-3 border border-slate-200 text-center">PP</th>
                                <th className="p-3 border border-slate-200 text-center">{colFor}</th>
                                <th className="p-3 border border-slate-200 text-center">{colAgainst}</th>
                                <th className="p-3 border border-slate-200 text-center font-black">PTS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catData.standings.map((team: any, i: number) => (
                                <tr key={team.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  <td className="p-3 border border-slate-200 font-black text-center">{i + 1}</td>
                                  <td className="p-3 border border-slate-200 font-bold uppercase">{team.name}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.played || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.won || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.lost || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.goals_for || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.goals_against || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center font-black">{team.points || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {!isVolleyball && (
                        <div>
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">Líderes de Anotación (Top 5)</h4>
                          {catData.scorers.length === 0 ? (
                            <p className="text-slate-500 text-xs italic">No hay registros de anotación.</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              {catData.scorers.map((scorer: any, i: number) => (
                                <div key={scorer.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                  <div className="flex flex-col">
                                    <span className="font-black text-slate-800 text-xs uppercase truncate max-w-[150px]">{i + 1}. {scorer.name}</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{scorer.teams?.name}</span>
                                  </div>
                                  <span className="font-black text-lg text-slate-900">{scorer.totalScore}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-1">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">Historial de Partidos</h4>
                      {catData.results.length === 0 ? (
                        <p className="text-slate-500 text-xs italic">Aún no hay partidos finalizados.</p>
                      ) : (
                        <div className="space-y-3">
                          {catData.results.map((match: any, i: number) => (
                            <div key={i} className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs">
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">
                                {match.matchdays?.round_number === 100 || match.matchdays?.round_number >= 201 ? 'FASE 3 · FINALES' : match.matchdays?.round_number >= 101 ? `FASE 2 · FECHA ${match.matchdays.round_number - 100}` : `FASE 1 · FECHA ${match.matchdays?.round_number}`}
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="font-bold text-slate-700 uppercase truncate flex-1 text-right">{match.home_team?.name}</span>
                                <span className="font-black bg-slate-800 text-white px-2 py-1 rounded shadow-inner whitespace-nowrap">
                                  {match.home_score} - {match.away_score}
                                </span>
                                <span className="font-bold text-slate-700 uppercase truncate flex-1 text-left">{match.away_team?.name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* VISTA ESTÁNDAR DEL BÚNKER */}
      <div className={`max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 no-print ${showReportModal ? 'hidden' : 'block'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 sm:mb-8 gap-5 sm:gap-8 bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
          <div className="flex items-center gap-4 sm:gap-6 relative z-10 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white border border-slate-200 rounded-2xl sm:rounded-[2rem] p-2 sm:p-3 shadow-md flex items-center justify-center overflow-hidden shrink-0">
               {clientInfo?.logo_url ? <img src={clientInfo.logo_url} className="w-full h-full object-contain" /> : <LayoutDashboard size={32} className="text-blue-600"/>}
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none break-words">
                Panel <span className="text-blue-600">{clientInfo?.name || 'Admin'}</span>
              </h1>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.3em] mt-2">Gestor de Torneos Central</p>
            </div>
          </div>
          <button onClick={handleLogout} className="relative z-10 w-full sm:w-auto px-6 sm:px-8 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-sm">
            <LogOut size={18} /> Salir del Sistema
          </button>
        </div>

        {/* BANNER DE PORTAL PÚBLICO */}
        <div className="mb-8 sm:mb-12 bg-blue-600 text-white rounded-[1.5rem] sm:rounded-[2rem] p-5 sm:p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 sm:gap-6 shadow-lg shadow-blue-600/20 no-print">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
              <MonitorPlay size={24} /> Portal Público de Resultados
            </h2>
            <p className="text-blue-100 font-medium text-sm mt-1">Este es el enlace que debes compartir con padres, atletas y entrenadores.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button onClick={handleCopyLink} className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2">
              <Copy size={16} /> Copiar Enlace
            </button>
            <button onClick={() => window.open(`/${slug}/resultados${selectedTournamentId ? `?tournament=${selectedTournamentId}` : ''}`, '_blank')} className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
              Ver Portal <ExternalLink size={16} />
            </button>
          </div>
        </div>

        <div className="mb-8 bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-6 md:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.25em] mb-2">Filtro operativo</p>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter text-slate-900">Selecciona el torneo</h2>
              <p className="text-slate-500 text-sm font-bold mt-1">El centro de operaciones trabajará solo con la información del torneo activo.</p>
            </div>
            <AppSelect
              value={selectedTournamentId}
              onChange={handleTournamentChange}
              placeholder="Elegir torneo"
              className="w-full lg:w-[360px]"
              options={[
                { value: '', label: 'Elegir torneo' },
                ...tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name })),
              ]}
            />
          </div>
          {selectedTournament && (
            <div className="mt-5 flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-lg">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-white border border-white/20 p-2 flex items-center justify-center shrink-0">
                  {selectedTournament.logo_url ? <img src={selectedTournament.logo_url} className="w-full h-full object-contain" /> : <Trophy size={22} className="text-blue-600" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-black uppercase text-white truncate">{selectedTournament.name}</p><span className={`rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${selectedTournament.is_active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>{selectedTournament.is_active ? 'En curso' : 'Finalizado'}</span></div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">{clientInfo?.name} · {selectedTournamentCategories.length} categorías</p>
                </div>
              </div>
              <button
                onClick={() => router.push(isDemo ? `${activeDemoBasePath}/admin/torneo/${selectedTournament.id}` : `/${slug}/admin/torneo/${selectedTournament.id}`)}
                className="bg-white/10 text-white border border-white/15 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-950 transition-colors"
              >
                Configurar torneo
              </button>
            </div>
          )}
        </div>

        <div className={`mb-16 ${selectedTournamentId ? '' : 'opacity-50'}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-1 bg-blue-600 rounded-full"></div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-widest">Centro de Operaciones</h2>
            </div>
            {!selectedTournamentId && (
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Selecciona un torneo para habilitar los módulos</p>
            )}
          </div>
          {selectedTournamentId && <OperationsDashboard data={operations} loading={operationsLoading} error={operationsError} navigate={(href) => router.push(href.startsWith('./mesa') ? `${isDemo ? activeDemoBasePath : `/${slug}`}/admin/mesa${href.includes('?') ? href.slice(href.indexOf('?')) : ''}&tournament=${selectedTournamentId}` : href)} />}
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {moduleGroups.map((group) => (
              <section key={group.title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-blue-600">{group.subtitle}</p><h3 className="text-lg font-black uppercase tracking-tight text-slate-950">{group.title}</h3></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-black text-slate-500">{group.modules.length}</span></div>
                <div className="grid gap-2 sm:grid-cols-2">{group.modules.map(({ name, description, icon: Icon, tone, action }) => <button key={name} type="button" onClick={action} disabled={!selectedTournamentId} className="group flex min-h-24 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 text-left transition hover:border-blue-200 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:pointer-events-none disabled:opacity-45"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${moduleTone[tone]}`}><Icon size={20} /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-black uppercase leading-tight text-slate-900">{name}</span><span className="mt-1 block text-[10px] font-semibold leading-snug text-slate-500">{description}</span></span><ArrowRight size={15} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" /></button>)}</div>
              </section>
            ))}
          </div>
          <div className="hidden" aria-hidden="true">
            <button onClick={() => goToTournamentModule('tribunal')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-red-200 rounded-[2rem] lg:rounded-[3rem] hover:border-red-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-[100%] z-0 pointer-events-none"></div>
              <div className="p-4 bg-red-50 rounded-2xl text-red-600 mb-6 group-hover:scale-110 transition-transform border border-red-100 relative z-10"><Scale size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3 relative z-10">Tribunal Disciplinario</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8 relative z-10">Control financiero y sanciones. Gestiona multas por tarjetas amarillas o rojas y bloquea jugadores morosos.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-red-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50 relative z-10">Gestionar Multas <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToCategoryModule('inscripcion')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 mb-6 group-hover:scale-110 transition-transform border border-blue-100"><Users size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Central de Inscripción</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Administra la base de datos de atletas.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-blue-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Gestionar Nóminas <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToTournamentModule('delegados')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-cyan-50 rounded-2xl text-cyan-600 mb-6 group-hover:scale-110 transition-transform border border-cyan-100"><UserCog size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Portal de Delegados</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Crea usuarios por equipo, asigna accesos y controla el cierre de inscripciones.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-cyan-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Gestionar Accesos <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToTournamentModule('planilleros')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-slate-100 rounded-2xl text-slate-800 mb-6 group-hover:scale-110 transition-transform border border-slate-200"><UserCog size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Jueces y Planilleros</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Crea accesos limitados por partido para operar mesa y pantalla TV sin entrar al admin.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-slate-700 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Gestionar Mesa <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToTournamentModule('delegaciones')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-teal-50 rounded-2xl text-teal-600 mb-6 group-hover:scale-110 transition-transform border border-teal-100"><School size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Delegaciones</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Consulta las delegaciones inscritas por torneo, equipos y nóminas oficiales.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-teal-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Ver Delegaciones <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToCategoryModule('grupos')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600 mb-6 group-hover:scale-110 transition-transform border border-emerald-100"><CalendarDays size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Fixture y Resultados</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Generador automático de calendarios.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-emerald-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Ver Calendarios <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToCategoryModule('mesa')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-purple-50 rounded-2xl text-purple-600 mb-6 group-hover:scale-110 transition-transform border border-purple-100"><MonitorPlay size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Mesa de Control</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Interfaz táctil para árbitros.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-purple-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Abrir Marcador En Vivo <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToCategoryModule('planillas')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-amber-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-amber-50 rounded-2xl text-amber-600 mb-6 group-hover:scale-110 transition-transform border border-amber-100"><FileText size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Planillas de Partido</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Genera planillas individuales o descarga todas las planillas organizadas por fase y jornada.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-amber-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Preparar Impresión <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => window.open('/tv', '_blank')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-sky-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-sky-50 rounded-2xl text-sky-600 mb-6 group-hover:scale-110 transition-transform border border-sky-100"><MonitorPlay size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">TV / Pantalla</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Proyecta los partidos que estén en vivo para público o pantallas externas.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-sky-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Abrir Transmisión <ExternalLink size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToCategoryModule('estadisticas')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-fuchsia-50 rounded-2xl text-fuchsia-600 mb-6 group-hover:scale-110 transition-transform border border-fuchsia-100"><BarChart3 size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Estadísticas</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Tablas de posiciones automatizadas y ranking público.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-fuchsia-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Ver Estadísticas <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => goToCategoryModule('fase-final')} className="group flex flex-col items-start p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 mb-6 group-hover:scale-110 transition-transform border border-indigo-100"><GitMerge size={32} /></div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Fase Final (Llaves)</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Visualización dinámica de la ramificación del torneo.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Cuadro de Eliminatorias <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-8 print:mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-1 bg-blue-600 rounded-full print:hidden"></div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-widest print:text-3xl print:text-blue-700">Eventos Registrados</h2>
          </div>
          <button 
            onClick={() => router.push(isDemo ? `${activeDemoBasePath}/admin/crear-torneo` : `/${slug}/admin/crear-torneo`)}
            disabled={isGeneratingReport}
            className="no-print flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl hover:bg-blue-600 transition-all text-xs font-black uppercase tracking-widest shadow-md shadow-slate-200 disabled:opacity-50"
          >
            <Plus size={18} /> Estructurar Nuevo Evento
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:grid-cols-1 print:gap-4">
          {tournaments.map(t => (
            <div key={t.id} onClick={() => { if (!isGeneratingReport) router.push(isDemo ? `${activeDemoBasePath}/admin/torneo/${t.id}` : `/${slug}/admin/torneo/${t.id}`); }} className="print-break-inside-avoid group flex flex-col p-6 sm:p-8 lg:p-10 bg-white border border-slate-200 rounded-[2rem] lg:rounded-[3rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden cursor-pointer print:rounded-xl print:shadow-none print:border-2 print:p-6">
              <div className={`absolute top-0 left-0 w-full h-2 ${t.is_active ? 'bg-emerald-500' : 'bg-slate-300'} print:h-1`}></div>
              <div className="no-print absolute top-6 right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={(e) => { e.stopPropagation(); router.push(isDemo ? `${activeDemoBasePath}/admin/crear-torneo?edit=${t.id}` : `/${slug}/admin/crear-torneo?edit=${t.id}`); }} disabled={isGeneratingReport} className="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-50" title="Editar Torneo"><Pencil size={18} /></button>
                 <button onClick={(e) => generateTournamentReport(e, t)} disabled={isGeneratingReport} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-50" title="Descargar Reporte PDF"><FileText size={18} /></button>
                 <button onClick={(e) => initiateDelete(e, t.id, t.name)} disabled={isGeneratingReport} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50" title="Eliminar Torneo"><Trash2 size={18} /></button>
              </div>
              <div className="flex justify-between items-start mb-4 pr-0 sm:pr-32 print:pr-0">
                <div className="flex flex-col">
                  {t.logo_url && <img src={t.logo_url} alt="Torneo" className="h-10 w-auto object-contain mb-3" />}
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter break-words">{t.name}</h3>
                </div>
              </div>
              <div className="mb-4">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm inline-block ${t.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'} print:shadow-none print:border-none`}>
                  {t.is_active ? '● Torneo Activo' : 'Torneo Finalizado'}
                </span>
                <p className="hidden print:block text-slate-500 text-xs mt-2 font-medium">Identificador: {t.id} <br/>Creado: {new Date(t.created_at).toLocaleDateString('es-ES')}</p>
              </div>
              <div className="no-print flex items-center justify-between w-full mt-8 pt-6 border-t border-slate-50">
                <div className="flex items-center gap-2 text-slate-400">
                  <Settings size={14} /><span className="text-[10px] font-bold uppercase tracking-widest">Configuración de Evento</span>
                </div>
                <div className="flex items-center text-xs font-black text-blue-600 uppercase tracking-widest group-hover:underline">
                  Abrir Panel <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
          {tournaments.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-300 rounded-[3rem] bg-white print:border-none">
               <p className="text-slate-400 font-black uppercase tracking-widest text-sm">No tienes eventos creados</p>
               <p className="text-slate-400 font-medium text-xs mt-2 no-print">Haz clic en "Estructurar Nuevo Evento" para comenzar.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
