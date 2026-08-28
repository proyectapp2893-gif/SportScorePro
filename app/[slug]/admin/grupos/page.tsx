'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { supabase } from '../../../supabase';
import { ArrowLeft, ArrowRight, Calendar, Trophy, Clock, Trash2, School, CalendarDays, AlertTriangle, GitMerge, AlertCircle, X, Pencil, Save, ShieldCheck, Download, UploadCloud, TableProperties, Eraser, Database, Plus, Users, Wand2, MapPin, House, Eye, EyeOff, FileDown } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';
import { createCategoryFixture, deleteCategoryFixture, randomizeCategoryGroups, reorganizeCategoryFixtureTimes, updateFixtureMatch, updateTeamGroup, updateTournamentFixtureVisibility, updateTournamentPublicFixtureVisibility } from './actions';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '../../../lib/sports/rules';
import AppSelect from '@/app/components/AppSelect';
import { advanceThreeStageTournament, getThreeStageStatus, startThreeStageTournament } from './stage-actions';
import { findTeamsMissingFromEveryRegularRound, generateBalancedRoundRobin, inferMissingTeamByes } from '@/app/lib/tournaments/byes';
import AppPortal from '@/app/components/AppPortal';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import { createDemoFixture, deleteDemoFixture, randomizeDemoGroups, scheduleDemoFixture, setDemoFixtureVisibility, setDemoPublicFixtureVisibility, updateDemoMatch, updateDemoTeamGroup } from '@/app/lib/demo/actions';
import { analyzeFixture } from '@/app/lib/fixture/intelligence';

type ParsedFixtureMatch = {
  round_number: number;
  home_team_id: string;
  away_team_id: string | null;
  scheduled_time?: string | null;
  venue?: string | null;
  status: string;
};

function formatTime12Hour(value?: string | null) {
  if (!value) return '--:--';
  const [rawHour, rawMinute = '00'] = String(value).split(':');
  const hour = Number(rawHour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return String(value).slice(0, 5);
  const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${rawMinute.padStart(2, '0')} ${suffix}`;
}

function FixtureContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string; 
  const isDemo = slug === DEMO_SLUG;
  const urlCategory = searchParams.get('cat'); 

  const [categories, setCategories] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reorganizing, setReorganizing] = useState(false);
  const [fixturePdfPreview, setFixturePdfPreview] = useState<{ url: string; filename: string } | null>(null);

  const [activeRound, setActiveRound] = useState<number>(1);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);

  const [viewMode, setViewMode] = useState<'FIXTURE' | 'GROUPS'>('FIXTURE');
  const [randomGroupCount, setRandomGroupCount] = useState(2);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlayoffConfirm, setShowPlayoffConfirm] = useState(false);
  const [showFirstByeModal, setShowFirstByeModal] = useState(false);
  const [firstByeByGroup, setFirstByeByGroup] = useState<Record<string, string>>({});
  
  const [editingMatch, setEditingMatch] = useState<any>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editVenue, setEditVenue] = useState(''); // NUEVO: Estado para Cancha
  const [editHomeScore, setEditHomeScore] = useState<number | ''>('');
  const [editAwayScore, setEditAwayScore] = useState<number | ''>('');
  const [editStatus, setEditStatus] = useState('');

  const [showGridModal, setShowGridModal] = useState(false);
  const [gridData, setGridData] = useState<string[]>(Array(15).fill('')); 
  const [stageStatus, setStageStatus] = useState<any | null>(null);

  useEffect(() => {
    async function initializeHub() {
      if (!slug) return;
      const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
      if (client) {
        setClientId(client.id);
        const { data: catData } = await supabase
          .from('categories')
          .select('*, tournaments!inner(id, client_id, fixture_visible_to_delegates, fixture_visible_to_public), sports(name)')
          .eq('tournaments.client_id', client.id)
          .order('name');
        if (catData) setCategories(catData);
      }
    }
    initializeHub();
  }, [slug]);

  useEffect(() => () => {
    if (fixturePdfPreview?.url) URL.revokeObjectURL(fixturePdfPreview.url);
  }, [fixturePdfPreview?.url]);

  useEffect(() => {
    if (urlCategory && categories.length > 0) {
      const cat = categories.find(c => c.id === urlCategory);
      if (cat) {
        setSelectedCategory(urlCategory);
        setSelectedSport(cat.sports?.name);
      }
    }
  }, [urlCategory, categories]);

  useEffect(() => {
    if (selectedCategory) {
      loadCategoryData();
      loadStageStatus(selectedCategory);
    } else {
      setTeams([]);
      setMatches([]);
      setAvailableRounds([]);
      setViewMode('FIXTURE'); 
    }
  }, [selectedCategory]);

  const loadStageStatus = async (categoryId: string) => {
    const result = await getThreeStageStatus(slug, categoryId);
    setStageStatus(result.success ? result.data : null);
  };

  const runStageAction = async (action: Promise<any>, successMessage: string) => {
    setLoading(true);
    const result = await action;
    if (!result.success) toast.error(result.error); else { toast.success(successMessage); if (selectedCategory) { await loadStageStatus(selectedCategory); await loadCategoryData(); } }
    setLoading(false);
  };

  async function loadCategoryData() {
    setLoading(true);
    const { data: teamsData } = await supabase.from('teams').select('*').eq('category_id', selectedCategory).order('name');

    const { data: matchesData } = await supabase.from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time, venue, home_team_id, away_team_id,
        home_team:teams!home_team_id(id, name, schools(logo_url)), 
        away_team:teams!away_team_id(id, name, schools(logo_url)),
        matchdays!inner(id, category_id, round_number, scheduled_date)
      `)
      .eq('matchdays.category_id', selectedCategory)
      .order('scheduled_time', { ascending: true });
    
    if (matchesData) {
      setMatches(matchesData);
      const rounds = Array.from(new Set(matchesData.map((m: any) => m.matchdays.round_number))).sort((a: any, b: any) => a - b);
      setAvailableRounds(rounds as number[]);
      if (rounds.length > 0 && !(rounds as number[]).includes(activeRound)) {
        setActiveRound(rounds[0] as number);
      }
    }

    if (teamsData) {
      const sportRules = getSportRules(selectedSport);
      const teamStats: Record<string, any> = {};

      teamsData.forEach((team: any) => {
        teamStats[team.id] = { ...team, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0 };
      });

      (matchesData || []).filter((match: any) => match.status === 'FINISHED').forEach((match: any) => {
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

      setTeams(Object.values(teamStats).sort((a: any, b: any) => compareTeamsForStandings(a, b, sportRules)));
    } else {
      setTeams([]);
    }
    setLoading(false);
  }

  const handleUpdateTeamGroup = async (teamId: string, newGroup: string) => {
    const toastId = toast.loading('Asignando grupo...');
    const result = isDemo ? updateDemoTeamGroup(teamId, newGroup) : await updateTeamGroup(slug, teamId, newGroup);
    
    if (result.success) {
      setTeams(teams.map(t => t.id === teamId ? { ...t, group_name: newGroup } : t));
      toast.success(`Asignado al Grupo ${newGroup}`, { id: toastId });
    } else {
      toast.error(result.error || 'Error al actualizar', { id: toastId });
    }
  };

  const handleRandomizeGroups = async () => {
    if (!selectedCategory) return toast.error('Selecciona una categoría primero.');
    if (teams.length < randomGroupCount) return toast.error(`Se necesitan al menos ${randomGroupCount} delegaciones.`);

    setLoading(true);
    const toastId = toast.loading('Distribuyendo grupos aleatoriamente...');

    const result = isDemo ? randomizeDemoGroups(selectedCategory, randomGroupCount) : await randomizeCategoryGroups(slug, selectedCategory, randomGroupCount);

    if (result.success) {
      const assignmentsMap = new Map(result.assignments.map((assignment) => [assignment.teamId, assignment.groupName]));
      setTeams(teams.map((team) => ({
        ...team,
        group_name: assignmentsMap.get(team.id) || team.group_name,
      })));
      toast.success(`Grupos aleatorios generados en ${randomGroupCount} bloques`, { id: toastId });
    } else {
      toast.error(result.error || 'No se pudieron distribuir los grupos.', { id: toastId });
    }

    setLoading(false);
  };

  const handleGridChange = (index: number, value: string) => {
    const newData = [...gridData];
    newData[index] = value;
    setGridData(newData);
  };

  const handleGridPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    
    const rows = pasteData.split(/\r?\n/).map(r => r.trim()).filter(r => r);
    if (rows.length === 0) return;

    let newData = [...gridData];
    
    while (rowIndex + rows.length > newData.length) {
      newData.push('');
    }

    for (let i = 0; i < rows.length; i++) {
      newData[rowIndex + i] = rows[i];
    }
    
    setGridData(newData);
    toast.success(`${rows.length} encuentros pegados correctamente`);
  };

  const addMoreRows = () => {
    setGridData([...gridData, ...Array(10).fill('')]);
  };

  const clearGrid = () => {
    setGridData(Array(15).fill(''));
  };

  const downloadTemplate = () => {
    const headers = ["N.", "HORA", "EQUIPO A", "VS", "EQUIPO B", "FECHA_JORNADA", "NRO_JORNADA", "CANCHA", "EQUIPO_DESCANSA"];
    const sampleData = [
      ["1", "08:00 a. m.", "SAN JOSÉ", "vs", "ALEMÁN", "2026-04-18", "1", "Cancha 1", "MARYMOUNT"],
      ["2", "09:00 a. m.", "ALTA MAR", "vs", "BERCKLEY", "2026-04-18", "1", "Coliseo", ""]
    ];

    const csvContent = [
      headers.join("\t"),
      ...sampleData.map(row => row.join("\t"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Plantilla_Copia_Pega.txt`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Plantilla descargada (Usa Tabuladores al separar en Excel)');
  };

  const processGridData = async () => {
    if (!clientId) return toast.error('Error de sesión. Recargue la página.');
    
    const validEntries = gridData.map(row => row.trim()).filter(row => row.length > 0);
    
    if (validEntries.length === 0) {
      return toast.error('La cuadrícula está vacía.');
    }

    setLoading(true);
    const toastId = toast.loading('Procesando fixture y descansos...');

    try {
      const parsedMatches: ParsedFixtureMatch[] = [];
      const matchdaysMap = new Map(); 

      for (let i = 0; i < validEntries.length; i++) {
        const row = validEntries[i].split(/[\t,]+/).map(item => item.replace(/^"|"$/g, '').trim());
        
        if (row.length < 7) {
            console.warn("Fila ignorada por formato incorrecto:", row);
            continue; 
        }

        const num = row[0];
        const horaStr = row[1]; 
        const equipoAName = row[2].toUpperCase();
        const equipoBName = row[4].toUpperCase();
        const fechaStr = row[5]; 
        const roundNum = Number(row[6]); 
        
        const canchaStr = row[7] ? row[7] : `Cancha ${i + 1}`;
        const descansaStr = row[8] ? row[8].toUpperCase() : null;

        const teamA = teams.find(t => t.name.toUpperCase() === equipoAName || t.name.toUpperCase().includes(equipoAName));
        const teamB = teams.find(t => t.name.toUpperCase() === equipoBName || t.name.toUpperCase().includes(equipoBName));

        if ((!teamA || !teamB) && roundNum < 100) {
          throw new Error(`Equipos no encontrados en la fila ${i+1}. Verifique los nombres: [${equipoAName}] o [${equipoBName}].`);
        }

        let formatTime = "00:00:00";
        try {
          const timeMatch = horaStr.match(/(\d+):(\d+)\s*([ap])/i);
          if (timeMatch) {
            let [_, h, m, meridiem] = timeMatch;
            let hour = parseInt(h);
            if (meridiem.toLowerCase() === 'p' && hour < 12) hour += 12;
            if (meridiem.toLowerCase() === 'a' && hour === 12) hour = 0;
            formatTime = `${hour.toString().padStart(2, '0')}:${m.padStart(2, '0')}:00`;
          }
        } catch(e) {}

        if (!matchdaysMap.has(roundNum)) {
           matchdaysMap.set(roundNum, fechaStr);
        }

        parsedMatches.push({
           round_number: roundNum,
           home_team_id: teamA?.id || null, 
           away_team_id: teamB?.id || null,
           scheduled_time: formatTime,
           venue: canchaStr,
           status: 'SCHEDULED',
        });

        if (descansaStr && descansaStr !== '') {
          const byeTeam = teams.find(t => t.name.toUpperCase() === descansaStr || t.name.toUpperCase().includes(descansaStr));
          if (byeTeam) {
            parsedMatches.push({
              round_number: roundNum,
              home_team_id: byeTeam.id,
              away_team_id: null,
              scheduled_time: null,
              venue: 'Descansa',
              status: 'BYE'
            });
          }
        }
      }

      if (parsedMatches.length === 0) throw new Error('No se detectaron encuentros válidos. Revisa el formato de copiado.');

      const finalMatches: ParsedFixtureMatch[] = [];
      const processedByes = new Set();

      for (const m of parsedMatches) {
        if (m.status === 'BYE') {
           const byeKey = `${m.round_number}-${m.home_team_id}`;
           if (!processedByes.has(byeKey)) {
             processedByes.add(byeKey);
             finalMatches.push(m);
           }
        } else {
           finalMatches.push(m);
        }
      }

      const roundsPayload = Array.from(matchdaysMap.entries()).map(([roundNum, fechaStr]) => ({
        roundNumber: Number(roundNum),
        scheduledDate: fechaStr || null,
        matches: finalMatches
          .filter(m => m.round_number === roundNum)
          .map(m => ({
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            scheduledTime: m.scheduled_time,
            venue: m.venue,
            status: m.status,
          })),
      }));

      const result = isDemo ? createDemoFixture(selectedCategory!, roundsPayload) : await createCategoryFixture(slug, selectedCategory!, roundsPayload);
      if (!result.success) throw new Error(result.error);

      toast.success(`¡Éxito! ${result.insertedMatches} partidos sincronizados.`, { id: toastId });
      setShowGridModal(false);
      clearGrid();
      loadCategoryData();

    } catch (error: any) {
      toast.error(error.message || 'Error al procesar la información.', { id: toastId });
    }
    setLoading(false);
  };

  const handleAutoGenerateFixture = async (selectedFirstByes?: Record<string, string>) => {
    if (teams.length < 2) return toast.error('Se necesitan al menos 2 delegaciones para generar un fixture.');

    const groupedTeams = teams.reduce((groups: Record<string, any[]>, team) => {
      const group = team.group_name || 'A';
      if (!groups[group]) groups[group] = [];
      groups[group].push(team);
      return groups;
    }, {});
    const oddGroups = Object.entries(groupedTeams).filter(([, groupTeams]) => groupTeams.length % 2 !== 0);
    if (oddGroups.length > 0 && !selectedFirstByes) {
      setFirstByeByGroup(Object.fromEntries(oddGroups.map(([group, groupTeams]) => [group, groupTeams[0]?.id || ''])));
      setShowFirstByeModal(true);
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Calculando cruces, canchas y descansos...');

    try {
      const globalRounds: any[][] = [];

      Object.entries(groupedTeams).forEach(([groupName, groupTeams]) => {
        const generatedRounds = generateBalancedRoundRobin(groupTeams, selectedFirstByes?.[groupName]);
        generatedRounds.forEach((pairs, round) => {
          if (!globalRounds[round]) globalRounds[round] = [];
          pairs.forEach(({ home: team1, away: team2 }) => {
            if (team1 !== null && team2 !== null) {
              globalRounds[round].push({
                home_team_id: team1.id,
                away_team_id: team2.id,
                status: 'SCHEDULED',
                venue: null
              });
            } else {
              const byeTeam = team1 !== null ? team1 : team2;
              globalRounds[round].push({
                home_team_id: byeTeam.id,
                away_team_id: null,
                status: 'BYE',
                venue: 'Descansa'
              });
            }
          });
        });
      });

      const roundsPayload = globalRounds.map((matchesToInsert, index) => ({
        roundNumber: index + 1,
        scheduledDate: null,
        matches: matchesToInsert.map(m => ({
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          venue: m.venue,
          status: m.status,
        })),
      })).filter(round => round.matches.length > 0);

      const result = isDemo ? createDemoFixture(selectedCategory!, roundsPayload) : await createCategoryFixture(slug, selectedCategory!, roundsPayload);
      if (!result.success) throw new Error(result.error);

      const scheduleResult = isDemo ? scheduleDemoFixture(selectedCategory!) : await reorganizeCategoryFixtureTimes(slug, selectedCategory!);
      if (!scheduleResult.success) throw new Error(`Los cruces fueron creados, pero no se pudieron programar: ${scheduleResult.error}`);

      toast.success(`Fixture creado y programado desde la fecha inicial`, { id: toastId });
      setShowFirstByeModal(false);
      loadCategoryData(); 

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error en la generación automática', { id: toastId });
    }

    setLoading(false);
  };

  const handleReorganizeTimes = async () => {
    if (!selectedCategory) return;
    setLoading(true);
    setReorganizing(true);
    const toastId = toast.loading('Organizando fechas y equilibrando horarios...');
    try {
    const result = isDemo ? scheduleDemoFixture(selectedCategory) : await reorganizeCategoryFixtureTimes(slug, selectedCategory);
      if (!result.success) toast.error(result.error || 'No se pudo reorganizar', { id: toastId });
      else {
        toast.success(`${result.updatedMatches} partidos reorganizados equitativamente.`, { id: toastId });
        await loadCategoryData();
      }
    } catch {
      toast.error('No se pudo completar la reorganización. Intenta nuevamente.', { id: toastId });
    } finally {
      setLoading(false);
      setReorganizing(false);
    }
  };

  const handleFixtureVisibility = async () => {
    if (!selectedCategory) return;
    const category = categories.find((item) => item.id === selectedCategory);
    const nextVisible = !Boolean(category?.tournaments?.fixture_visible_to_delegates);
    setLoading(true);
    const result = isDemo ? setDemoFixtureVisibility(selectedCategory, nextVisible) : await updateTournamentFixtureVisibility(slug, selectedCategory, nextVisible);
    setLoading(false);
    if (!result.success) return toast.error(result.error || 'No se pudo cambiar la visibilidad');
    setCategories((current) => current.map((item) => item.id === selectedCategory ? { ...item, tournaments: { ...item.tournaments, fixture_visible_to_delegates: nextVisible } } : item));
    toast.success(nextVisible ? 'Fixture publicado para los delegados' : 'Fixture ocultado para los delegados');
  };

  const handlePublicFixtureVisibility = async () => {
    if (!selectedCategory) return;
    const category = categories.find((item) => item.id === selectedCategory);
    const nextVisible = !Boolean(category?.tournaments?.fixture_visible_to_public);
    setLoading(true);
    const result = isDemo ? setDemoPublicFixtureVisibility(selectedCategory, nextVisible) : await updateTournamentPublicFixtureVisibility(slug, selectedCategory, nextVisible);
    setLoading(false);
    if (!result.success) return toast.error(result.error || 'No se pudo cambiar la publicación pública');
    setCategories((current) => current.map((item) => item.id === selectedCategory ? { ...item, tournaments: { ...item.tournaments, fixture_visible_to_public: nextVisible } } : item));
    toast.success(nextVisible ? 'Fixture publicado públicamente' : 'Publicación pública desactivada');
  };

  const handleExportFixturePdf = async () => {
    if (!selectedCategory || matches.length === 0) return toast.error('No hay partidos para exportar.');
    setLoading(true);
    const toastId = toast.loading('Generando fixture PDF...');
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const category = categories.find((item) => item.id === selectedCategory);
      const exportMatches = [...matches, ...inferMissingTeamByes(matches, teams)];
      const orderedMatches = exportMatches.sort((a: any, b: any) => Number(a.matchdays?.round_number || 0) - Number(b.matchdays?.round_number || 0) || (a.status === 'BYE' ? -1 : b.status === 'BYE' ? 1 : String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || ''))));
      const grouped = orderedMatches.reduce((acc: Map<number, any[]>, match: any) => {
        const round = Number(match.matchdays?.round_number || 0);
        if (!acc.has(round)) acc.set(round, []);
        acc.get(round)?.push(match);
        return acc;
      }, new Map<number, any[]>());
      let pageNumber = 1;
      let y = 0;

      const drawPageHeader = () => {
        pdf.setFillColor(7, 15, 36); pdf.rect(0, 0, 297, 27, 'F');
        pdf.setTextColor(96, 165, 250); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.text('SPORTSCORE PRO · FIXTURE OFICIAL', 12, 9);
        pdf.setTextColor(255, 255, 255); pdf.setFontSize(15); pdf.text(String(category?.name || 'CATEGORÍA').toUpperCase(), 12, 18);
        pdf.setFontSize(8); pdf.text(`${String(category?.sports?.name || '').toUpperCase()} · ${teams.length} DELEGACIONES`, 285, 18, { align: 'right' });
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(6); pdf.text(`PÁGINA ${pageNumber}`, 285, 204, { align: 'right' });
        y = 34;
      };
      const addPageIfNeeded = (requiredHeight: number) => {
        if (y + requiredHeight <= 198) return;
        pdf.addPage(); pageNumber += 1; drawPageHeader();
      };
      drawPageHeader();

      for (const [round, roundMatches] of grouped.entries()) {
        addPageIfNeeded(18);
        const labels = getRoundLabels(round);
        const scheduledDate = roundMatches.find((match: any) => match.matchdays?.scheduled_date)?.matchdays?.scheduled_date;
        pdf.setFillColor(219, 234, 254); pdf.roundedRect(12, y, 273, 10, 2, 2, 'F');
        pdf.setTextColor(29, 78, 216); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.text(`${labels.phase} · ${labels.round}`.toUpperCase(), 16, y + 6.5);
        pdf.setTextColor(71, 85, 105); pdf.text(scheduledDate ? new Date(`${scheduledDate}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase() : 'FECHA POR ASIGNAR', 281, y + 6.5, { align: 'right' });
        y += 13;
        pdf.setFillColor(241, 245, 249); pdf.rect(12, y, 273, 8, 'F');
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(6); pdf.text('HORA', 16, y + 5); pdf.text('CANCHA', 39, y + 5); pdf.text('LOCAL', 78, y + 5); pdf.text('VISITANTE', 170, y + 5); pdf.text('ESTADO', 269, y + 5, { align: 'center' });
        y += 8;
        for (const match of roundMatches) {
          addPageIfNeeded(11);
          const isBye = !match.away_team_id || match.status === 'BYE';
          if (isBye) {
            const restingTeam = match.home_team || match.away_team;
            pdf.setFillColor(255, 247, 237); pdf.roundedRect(12, y + 1, 273, 9, 1.5, 1.5, 'F');
            pdf.setTextColor(234, 88, 12); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
            pdf.text(`DESCANSA: ${String(restingTeam?.name || 'EQUIPO POR DEFINIR').toUpperCase()}`, 16, y + 6.8);
            pdf.setTextColor(154, 52, 18); pdf.text('JORNADA DE DESCANSO', 281, y + 6.8, { align: 'right' });
            y += 11;
            continue;
          }
          pdf.setDrawColor(226, 232, 240); pdf.line(12, y + 10, 285, y + 10);
          pdf.setTextColor(51, 65, 85); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
          pdf.text(formatTime12Hour(match.scheduled_time), 16, y + 6.5);
          pdf.text(String(match.venue || 'Por asignar').toUpperCase(), 39, y + 6.5);
          pdf.text(pdf.splitTextToSize(String(match.home_team?.name || 'POR DEFINIR').toUpperCase(), 78).slice(0, 1), 78, y + 6.5);
          pdf.text(pdf.splitTextToSize(String(match.away_team?.name || 'POR DEFINIR').toUpperCase(), 78).slice(0, 1), 170, y + 6.5);
          const status = match.status === 'FINISHED' ? 'FINALIZADO' : match.status === 'LIVE' ? 'EN VIVO' : 'PROGRAMADO';
          pdf.setTextColor(match.status === 'LIVE' ? 220 : 71, match.status === 'LIVE' ? 38 : 85, match.status === 'LIVE' ? 38 : 105); pdf.text(status, 269, y + 6.5, { align: 'center' });
          y += 11;
        }
        y += 5;
      }

      const filename = `Fixture_${String(category?.name || 'Torneo').replace(/[^a-z0-9]+/gi, '_')}.pdf`;
      setFixturePdfPreview({ url: URL.createObjectURL(pdf.output('blob')), filename });
      toast.success('Vista previa del fixture lista', { id: toastId });
    } catch {
      toast.error('No se pudo generar el fixture PDF.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const closeFixturePdfPreview = () => setFixturePdfPreview(null);
  const downloadFixturePdf = () => {
    if (!fixturePdfPreview) return;
    const link = document.createElement('a'); link.href = fixturePdfPreview.url; link.download = fixturePdfPreview.filename; document.body.appendChild(link); link.click(); link.remove();
    toast.success('Fixture PDF descargado');
  };


  const handlePlayoffClick = () => {
    if (availableRounds.includes(100)) return toast.error('El sistema detecta una Fase Final ya activa.');
    setShowPlayoffConfirm(true);
  };

  const executeGeneratePlayoffs = async () => {
    setShowPlayoffConfirm(false);
    setLoading(true);
    const toastId = toast.loading('Analizando posiciones para llaves finales...');

    const sortedTeams = [...teams].sort((a, b) => compareTeamsForStandings(a, b, getSportRules(selectedSport)));

    const activeSportName = selectedSport?.toUpperCase() || '';
    const isVolleyball = activeSportName.includes('VOLEIBOL');
    const isCuadrangular = sortedTeams.length === 4;
    const isPentagonal = sortedTeams.length === 5 && !isVolleyball;

    const newMatches = [];

    const groupA = sortedTeams.filter(t => t.group_name === 'A');
    const groupB = sortedTeams.filter(t => t.group_name === 'B');

    if (groupA.length > 0 && groupB.length > 0) {
        if (groupA.length >= 1 && groupB.length >= 2) {
            newMatches.push({ home_team_id: groupA[0].id, away_team_id: groupB[1].id, venue: 'Cancha Principal', status: 'SCHEDULED' });
        }
        if (groupB.length >= 1 && groupA.length >= 2) {
            newMatches.push({ home_team_id: groupB[0].id, away_team_id: groupA[1].id, venue: 'Cancha Auxiliar', status: 'SCHEDULED' });
        }
    } else if (isCuadrangular) {
      newMatches.push({ home_team_id: sortedTeams[0].id, away_team_id: sortedTeams[3].id, venue: 'Cancha 1', status: 'SCHEDULED' });
      newMatches.push({ home_team_id: sortedTeams[1].id, away_team_id: sortedTeams[2].id, venue: 'Cancha 2', status: 'SCHEDULED' });
    } else if (isPentagonal) {
      newMatches.push({ home_team_id: sortedTeams[0].id, away_team_id: sortedTeams[1].id, venue: 'Cancha 1', status: 'SCHEDULED' });
      newMatches.push({ home_team_id: sortedTeams[2].id, away_team_id: sortedTeams[3].id, venue: 'Cancha 2', status: 'SCHEDULED' });
    } else {
       if (sortedTeams.length >= 2) {
         newMatches.push({ home_team_id: sortedTeams[0].id, away_team_id: sortedTeams[1].id, venue: 'Cancha Principal', status: 'SCHEDULED' });
       }
    }

    if (newMatches.length > 0) {
      const result = isDemo ? createDemoFixture(selectedCategory!, [{
        roundNumber: 100,
        scheduledDate: null,
        matches: newMatches.map(m => ({
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          venue: m.venue,
          status: m.status,
        })),
      }]) : await createCategoryFixture(slug, selectedCategory!, [{
        roundNumber: 100,
        scheduledDate: null,
        matches: newMatches.map(m => ({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, venue: m.venue, status: m.status })),
      }]);
      if (!result.success) {
        setLoading(false);
        return toast.error(result.error || 'No se pudo crear la fase final', { id: toastId });
      }
      toast.success('Llaves de Fase Final sincronizadas', { id: toastId });
      loadCategoryData();
      setActiveRound(100); 
    } else {
      toast.error('Configuración de llaves no disponible para esta nómina', { id: toastId });
    }
    setLoading(false);
  };

  const handleDeleteClick = () => setShowDeleteConfirm(true);

  const confirmDeleteFixture = async () => {
    if (!selectedCategory) return;
    setShowDeleteConfirm(false);
    setLoading(true);
    const toastId = toast.loading('Removiendo fixture del sistema...');
    const result = isDemo ? deleteDemoFixture(selectedCategory) : await deleteCategoryFixture(slug, selectedCategory);
    
    if (!result.success) toast.error(result.error || 'No se pudo limpiar la base de datos', { id: toastId });
    else {
      toast.success('Fixture eliminado correctamente', { id: toastId });
      loadCategoryData();
    }
    setLoading(false);
  };

  const openEditModal = (match: any) => {
    setEditingMatch(match);
    setEditDate(match.matchdays?.scheduled_date || '');
    setEditTime(match.scheduled_time ? match.scheduled_time.substring(0, 5) : '');
    setEditVenue(match.venue || ''); 
    setEditHomeScore(match.home_score !== null ? match.home_score : '');
    setEditAwayScore(match.away_score !== null ? match.away_score : '');
    setEditStatus(match.status || 'SCHEDULED');
  };

  const handleUpdateMatch = async () => {
    if (!editingMatch) return;
    setLoading(true);
    const toastId = toast.loading('Sincronizando cambios manuales...');

    const isResettingToScheduled = editingMatch.status !== 'SCHEDULED' && editStatus === 'SCHEDULED';
    const updatePayload = {
      matchId: editingMatch.id,
      scheduledDate: editDate || null,
      scheduledTime: editTime || null,
      venue: editVenue || null,
      homeScore: editHomeScore !== '' ? Number(editHomeScore) : null,
      awayScore: editAwayScore !== '' ? Number(editAwayScore) : null,
      status: editStatus,
    };
    const result = isDemo ? updateDemoMatch(editingMatch.id, updatePayload) : await updateFixtureMatch(slug, updatePayload);

    if (isResettingToScheduled && result.success) {
      localStorage.removeItem(`timer_basket_${editingMatch.id}`);
      localStorage.removeItem(`timer_${editingMatch.id}`);
      setEditHomeScore('');
      setEditAwayScore('');
    }

    if (!result.success) {
      toast.error(result.error || 'Error al guardar en el servidor', { id: toastId });
    } else {
      toast.success(isResettingToScheduled ? 'Partido reseteado. Estadísticas revertidas.' : 'Información actualizada', { id: toastId });
      setEditingMatch(null);
      loadCategoryData(); 
    }
    setLoading(false);
  };

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol')) return <FaFutbol className="text-emerald-500" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-500" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-blue-500" size={size} />;
    if (name.includes('softball') || name.includes('béisbol')) return <FaBaseballBall className="text-red-500" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  const getRoundLabels = (roundNumber: number) => {
    if (roundNumber === 100 || roundNumber >= 201) return { phase: 'Fase 3', round: 'Finales' };
    if (roundNumber >= 101) return { phase: 'Fase 2', round: `Jornada ${roundNumber - 100}` };
    return { phase: 'Fase 1', round: `Jornada ${roundNumber}` };
  };

  const inferredByeMatches = inferMissingTeamByes(matches, teams);
  const teamsOutsideFixture = findTeamsMissingFromEveryRegularRound(matches, teams);
  const matchesToShow = [...matches, ...inferredByeMatches].filter(m => m.matchdays?.round_number === activeRound);
  
  const normalMatches = matchesToShow.filter(m => m.status !== 'BYE');
  const byeMatches = matchesToShow.filter(m => m.status === 'BYE');
  const fixtureAnalysis = analyzeFixture(matches, teams.map((team) => ({ id: team.id, name: team.name })), { requiresVenue: true, minimumRestMinutes: undefined });

  const uniqueSports = Array.from(new Set(categories.map(c => c.sports?.name).filter(Boolean)));
  const hasFaseFinal = availableRounds.includes(100);
  const oddTeamGroups = Object.entries(teams.reduce((groups: Record<string, any[]>, team) => {
    const group = team.group_name || 'A';
    if (!groups[group]) groups[group] = [];
    groups[group].push(team);
    return groups;
  }, {})).filter(([, groupTeams]) => groupTeams.length % 2 !== 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative pb-20">
      <AppPortal>
      <>
      {reorganizing && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/75 p-4" role="status" aria-live="assertive" aria-label="Reorganizando fixture">
          <div className="w-full max-w-sm animate-in zoom-in-95 rounded-[2rem] border border-blue-400/20 bg-white p-7 text-center shadow-2xl sm:p-9">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 animate-spin rounded-full border-[5px] border-blue-100 border-t-blue-600" />
              <Clock size={28} className="animate-pulse text-blue-600" />
            </div>
            <h2 className="mt-6 text-xl font-black uppercase tracking-tight text-slate-950">Procesando fixture</h2>
            <p className="mt-2 text-[10px] font-bold uppercase leading-relaxed tracking-widest text-slate-500">Calculando fechas, equilibrando horarios y asignando canchas</p>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" /></div>
            <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-blue-600">Espera hasta finalizar la actualización</p>
          </div>
        </div>
      )}
      {fixturePdfPreview && (
        <div className="fixed inset-0 z-[490] flex items-center justify-center bg-slate-950/75 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Vista previa del fixture PDF" onClick={(event) => { if (event.target === event.currentTarget) closeFixturePdfPreview(); }}>
          <section className="flex h-[88vh] w-full max-w-5xl animate-in zoom-in-95 flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl sm:rounded-[2rem]">
            <header className="flex items-center justify-between gap-4 bg-slate-950 px-5 py-4 text-white sm:px-6"><div><p className="text-[8px] font-black uppercase tracking-[0.25em] text-blue-400">Documento oficial</p><h2 className="text-base font-black uppercase sm:text-xl">Vista previa del fixture</h2></div><button type="button" onClick={closeFixturePdfPreview} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Cerrar vista previa"><X size={19} /></button></header>
            <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-4"><iframe src={fixturePdfPreview.url} title="Fixture PDF" className="h-full w-full rounded-xl border-0 bg-white" /></div>
            <footer className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{fixturePdfPreview.filename}</p><div className="flex gap-2"><button type="button" onClick={closeFixturePdfPreview} className="flex-1 rounded-xl bg-slate-100 px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-600 sm:flex-none">Cancelar</button><button type="button" onClick={downloadFixturePdf} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[9px] font-black uppercase tracking-widest text-white hover:bg-blue-700 sm:flex-none"><Download size={15} /> Descargar PDF</button></div></footer>
          </section>
        </div>
      )}
      
      {/* MODAL: GRILLA INTERACTIVA TIPO EXCEL */}
      {showGridModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-600"></div>
            
            <div className="p-8 pb-4 flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Matriz de <span className="text-emerald-600">Importación</span></h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                  <TableProperties size={12} className="text-emerald-500"/> Copia y pega desde tu Excel oficial
                </p>
              </div>
              <div className="flex gap-3">
                 <button onClick={downloadTemplate} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors flex items-center gap-2 px-4 text-[10px] font-black uppercase">
                    <Download size={14}/> Formato Base
                 </button>
                 <button onClick={() => setShowGridModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors">
                   <X size={20} />
                 </button>
              </div>
            </div>

            <div className="px-8 overflow-y-auto flex-1 scrollbar-hide py-4 border-y border-slate-100 bg-slate-50">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                <div className="w-full min-w-[850px]">
                  <div className="grid grid-cols-[60px_1fr] bg-slate-100 border-b border-slate-200">
                    <div className="py-3 text-center text-[10px] font-black text-slate-400 uppercase border-r border-slate-200">Fila</div>
                    <div className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Pega aquí el contenido de tu Excel (Incluye Columnas Cancha y Descanso)</div>
                  </div>
                  
                  <div className="divide-y divide-slate-100">
                    {gridData.map((rowValue, idx) => (
                      <div key={idx} className="grid grid-cols-[60px_1fr] group">
                        <div className="py-3 text-center text-xs font-bold text-slate-300 border-r border-slate-100 bg-slate-50 flex items-center justify-center">
                          {idx + 1}
                        </div>
                        <input 
                          type="text"
                          value={rowValue}
                          onChange={(e) => handleGridChange(idx, e.target.value)}
                          onPaste={(e) => handleGridPaste(e, idx)}
                          placeholder={idx === 0 ? "Haz clic aquí, presiona Ctrl+V para pegar tus jornadas..." : ""}
                          className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:bg-blue-50 focus:text-blue-700 uppercase transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <button onClick={addMoreRows} className="w-full mt-4 py-3 bg-slate-200/50 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 border border-dashed border-slate-300">
                 <Plus size={14}/> Añadir más filas
              </button>
            </div>
            
            <div className="p-8 pt-4 flex flex-wrap sm:flex-nowrap w-full gap-4 shrink-0 bg-white">
              <button onClick={clearGrid} className="w-full sm:w-auto py-4 px-6 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center gap-2">
                 <Eraser size={16}/> Limpiar
              </button>
              <button onClick={processGridData} disabled={loading} className="w-full flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50">
                <Database size={16} /> {loading ? 'Procesando Fixture...' : 'Estructurar Calendario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDICIÓN MANUAL */}
      {editingMatch && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Modificar Encuentro</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                  <AlertCircle size={12} className="text-blue-500"/> Anulación manual de registros y canchas
                </p>
              </div>
              <button onClick={() => setEditingMatch(null)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between mb-6 shadow-inner">
               <span className="font-black uppercase text-xs text-slate-700 truncate w-1/3 text-right">{editingMatch.home_team?.name || 'POR DEFINIR'}</span>
               <span className="text-slate-300 font-black italic">VS</span>
               <span className="font-black uppercase text-xs text-slate-700 truncate w-1/3 text-left">{editingMatch.away_team?.name || 'POR DEFINIR'}</span>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-bold text-sm focus:border-blue-500 outline-none transition-all" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hora</label>
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-bold text-sm focus:border-blue-500 outline-none transition-all" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Asignación de Cancha</label>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <MapPin size={16} className="text-slate-400" />
                   </div>
                   <input type="text" placeholder="Ej: Cancha 1, Coliseo..." value={editVenue} onChange={e => setEditVenue(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl pl-10 pr-4 py-3 font-bold text-sm focus:border-blue-500 outline-none transition-all uppercase" />
                 </div>
              </div>

              <div className="grid grid-cols-3 gap-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Score L</label>
                  <input type="number" value={editHomeScore} onChange={e => setEditHomeScore(e.target.value ? Number(e.target.value) : '')} className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-black text-center text-xl focus:border-blue-500 outline-none shadow-sm" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Estado</label>
                  <AppSelect
                    value={editStatus}
                    onChange={setEditStatus}
                    compact
                    options={[
                      { value: 'SCHEDULED', label: 'Programado' },
                      { value: 'LIVE', label: 'En Vivo' },
                      { value: 'FINISHED', label: 'Finalizado' },
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Score V</label>
                  <input type="number" value={editAwayScore} onChange={e => setEditAwayScore(e.target.value ? Number(e.target.value) : '')} className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-black text-center text-xl focus:border-blue-500 outline-none shadow-sm" />
                </div>
              </div>
            </div>
            
            <div className="flex w-full gap-4 mt-8">
              <button onClick={() => setEditingMatch(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={handleUpdateMatch} disabled={loading} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={16} /> Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {showFirstByeModal && (
        <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Elegir primer descanso">
          <div className="my-auto w-full max-w-lg rounded-[2.5rem] border border-blue-100 bg-white shadow-2xl animate-in zoom-in-95">
            <div className="bg-slate-950 p-7 text-white"><CalendarDays className="mb-4 text-blue-400" size={32} /><h2 className="text-2xl font-black uppercase tracking-tight">Primer descanso</h2><p className="mt-2 text-[10px] font-bold uppercase leading-relaxed tracking-widest text-slate-400">Selecciona quién descansará en la jornada 1. El sistema rotará los demás descansos de forma equilibrada.</p></div>
            <div className="space-y-4 p-7">
              {oddTeamGroups.map(([group, groupTeams]) => <div key={group}><label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">{oddTeamGroups.length > 1 ? `Grupo ${group}` : 'Equipo que descansa'} · {groupTeams.length} equipos</label><AppSelect value={firstByeByGroup[group] || ''} onChange={(value) => setFirstByeByGroup((current) => ({ ...current, [group]: value }))} options={groupTeams.map((team) => ({ value: team.id, label: team.name }))} placeholder="Selecciona un equipo" menuPlacement="top" /></div>)}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-[9px] font-bold uppercase leading-relaxed tracking-wider text-emerald-700">Cada equipo descansará exactamente una vez. Ningún cruce se repetirá y todos los equipos se enfrentarán entre sí dentro de su grupo.</div>
              <div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowFirstByeModal(false)} className="flex-1 rounded-2xl bg-slate-100 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-600">Cancelar</button><button type="button" disabled={loading || oddTeamGroups.some(([group]) => !firstByeByGroup[group])} onClick={() => handleAutoGenerateFixture(firstByeByGroup)} className="flex-[1.5] rounded-2xl bg-blue-600 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-200 disabled:opacity-50">Generar fixture</button></div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DESTRUCCIÓN DE FIXTURE */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600"></div>
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <Trash2 size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Eliminar Fixture</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">¿Confirma la destrucción total de los partidos programados? Esta acción es irreversible.</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm">Cancelar</button>
              <button onClick={confirmDeleteFixture} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FASE FINAL */}
      {showPlayoffConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-indigo-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-6 border border-indigo-100 shadow-inner">
              <GitMerge size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Generar Eliminatorias</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">El sistema sincronizará los cruces finales (Ej: 1A vs 2B). Asegúrese de haber asignado los grupos A y B a los colegios en la pestaña "GRUPOS".</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowPlayoffConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 shadow-sm">Cancelar</button>
              <button onClick={executeGeneratePlayoffs} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg">Estructurar Llaves</button>
            </div>
          </div>
        </div>
      )}
      </>
      </AppPortal>

      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 relative">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 sm:mb-12 gap-5 sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Fixture <span className="text-blue-600">Central</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Sincronización de encuentros</p>
          </div>
          
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">{selectedCategory ? (
            <button onClick={() => { setSelectedCategory(null); router.replace(`/${slug}/admin/grupos`, { scroll: false }); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Categorías
            </button>
          ) : selectedSport ? (
            <button onClick={() => setSelectedSport(null)} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Deportes
            </button>
          ) : (
            <Link href={`/${slug}/admin`} className="w-full sm:w-fit p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
              <House size={16} /> Panel principal
            </Link>
          )}{(selectedCategory || selectedSport) && <Link href={`/${slug}/admin`} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 p-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:border-blue-600 hover:bg-blue-600"><House size={16} /> Panel principal</Link>}</div>
        </div>

        {!selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-5 sm:p-8 bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] hover:border-blue-300 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden h-full"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2 break-words">{sport as string}</h3>
                   <div className="mt-auto flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors w-full justify-between pt-4">
                     Abrir Categorías <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {!selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => { setSelectedCategory(c.id); router.replace(`/${slug}/admin/grupos?cat=${c.id}`, { scroll: false }); }}
                   className="group flex flex-col p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2 break-words">{c.name}</h3>
                   <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 w-full justify-between">
                     Gestionar Fixture <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {selectedCategory && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">

            {stageStatus?.enabled && (
              <section className="rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-white shadow-xl sm:p-7">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-200">Formato Máster 35+</p>
                    <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Liga · Grupos · Finales</h2>
                    <p className="mt-2 max-w-2xl text-xs font-bold text-blue-100">8 equipos. Fase 1 todos contra todos; Fase 2 grupos A/B a ida y vuelta; Final Oro entre líderes y Final Plata entre segundos.</p>
                  </div>
                  {stageStatus.stages.length === 0 ? (
                    <button disabled={loading || teams.length !== 8} onClick={() => runStageAction(startThreeStageTournament(slug, selectedCategory), 'Fase 1 generada')} className="rounded-xl bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-blue-700 disabled:opacity-50">Iniciar fase 1</button>
                  ) : stageStatus.stages.some((stage: any) => stage.status === 'ACTIVE') ? (
                    <button disabled={loading} onClick={() => runStageAction(advanceThreeStageTournament(slug, selectedCategory), 'Fase cerrada y siguiente fase generada')} className="rounded-xl bg-emerald-400 px-5 py-3 text-xs font-black uppercase tracking-widest text-emerald-950 disabled:opacity-50">Cerrar fase y avanzar</button>
                  ) : <span className="rounded-full bg-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-widest">Competencia finalizada</span>}
                </div>
                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[1, 2, 3].map((number) => {
                    const stage = stageStatus.stages.find((item: any) => item.stage_number === number);
                    return <div key={number} className={`rounded-xl border p-3 ${stage?.status === 'ACTIVE' ? 'border-white bg-white text-blue-800' : 'border-white/20 bg-white/10'}`}><p className="text-[9px] font-black uppercase tracking-widest opacity-70">Fase {number}</p><p className="mt-1 text-xs font-black uppercase">{stage?.name || (number === 1 ? 'Todos vs todos' : number === 2 ? 'Grupos ida y vuelta' : 'Finales Oro y Plata')}</p><p className="mt-1 text-[9px] font-black uppercase opacity-60">{stage?.status === 'COMPLETED' ? 'Finalizada' : stage?.status === 'ACTIVE' ? 'En curso' : 'Pendiente'}</p></div>;
                  })}
                </div>
                {Object.entries(stageStatus.standings || {}).map(([group, rows]) => (
                  <div key={group} className="mt-4 rounded-xl border border-white/20 bg-slate-950/20 p-3">
                    <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-blue-200">{group === 'GENERAL' ? 'Tabla de la fase' : `Grupo ${group}`}</p>
                    <div className="grid gap-1">
                      {(rows as any[]).map((team, index) => <div key={team.id} className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-[10px] font-black uppercase"><span>{index + 1}. {team.name}</span><span>{team.points} pts</span></div>)}
                    </div>
                  </div>
                ))}
                {teams.length !== 8 && stageStatus.stages.length === 0 && <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-amber-200">Debes registrar exactamente 8 equipos. Actualmente hay {teams.length}.</p>}
              </section>
            )}
            
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
               <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
              <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-center gap-4 min-w-0">
                   <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                      {getSportIcon(categories.find(c => c.id === selectedCategory)?.sports?.name, 32)}
                   </div>
                  <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight break-words">
                      {categories.find(c => c.id === selectedCategory)?.name || 'Cargando...'}
                    </h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Nóminas detectadas: {teams.length} delegaciones</p>
                  </div>
                </div>
                <div className={`flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-[9px] font-black uppercase tracking-widest ${categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_delegates ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_delegates ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_delegates ? 'Visible para delegados' : 'Oculto para delegados'}
                </div>
              </div>

              <div className="space-y-4 bg-gradient-to-r from-slate-50 to-blue-50/40 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex w-full shrink-0 bg-slate-200/70 p-1 rounded-xl shadow-inner sm:w-fit">
                   <button 
                     onClick={() => setViewMode('FIXTURE')}
                     className={`flex-1 px-6 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all sm:flex-none ${viewMode === 'FIXTURE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     Partidos
                   </button>
                   <button 
                     onClick={() => setViewMode('GROUPS')}
                     className={`flex flex-1 items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all sm:flex-none ${viewMode === 'GROUPS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     Grupos <Users size={12}/>
                   </button>
                  </div>
                  {viewMode === 'FIXTURE' && <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[300px]">
                  <button type="button" role="switch" aria-checked={Boolean(categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_delegates)} aria-label="Visibilidad del fixture para delegados" onClick={handleFixtureVisibility} disabled={loading || matches.length === 0} className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left shadow-sm transition-all hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40">
                    <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-700">{categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_delegates ? <Eye size={16} className="shrink-0 text-emerald-600" /> : <EyeOff size={16} className="shrink-0 text-slate-400" />} Fixture para delegados</span>
                    <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_delegates ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_delegates ? 'translate-x-6' : 'translate-x-1'}`} /></span>
                  </button>
                  <button type="button" role="switch" aria-checked={Boolean(categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_public)} aria-label="Publicar fixture y resultados" onClick={handlePublicFixtureVisibility} disabled={loading || matches.length === 0} className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left shadow-sm transition-all hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                    <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-700">{categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_public ? <Eye size={16} className="shrink-0 text-emerald-600" /> : <EyeOff size={16} className="shrink-0 text-slate-400" />} Publicar programación y resultados</span>
                    <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_public ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${categories.find(c => c.id === selectedCategory)?.tournaments?.fixture_visible_to_public ? 'translate-x-6' : 'translate-x-1'}`} /></span>
                  </button>
                  </div>}
                </div>

                {viewMode === 'FIXTURE' && <div className="grid w-full grid-cols-2 gap-2.5 xl:grid-cols-4">
                  {matches.length > 0 && (
                    <button onClick={handleReorganizeTimes} disabled={loading} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[9px] font-black uppercase leading-tight tracking-widest text-blue-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-blue-600 hover:text-white hover:shadow-md disabled:opacity-50">
                      <Clock size={16} className={reorganizing ? 'animate-spin' : ''} /> {reorganizing ? 'Procesando...' : 'Reorganizar fechas y horarios'}
                    </button>
                  )}
                  {matches.length > 0 && <button type="button" onClick={handleExportFixturePdf} disabled={loading} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-cyan-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-cyan-600 hover:text-white hover:shadow-md disabled:opacity-50"><FileDown size={16} /> Exportar PDF</button>}
                  {!stageStatus?.enabled && teams.length > 0 && matches.length === 0 && (
                    <div className="col-span-2 flex flex-col gap-2 sm:flex-row xl:col-span-4">
                      <button onClick={() => handleAutoGenerateFixture()} disabled={loading} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-500 transition-all font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-200 disabled:opacity-50">
                        <CalendarDays size={16} /> Autogenerar Cruces
                      </button>
                      <button onClick={() => setShowGridModal(true)} disabled={loading} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-xl hover:bg-emerald-500 transition-all font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-200 disabled:opacity-50">
                        <TableProperties size={16} /> Carga Masiva (Excel)
                      </button>
                    </div>
                  )}
                  {!stageStatus?.enabled && matches.length > 0 && (
                    <>
                      {!hasFaseFinal && (
                        <button onClick={handlePlayoffClick} disabled={loading} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-indigo-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-600 hover:text-white hover:shadow-md">
                          <GitMerge size={16} /> Fase Final
                        </button>
                      )}
                      <button onClick={handleDeleteClick} disabled={loading} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-[9px] font-black uppercase tracking-widest text-red-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-50 hover:shadow-md">
                        <Trash2 size={16} /> Limpiar
                      </button>
                    </>
                  )}
                </div>}
              </div>
            </div>

            {viewMode === 'GROUPS' && (
               <div className="bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Asignación de Grupos</h3>
                      <p className="text-slate-500 text-xs font-bold">Asigna cada delegación a su grupo correspondiente para que el Autogenerador de Fixture y la Fase Final funcionen correctamente.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 lg:justify-end">
                      <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
                        {[2, 3, 4].map((count) => (
                          <button
                            key={count}
                            onClick={() => setRandomGroupCount(count)}
                            className={`px-4 py-3 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all ${randomGroupCount === count ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {count} Gr.
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={handleRandomizeGroups}
                        disabled={loading || teams.length < randomGroupCount}
                        className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-4 rounded-xl hover:bg-indigo-500 transition-all font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Wand2 size={16} /> Distribuir Aleatorio
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                     {['A', 'B', 'C', 'D'].map(group => (
                        <div key={group} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
                           <h4 className="text-lg font-black text-blue-600 uppercase mb-4 border-b border-slate-200 pb-2 flex justify-between items-center">
                             Grupo {group}
                             <span className="bg-white px-2 py-1 rounded text-[10px] text-slate-400 shadow-sm">{teams.filter(t => t.group_name === group).length}</span>
                           </h4>
                           <div className="space-y-3">
                              {teams.filter(t => t.group_name === group).map(team => (
                                 <div key={team.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:border-blue-200 transition-colors">
                                    <span className="font-bold text-[11px] text-slate-700 uppercase truncate pr-2" title={team.name}>{team.name}</span>
                                    <AppSelect
                                      value={team.group_name || 'A'}
                                      onChange={(value) => handleUpdateTeamGroup(team.id, value)}
                                      compact
                                      className="w-24 shrink-0"
                                      options={[
                                        { value: 'A', label: 'Gr. A' },
                                        { value: 'B', label: 'Gr. B' },
                                        { value: 'C', label: 'Gr. C' },
                                        { value: 'D', label: 'Gr. D' },
                                      ]}
                                    />
                                 </div>
                              ))}
                              {teams.filter(t => t.group_name === group).length === 0 && (
                                 <div className="py-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
                                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Vacío</p>
                                 </div>
                              )}
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {viewMode === 'FIXTURE' && matches.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col min-h-[520px] md:min-h-[600px] animate-in fade-in slide-in-from-bottom-4">
                <section aria-labelledby="fixture-analysis-title" className="m-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:m-6 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-600">Fixture Intelligence</p><h2 id="fixture-analysis-title" className="mt-1 text-lg font-black uppercase tracking-tight text-slate-950">Análisis del fixture</h2><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{fixtureAnalysis.metrics.matches} partidos · {fixtureAnalysis.metrics.teams} equipos · {fixtureAnalysis.metrics.matchdays} jornadas</p></div>
                    <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest ${fixtureAnalysis.status === 'ERROR' ? 'bg-red-100 text-red-700' : fixtureAnalysis.status === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{fixtureAnalysis.status === 'ERROR' ? 'Conflictos' : fixtureAnalysis.status === 'WARNING' ? 'Requiere revisión' : 'Listo'}</span>
                  </div>
                  <div className="mt-4 grid gap-2 text-[9px] font-black uppercase tracking-wider sm:grid-cols-3"><span className="rounded-xl bg-white px-3 py-2 text-slate-600">{fixtureAnalysis.metrics.errors} errores</span><span className="rounded-xl bg-white px-3 py-2 text-slate-600">{fixtureAnalysis.metrics.warnings} advertencias</span><span className="rounded-xl bg-white px-3 py-2 text-slate-600">{fixtureAnalysis.metrics.byes} descansos</span></div>
                  {fixtureAnalysis.issues.length > 0 ? <ul className="mt-3 space-y-1.5" aria-label="Incidencias del fixture">{fixtureAnalysis.issues.slice(0, 4).map((issue, index) => <li key={`${issue.code}-${index}`} className={`text-[10px] font-bold ${issue.severity === 'ERROR' ? 'text-red-700' : 'text-amber-700'}`}>{issue.severity === 'ERROR' ? '⛔' : '⚠️'} {issue.message}</li>)}</ul> : <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-700">El fixture no presenta conflictos operativos detectados.</p>}
                </section>
                {teamsOutsideFixture.length > 0 && <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:m-6"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={20} /><div><p className="text-xs font-black uppercase tracking-widest">Fixture desactualizado</p><p className="mt-1 text-[10px] font-bold uppercase leading-relaxed tracking-wider">{teamsOutsideFixture.map((team) => team.name).join(', ')} no participa en ninguna jornada. Este equipo fue agregado después de generar el calendario. Limpia y regenera el fixture para obtener 9 jornadas con descansos rotativos.</p></div></div></div>}
                
                <div className="flex overflow-x-auto bg-slate-50 px-4 pt-4 border-b border-slate-100 gap-2 scrollbar-hide">
                  {availableRounds.map((round) => (
                    <button
                      key={round}
                      onClick={() => setActiveRound(round)}
                      className={`min-w-[150px] rounded-t-2xl px-6 py-3 font-black uppercase transition-all whitespace-nowrap flex flex-col items-center justify-center gap-1
                        ${activeRound === round 
                          ? 'bg-white text-blue-600 border-t-2 border-x border-slate-100 shadow-sm z-10 -mb-[1px]' 
                          : 'bg-slate-100 text-slate-400 hover:bg-white hover:text-slate-600 border-t border-transparent'}
                      `}
                    >
                      <span className="flex items-center gap-2 text-[9px] tracking-[0.25em]">
                        {(round === 100 || round >= 201) && <GitMerge size={12}/>}
                        {getRoundLabels(round).phase}
                      </span>
                      <span className={`text-[10px] tracking-[0.16em] ${activeRound === round ? 'text-slate-700' : 'text-slate-400'}`}>{getRoundLabels(round).round}</span>
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-slate-100 flex-1">
                  {matchesToShow.length === 0 ? (
                    <div className="p-10 sm:p-20 text-center text-slate-400 font-black text-xs uppercase tracking-[0.3em] bg-white">Jornada sin programación</div>
                  ) : (
                    <>
                      {/* BANNERS DE EQUIPOS QUE DESCANSAN (BYES) */}
                      {byeMatches.length > 0 && (
                        <div className="p-6 pb-2">
                          <div className="bg-orange-500 p-4 rounded-2xl shadow-lg animate-pulse flex flex-wrap items-center justify-center gap-4">
                            {byeMatches.map(m => (
                              <div key={m.id} className="bg-slate-900 text-white pr-2 py-1.5 pl-4 rounded-xl flex items-center gap-3 shadow-md">
                                <span className="text-sm md:text-base font-black uppercase tracking-[0.2em] text-orange-400">DESCANSA:</span>
                                <span className="text-sm md:text-base font-black uppercase tracking-[0.1em]">{m.home_team?.name}</span>
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden shrink-0 ml-1">
                                  {m.home_team?.schools?.logo_url ? (
                                    <img src={m.home_team.schools.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                                  ) : (
                                    <School size={16} className="text-slate-300" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* LISTA DE PARTIDOS NORMALES */}
                      {normalMatches.map((match) => (
                        <div key={match.id} className="relative overflow-hidden p-5 pt-24 transition-colors hover:bg-slate-50/50 sm:p-8 sm:pt-28 lg:p-12 lg:pt-28 group">
                          
                          <button onClick={() => openEditModal(match)} className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-400 rounded-xl shadow-sm transition-all z-10 sm:opacity-0 group-hover:opacity-100">
                            <Pencil size={18} />
                          </button>

                          <div className="absolute left-1/2 top-4 flex w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-slate-100 bg-white px-4 py-2 pr-14 shadow-sm sm:top-6 sm:px-5 sm:pr-5">
                            <CalendarDays size={14} className="text-blue-600" />
                            <span className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:tracking-[0.2em]">
                              {match.matchdays?.scheduled_date ? new Date(match.matchdays.scheduled_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'long', day: 'numeric' }) : 'Fecha por asignar'} 
                              {' • '}
                              {match.scheduled_time ? formatTime12Hour(match.scheduled_time) : 'H:MM'}
                            </span>
                          </div>

                          {/* NUEVO: ETIQUETA DE CANCHA CON DIBUJO CSS */}
                          {match.venue && (
                            <div className="absolute left-5 top-14 z-10 flex max-w-[calc(100%-2.5rem)] flex-col items-start gap-1 sm:left-8 sm:top-6 lg:left-12">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Cancha Asignada</span>
                              <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-xl shadow-sm border border-emerald-200 transform transition-transform group-hover:scale-105">
                                {/* DIBUJO DE MINI CANCHA (CSS Puro) */}
                                <div className="w-8 h-5 bg-emerald-500 rounded-sm border border-emerald-600 relative flex items-center justify-center shrink-0 overflow-hidden">
                                  <div className="absolute w-[1.5px] h-full bg-white/70 left-1/2 -translate-x-1/2"></div>
                                  <div className="absolute w-2.5 h-2.5 border-[1.5px] border-white/70 rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                                  <div className="absolute left-0 w-1.5 h-2.5 border-[1.5px] border-l-0 border-white/70 top-1/2 -translate-y-1/2"></div>
                                  <div className="absolute right-0 w-1.5 h-2.5 border-[1.5px] border-r-0 border-white/70 top-1/2 -translate-y-1/2"></div>
                                </div>
                                <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">{match.venue}</span>
                              </div>
                            </div>
                          )}

                          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-6 lg:gap-10">
                            
                            <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 min-w-0">
                              <div className="text-left sm:text-right flex flex-col min-w-0">
                                 <span className="line-clamp-2 max-w-full break-words text-lg font-black uppercase leading-tight tracking-tight text-slate-900 sm:text-xl lg:text-2xl">{match.home_team?.name || 'POR DEFINIR'}</span>
                                 <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">Local</span>
                              </div>
                              <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white rounded-2xl sm:rounded-3xl border border-slate-100 flex items-center justify-center p-2 sm:p-3 shrink-0 shadow-md group-hover:border-blue-200 transition-colors overflow-hidden">
                                {match.home_team?.schools?.logo_url ? (
                                  <img src={match.home_team.schools.logo_url} alt="Local" className="w-full h-full object-contain" />
                                ) : (
                                  <School size={40} className="text-slate-100" />
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col items-center justify-center min-w-0 sm:min-w-[120px] lg:min-w-[150px]">
                                 {match.status === 'FINISHED' ? (
                                    <div className="bg-slate-900 text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center justify-center gap-4 border border-slate-800">
                                      <span className="font-black text-4xl">{match.home_score ?? '-'}</span>
                                      <span className="text-blue-500 text-2xl font-black">:</span>
                                      <span className="font-black text-4xl">{match.away_score ?? '-'}</span>
                                    </div>
                                 ) : match.status === 'LIVE' ? (
                                    <div className="bg-emerald-50 px-6 py-3 rounded-2xl flex items-center gap-3 border border-emerald-200 shadow-sm">
                                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                      <span className="text-emerald-700 font-black text-xs uppercase tracking-[0.2em]">En Vivo</span>
                                    </div>
                                 ) : (
                                   <div className="flex flex-col items-center gap-2">
                                     <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 shadow-inner">
                                        <span className="text-slate-300 font-black italic text-sm">VS</span>
                                     </div>
                                   </div>
                                 )}
                            </div>

                            <div className="flex items-center justify-between sm:justify-start gap-4 sm:gap-8 min-w-0">
                              <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white rounded-2xl sm:rounded-3xl border border-slate-100 flex items-center justify-center p-2 sm:p-3 shrink-0 shadow-md group-hover:border-blue-200 transition-colors overflow-hidden">
                                {match.away_team?.schools?.logo_url ? (
                                  <img src={match.away_team.schools.logo_url} alt="Visitante" className="w-full h-full object-contain" />
                                ) : (
                                  <School size={40} className="text-slate-100" />
                                )}
                              </div>
                              <div className="text-right sm:text-left flex flex-col min-w-0">
                                 <span className="line-clamp-2 max-w-full break-words text-lg font-black uppercase leading-tight tracking-tight text-slate-900 sm:text-xl lg:text-2xl">{match.away_team?.name || 'POR DEFINIR'}</span>
                                 <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">Visitante</span>
                              </div>
                            </div>

                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">
                   <ShieldCheck size={12} className="text-blue-600/50" /> Sincronización protegida • {slug}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function GruposPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-black tracking-[0.3em] uppercase text-xs">Accediendo a Fixture Central...</p>
      </div>
    }>
      <FixtureContent />
    </Suspense>
  );
}
