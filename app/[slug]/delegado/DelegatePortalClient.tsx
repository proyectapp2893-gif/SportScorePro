'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarDays, ClipboardCopy, Download, ExternalLink, Eye, FileCheck2, FileSpreadsheet, KeyRound, Lock, LogOut, Plus, ShieldCheck, Square, Trash2, Trophy, Upload, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '@/app/lib/sports/rules';
import { toTeamSlug } from '@/app/lib/team-slug';
import { addDelegatePlayers, changeDelegatePassword, deleteDelegatePlayer, getPlayerIdentityDocumentUrl, loginDelegate, logoutDelegate, uploadDelegateSchoolLogo, uploadPlayerIdentityDocument } from './actions';

type DelegatePortalClientProps = {
  slug: string;
  initialData: any | null;
};

type BulkPlayerRow = {
  name: string;
  identityNumber: string;
  shirtNumber: number | null;
  birthYear: number | null;
  vinculo: string;
  error?: string;
};

const ALLOWED_RELATIONSHIPS = ['PADRE DE FAMILIA', 'EX-ALUMNO', 'COLABORADOR'] as const;
const emptyBulkRow = (): BulkPlayerRow => ({ name: '', identityNumber: '', shirtNumber: null, birthYear: null, vinculo: '' });
const MOBILE_ROW_COLORS = [
  'border-blue-200 bg-blue-50/80',
  'border-emerald-200 bg-emerald-50/80',
  'border-amber-200 bg-amber-50/80',
  'border-violet-200 bg-violet-50/80',
  'border-cyan-200 bg-cyan-50/80',
] as const;

function isRegistrationOpen(category: any) {
  if (!category?.registration_open) return false;
  if (!category.registration_deadline) return true;
  return new Date(category.registration_deadline).getTime() >= Date.now();
}

function initialsForTeam(team: any) {
  const source = team?.name || team?.schools?.name || 'EQ';
  return String(source)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function matchStatusLabel(status: string) {
  if (status === 'LIVE') return 'En vivo';
  if (status === 'FINISHED') return 'Finalizado';
  if (status === 'SCHEDULED') return 'Programado';
  return status || 'Sin estado';
}

function TeamLogo({ team, className = 'w-10 h-10' }: { team: any; className?: string }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = team?.schools?.logo_url;

  return (
    <div
      className={`${className} rounded-xl border border-slate-200 bg-white flex items-center justify-center p-1.5 shrink-0 overflow-hidden relative shadow-sm`}
    >
      <span className="absolute inset-0 flex items-center justify-center text-slate-700 text-xs font-black">
        {initialsForTeam(team)}
      </span>
      {logoUrl && !failed && (
        <img
          src={logoUrl}
          alt={team?.name || 'Equipo'}
          className="relative z-10 max-w-full max-h-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export default function DelegatePortalClient({ slug, initialData }: DelegatePortalClientProps) {
  const router = useRouter();
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [data, setData] = useState<any | null>(initialData);
  const [selectedTeamId, setSelectedTeamId] = useState(initialData?.teams?.[0]?.id || '');
  const [newPlayer, setNewPlayer] = useState({ name: '', identityNumber: '', shirtNumber: '', birthYear: '', vinculo: '' });
  const [logoUrl, setLogoUrl] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [activeRound, setActiveRound] = useState('');
  const [selectedHistoryMatch, setSelectedHistoryMatch] = useState<any | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkPlayerRow[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedTeam = data?.teams?.find((team: any) => team.id === selectedTeamId) || data?.teams?.[0];
  const selectedCategory = selectedTeam?.categories;
  const canEditRoster = selectedTeam && isRegistrationOpen(selectedCategory);
  const players = data?.playersByTeam?.[selectedTeam?.id] || [];
  const bulkFilledRows = bulkRows.filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthYear || row.vinculo);
  const events = data?.eventsByTeam?.[selectedTeam?.id] || [];
  const matches = data?.matchesByTeam?.[selectedTeam?.id] || [];
  const fullSchedule = data?.schedulesByTeam?.[selectedTeam?.id] || [];
  const eventsByMatch = data?.eventsByMatch || {};
  const historyMatches = matches.filter((match: any) => match.status === 'FINISHED');
  const teamUpcomingMatches = matches.filter((match: any) => match.status !== 'FINISHED');
  const scheduleRounds = fullSchedule.reduce((acc: Record<string, any[]>, match: any) => {
    const round = match.matchdays?.round_number || 0;
    const key = round === 100 || round >= 201 ? 'Fase 3 · Finales' : round >= 101 ? `Fase 2 · Jornada ${round - 100}` : `Fase 1 · Jornada ${round}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
  const roundEntries = Object.entries(scheduleRounds);
  const selectedRound = activeRound && scheduleRounds[activeRound] ? activeRound : roundEntries[0]?.[0] || '';

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    setActiveRound('');
  }, [selectedTeam?.id]);

  const bulkDraftKey = selectedTeam?.id ? `sportscore:delegate:${slug}:bulk-roster:${selectedTeam.id}` : '';

  useEffect(() => {
    if (!showBulkUpload || !bulkDraftKey || bulkRows.length === 0) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(bulkDraftKey, JSON.stringify({ version: 1, updatedAt: Date.now(), rows: bulkRows }));
        setDraftSavedAt(new Date());
      } catch {
        toast.error('El navegador no permitió guardar el borrador local.');
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [bulkDraftKey, bulkRows, showBulkUpload]);

  useEffect(() => {
    if (!fullSchedule.some((match: any) => match.status === 'LIVE')) return;
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [fullSchedule, router]);

  const eventSummary = events.reduce((acc: any, event: any) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + 1;
    return acc;
  }, {});
  const totalScoring = (eventSummary.GOAL || 0) + (eventSummary.BASKET_1 || 0) + ((eventSummary.BASKET_2 || 0) * 2) + ((eventSummary.BASKET_3 || 0) * 3);
  const eventFineAmount = (event: any) => {
    if (event.fine_status === 'PAID') return 0;
    if (typeof event.fine_amount === 'number' && event.fine_amount > 0) return event.fine_amount;
    if (event.event_type === 'YELLOW') {
      return selectedCategory?.tournaments?.fine_yellow_amount || selectedCategory?.tournaments?.fp_yellow_deduction || 0;
    }
    if (event.event_type === 'RED') {
      return selectedCategory?.tournaments?.fine_red_amount || selectedCategory?.tournaments?.fp_red_deduction || 0;
    }
    return 0;
  };
  const debt = events.reduce((sum: number, event: any) => sum + eventFineAmount(event), 0);

  const sportRules = getSportRules(selectedCategory?.sports?.name);
  const standings = useMemo(() => {
    const teamsById: Record<string, any> = {};
    fullSchedule.forEach((match: any) => {
      [match.home_team, match.away_team].forEach((team: any) => {
        if (team?.id && !teamsById[team.id]) teamsById[team.id] = { ...team, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0 };
      });
    });
    fullSchedule.filter((match: any) => match.status === 'FINISHED').forEach((match: any) => {
      const home = teamsById[match.home_team_id];
      const away = teamsById[match.away_team_id];
      if (!home || !away) return;
      const score = getMatchScoreForStandings(match, sportRules);
      const resultPoints = getResultPoints(score.home, score.away, sportRules);
      home.played += 1; away.played += 1;
      home.points += resultPoints.home; away.points += resultPoints.away;
      if (score.countsForScoreColumns) {
        home.goals_for += score.home; home.goals_against += score.away;
        away.goals_for += score.away; away.goals_against += score.home;
      }
      if (score.home > score.away) { home.won += 1; away.lost += 1; }
      else if (score.away > score.home) { away.won += 1; home.lost += 1; }
      else { home.drawn += 1; away.drawn += 1; }
    });
    return Object.values(teamsById).sort((a: any, b: any) => compareTeamsForStandings(a, b, sportRules));
  }, [fullSchedule, sportRules]);

  const selectedStanding = standings.find((team: any) => team.id === selectedTeam?.id);
  const scorers = useMemo(() => {
    const byPlayer: Record<string, any> = {};
    events.filter((event: any) => ['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3'].includes(event.event_type)).forEach((event: any) => {
      if (!event.player_id) return;
      if (!byPlayer[event.player_id]) byPlayer[event.player_id] = { id: event.player_id, name: event.players?.name || 'JUGADOR', shirtNumber: event.players?.shirt_number, total: 0 };
      byPlayer[event.player_id].total += event.event_type === 'BASKET_3' ? 3 : event.event_type === 'BASKET_2' ? 2 : 1;
    });
    return Object.values(byPlayer).sort((a: any, b: any) => b.total - a.total);
  }, [events]);
  const cardEvents = events.filter((event: any) => event.event_type === 'YELLOW' || event.event_type === 'RED');

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const result = await loginDelegate(slug, loginForm.username, loginForm.password);
    if (!result.success) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    window.location.reload();
  };

  const handleLogout = async () => {
    await logoutDelegate(slug);
    window.location.reload();
  };

  const handleForcedPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordForm.next !== passwordForm.confirm) {
      toast.error('La confirmación no coincide.');
      return;
    }

    setLoading(true);
    const result = await changeDelegatePassword(slug, passwordForm.current, passwordForm.next);
    if (!result.success) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success('Contraseña actualizada');
    window.location.reload();
  };

  const handleAddPlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTeam) return;
    setLoading(true);
    const result = await addDelegatePlayers(slug, selectedTeam.id, [{
      name: newPlayer.name,
      identityNumber: newPlayer.identityNumber,
      shirtNumber: newPlayer.shirtNumber ? Number(newPlayer.shirtNumber) : null,
      birthYear: newPlayer.birthYear ? Number(newPlayer.birthYear) : null,
      vinculo: newPlayer.vinculo,
    }]);
    if (!result.success) toast.error(result.error);
    else {
      toast.success('Jugador inscrito');
      setNewPlayer({ name: '', identityNumber: '', shirtNumber: '', birthYear: '', vinculo: '' });
      window.location.reload();
    }
    setLoading(false);
  };

  const normalizeExcelHeader = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  const validateBulkRows = (rows: BulkPlayerRow[]) => {
    const currentYear = new Date().getFullYear();
    const normalized = rows.map((row) => ({
      ...row,
      name: row.name.trim().toUpperCase(),
      identityNumber: row.identityNumber.trim().replace(/\D/g, ''),
      vinculo: row.vinculo.trim().toUpperCase(),
      error: undefined,
    }));
    const meaningfulRows = normalized.filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthYear || row.vinculo);

    return normalized.map((row) => {
      if (!row.name && !row.identityNumber && !row.shirtNumber && !row.birthYear && !row.vinculo) return row;
      const errors: string[] = [];
      if (!row.name) errors.push('Falta nombre');
      if (row.identityNumber.length < 5 || row.identityNumber.length > 30) errors.push('Identidad inválida');
      if (!Number.isInteger(row.shirtNumber) || Number(row.shirtNumber) < 1 || Number(row.shirtNumber) > 999) errors.push('Dorsal inválido');
      if (!Number.isInteger(row.birthYear) || Number(row.birthYear) < 1900 || Number(row.birthYear) > currentYear) errors.push('Año inválido');
      if (!ALLOWED_RELATIONSHIPS.includes(row.vinculo as typeof ALLOWED_RELATIONSHIPS[number])) errors.push('Vínculo inválido');
      if (row.shirtNumber && meaningfulRows.filter((item) => item.shirtNumber === row.shirtNumber).length > 1) errors.push('Dorsal repetido');
      if (row.identityNumber && meaningfulRows.filter((item) => item.identityNumber === row.identityNumber).length > 1) errors.push('Identidad repetida');
      return { ...row, error: errors.join(' · ') || undefined };
    });
  };

  const updateBulkRow = (index: number, field: keyof BulkPlayerRow, value: string) => {
    const normalizedValue = field === 'identityNumber' ? value.replace(/\D/g, '') : value;
    const rows = bulkRows.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      [field]: field === 'shirtNumber' || field === 'birthYear' ? (normalizedValue ? Number(normalizedValue) : null) : normalizedValue,
    } : row);
    setBulkRows(validateBulkRows(rows));
  };

  const handleBulkPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line): BulkPlayerRow => {
      const [name = '', identityNumber = '', shirtNumber = '', birthYear = '', vinculo = ''] = line.split('\t');
      return {
        name,
        identityNumber,
        shirtNumber: shirtNumber ? Number(shirtNumber) : null,
        birthYear: birthYear ? Number(birthYear) : null,
        vinculo,
      };
    });
    setBulkRows(validateBulkRows([...rows, ...Array.from({ length: Math.max(0, 8 - rows.length) }, emptyBulkRow)]));
    toast.success(`${rows.length} filas pegadas desde Excel`);
  };

  const downloadBulkTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        'NOMBRE COMPLETO': 'MANUEL RAMIREZ',
        'NUMERO DE IDENTIDAD': '1234567890',
        DORSAL: 10,
        'ANO NACIMIENTO': 1985,
        'VINCULO CON EL COLEGIO': 'EX-ALUMNO',
      },
    ]);
    worksheet['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 12 }, { wch: 20 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'JUGADORES');
    XLSX.writeFile(workbook, `Plantilla_${selectedTeam?.name || 'EQUIPO'}_Jugadores.xlsx`);
    toast.success('Plantilla descargada');
  };

  const handleBulkFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) return toast.error('Selecciona un archivo Excel .xlsx o .xls.');

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      const parsedRows = rawRows.map((rawRow): BulkPlayerRow => {
        const row = Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [normalizeExcelHeader(key), value]));
        const name = String(row['NOMBRE COMPLETO'] || '').trim().toUpperCase();
        const identityNumber = String(row['NUMERO DE IDENTIDAD'] || '').trim().replace(/\D/g, '');
        const shirtNumber = Number(String(row.DORSAL || '').trim());
        const birthYear = Number(String(row['ANO NACIMIENTO'] || '').trim());
        const vinculo = String(row['VINCULO CON EL COLEGIO'] || '').trim().toUpperCase();
        return { name, identityNumber, shirtNumber: shirtNumber || null, birthYear: birthYear || null, vinculo };
      }).filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthYear || row.vinculo);

      if (parsedRows.length === 0) return toast.error('El archivo no contiene jugadores.');
      setBulkRows(validateBulkRows([...parsedRows, ...Array.from({ length: Math.max(0, 8 - parsedRows.length) }, emptyBulkRow)]));
    } catch {
      toast.error('No se pudo leer el archivo Excel.');
    }
  };

  const submitBulkPlayers = async () => {
    const playersToInsert = bulkRows.filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthYear || row.vinculo);
    if (!selectedTeam || playersToInsert.length === 0 || playersToInsert.some((row) => row.error)) return;
    setLoading(true);
    const result = await addDelegatePlayers(slug, selectedTeam.id, playersToInsert.map((row) => ({
      name: row.name,
      identityNumber: row.identityNumber,
      shirtNumber: row.shirtNumber,
      birthYear: row.birthYear,
      vinculo: row.vinculo,
    })));
    setLoading(false);
    if (!result.success) return toast.error(result.error);
    toast.success(`${result.data.inserted} jugadores inscritos`);
    if (bulkDraftKey) window.localStorage.removeItem(bulkDraftKey);
    setShowBulkUpload(false);
    setBulkRows([]);
    setDraftSavedAt(null);
    window.location.reload();
  };

  const openBulkUpload = () => {
    let restoredRows: BulkPlayerRow[] | null = null;
    if (bulkDraftKey) {
      try {
        const savedDraft = JSON.parse(window.localStorage.getItem(bulkDraftKey) || 'null');
        if (Array.isArray(savedDraft?.rows)) {
          restoredRows = validateBulkRows(savedDraft.rows);
          setDraftSavedAt(savedDraft.updatedAt ? new Date(savedDraft.updatedAt) : new Date());
        }
      } catch {
        window.localStorage.removeItem(bulkDraftKey);
      }
    }
    setBulkRows(restoredRows || Array.from({ length: 8 }, emptyBulkRow));
    setShowBulkUpload(true);
    if (restoredRows) toast.success('Borrador local recuperado');
  };

  const discardBulkDraft = () => {
    if (bulkDraftKey) window.localStorage.removeItem(bulkDraftKey);
    setBulkRows(Array.from({ length: 8 }, emptyBulkRow));
    setDraftSavedAt(null);
    toast.success('Borrador eliminado');
  };

  const closeBulkUpload = () => {
    if (bulkDraftKey && bulkRows.length > 0) {
      try {
        window.localStorage.setItem(bulkDraftKey, JSON.stringify({ version: 1, updatedAt: Date.now(), rows: bulkRows }));
      } catch {
        toast.error('No se pudo guardar el último cambio local.');
      }
    }
    setShowBulkUpload(false);
    setBulkRows([]);
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!selectedTeam) return;
    setLoading(true);
    const result = await deleteDelegatePlayer(slug, selectedTeam.id, playerId);
    if (!result.success) toast.error(result.error);
    else {
      toast.success('Jugador removido');
      window.location.reload();
    }
    setLoading(false);
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTeam) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('El archivo debe ser una imagen.');
    if (file.size > 800 * 1024) return toast.error('El logo no puede superar 800 KB.');

    setLoading(true);
    const result = await uploadDelegateSchoolLogo(slug, selectedTeam.id, file);
    if (!result.success) toast.error(result.error);
    else {
      toast.success('Logo actualizado');
      window.location.reload();
    }
    setLoading(false);
  };

  const copyPublicTeamLink = async () => {
    if (!selectedTeam) return;
    const publicUrl = `${window.location.origin}/${slug}/equipo/${toTeamSlug(selectedTeam.name)}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Enlace copiado. Ya puedes enviarlo al equipo.');
    } catch {
      toast.error('No se pudo copiar el enlace en este navegador.');
    }
  };

  const handlePlayerDocumentUpload = async (playerId: string, documentType: 'IDENTITY_FRONT' | 'IDENTITY_BACK', file?: File) => {
    if (!selectedTeam || !file) return;
    setLoading(true);
    const result = await uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, documentType, file);
    if (!result.success) toast.error(result.error);
    else { toast.success('Documento enviado para revisión'); window.location.reload(); }
    setLoading(false);
  };

  const openPlayerDocument = async (playerId: string, documentType: 'IDENTITY_FRONT' | 'IDENTITY_BACK') => {
    if (!selectedTeam) return;
    const result = await getPlayerIdentityDocumentUrl(slug, selectedTeam.id, playerId, documentType);
    if (!result.success) return toast.error(result.error);
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  const renderTeamMark = (team: any) => (
    <TeamLogo team={team} className="w-10 h-10" />
  );

  const renderMatchCard = (match: any, compact = false) => (
    <div key={match.id} className="border border-slate-100 rounded-xl p-3 bg-white">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mb-3">
        <CalendarDays size={12} /> {match.matchdays?.scheduled_date || 'Sin fecha'} / {match.scheduled_time?.slice(0, 5) || '--:--'}
      </p>
      <div className={`grid grid-cols-[minmax(0,1.35fr)_auto_minmax(0,1.35fr)] items-start gap-2 ${compact ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          {renderTeamMark(match.home_team)}
          <span className="font-black uppercase leading-tight break-words min-w-0">{match.home_team?.name}</span>
        </div>
        <div className="bg-slate-900 text-white rounded-lg px-2 sm:px-3 py-2 font-black text-center min-w-[56px] sm:min-w-[64px] self-center">
          {match.status !== 'SCHEDULED' ? `${match.home_score || 0} - ${match.away_score || 0}` : 'VS'}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 min-w-0 text-right">
          <span className="font-black uppercase leading-tight break-words min-w-0">{match.away_team?.name}</span>
          {renderTeamMark(match.away_team)}
        </div>
      </div>
      <p className={`text-[9px] font-black uppercase mt-2 ${match.status === 'LIVE' ? 'text-red-500' : 'text-slate-400'}`}>{matchStatusLabel(match.status)}</p>
    </div>
  );

  const eventLabel = (eventType: string) => {
    if (eventType === 'GOAL') return 'Gol';
    if (eventType === 'BASKET_1') return 'Punto';
    if (eventType === 'BASKET_2') return 'Doble';
    if (eventType === 'BASKET_3') return 'Triple';
    if (eventType === 'YELLOW') return 'Tarjeta amarilla';
    if (eventType === 'RED') return 'Tarjeta roja';
    return eventType;
  };

  const eventAccent = (eventType: string) => {
    if (['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3'].includes(eventType)) return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    if (eventType === 'YELLOW') return 'border-yellow-100 bg-yellow-50 text-yellow-700';
    if (eventType === 'RED') return 'border-red-100 bg-red-50 text-red-700';
    return 'border-slate-100 bg-slate-50 text-slate-600';
  };

  const renderRoundMatchCard = (match: any) => (
    <div key={match.id} className="border border-slate-100 rounded-xl p-3 bg-white">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mb-2">
        <CalendarDays size={12} /> {match.matchdays?.scheduled_date || 'Sin fecha'} / {match.scheduled_time?.slice(0, 5) || '--:--'}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[10px]">
        <div className="flex items-center gap-2 min-w-0">
          <TeamLogo team={match.home_team} className="w-8 h-8" />
          <span className="font-black uppercase truncate">{match.home_team?.name}</span>
        </div>
        <div className="bg-slate-900 text-white rounded-lg px-2 py-1.5 font-black text-center min-w-[54px]">
          {match.status !== 'SCHEDULED' ? `${match.home_score || 0} - ${match.away_score || 0}` : 'VS'}
        </div>
        <div className="flex items-center justify-end gap-2 min-w-0 text-right">
          <span className="font-black uppercase truncate">{match.away_team?.name}</span>
          <TeamLogo team={match.away_team} className="w-8 h-8" />
        </div>
      </div>
      <p className={`text-[9px] font-black uppercase mt-2 ${match.status === 'LIVE' ? 'text-red-500' : 'text-slate-400'}`}>{matchStatusLabel(match.status)}</p>
    </div>
  );

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-white text-slate-900 rounded-[2rem] border border-slate-200 shadow-2xl p-8 space-y-5">
          <div className="text-center">
            <ShieldCheck className="mx-auto text-blue-600 mb-3" size={42} />
            <h1 className="text-3xl font-black uppercase tracking-tighter">Portal Delegado</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Inscripción y seguimiento de equipos</p>
          </div>
          <input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="Usuario" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Contraseña" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <button disabled={loading} className="w-full bg-blue-600 text-white rounded-xl py-4 text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60">Ingresar</button>
        </form>
      </main>
    );
  }

  if (data.delegate?.must_change_password) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <form onSubmit={handleForcedPasswordChange} className="w-full max-w-md bg-white text-slate-900 rounded-[2rem] border border-slate-200 shadow-2xl p-8 space-y-5">
          <div className="text-center">
            <KeyRound className="mx-auto text-blue-600 mb-3" size={42} />
            <h1 className="text-3xl font-black uppercase tracking-tighter">Cambia tu contraseña</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Este cambio es obligatorio para continuar</p>
          </div>
          <input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} placeholder="Contraseña asignada" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <input type="password" value={passwordForm.next} onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })} placeholder="Nueva contraseña" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} placeholder="Confirmar nueva contraseña" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <button disabled={loading} className="w-full bg-blue-600 text-white rounded-xl py-4 text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60">Guardar y continuar</button>
          <button type="button" onClick={handleLogout} className="w-full bg-slate-100 text-slate-500 rounded-xl py-3 text-xs font-black uppercase tracking-widest">Salir</button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      {selectedTeam?.schools?.logo_url && (
        <div className="pointer-events-none absolute inset-x-0 top-40 z-0 flex justify-center overflow-hidden" aria-hidden="true">
          <img
            src={selectedTeam.schools.logo_url}
            alt=""
            className="h-auto w-[min(78vw,760px)] select-none object-contain opacity-[0.035] grayscale"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <header className="relative z-10 overflow-hidden bg-slate-950 px-4 py-6 text-white sm:py-8">
        {selectedTeam?.schools?.logo_url && (
          <img
            src={selectedTeam.schools.logo_url}
            alt=""
            className="pointer-events-none absolute -bottom-28 left-1/2 h-80 w-80 -translate-x-1/2 object-contain opacity-[0.045] grayscale sm:left-auto sm:right-20 sm:translate-x-0"
            aria-hidden="true"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            {selectedTeam && (
              <TeamLogo team={selectedTeam} className="h-20 w-20 rounded-2xl sm:h-28 sm:w-28 sm:rounded-[1.75rem]" />
            )}
            <div className="min-w-0">
              <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.25em] sm:text-[10px]">Portal Delegado</p>
              <h1 className="truncate text-2xl font-black uppercase tracking-tighter sm:text-4xl md:text-5xl">{data.delegate.name}</h1>
              {selectedTeam && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-black uppercase tracking-widest text-slate-400 sm:text-[10px]">
                  <span className="text-white">{selectedTeam.name}</span>
                  <span className="text-blue-500">•</span>
                  <span>{selectedTeam.categories?.sports?.name} / {selectedTeam.categories?.name}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={handleLogout} aria-label="Salir" className="flex w-fit shrink-0 items-center gap-2 rounded-xl bg-white/10 p-3 text-xs font-black uppercase tracking-widest hover:bg-white/15 sm:px-4">
            <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 space-y-6">
        {showBulkUpload && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="bulk-upload-title" className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-[2rem] sm:border sm:border-slate-200">
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Carga masiva</p>
                  <h2 id="bulk-upload-title" className="text-xl font-black uppercase tracking-tight sm:text-2xl">Importar jugadores desde Excel</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Equipo: {selectedTeam?.name}</p>
                  <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                    {draftSavedAt ? `Borrador guardado localmente · ${draftSavedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'Guardado local automático activo'}
                  </p>
                </div>
                <button type="button" onClick={closeBulkUpload} className="rounded-xl bg-slate-100 p-3 text-slate-500 hover:text-slate-900" aria-label="Cerrar y continuar después"><X size={18} /></button>
              </header>

              <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <button type="button" onClick={downloadBulkTemplate} className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-xs font-black uppercase tracking-widest text-blue-700">
                    <Download size={16} /> Descargar plantilla
                  </button>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-4 text-xs font-black uppercase tracking-widest text-white">
                    <FileSpreadsheet size={16} /> Seleccionar Excel
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[10px] font-bold uppercase leading-relaxed tracking-wider text-slate-500">
                  Escribe directamente o pega cinco columnas desde Excel: Nombre completo, Número de identidad, Dorsal, Año de nacimiento y Vínculo. Vínculos permitidos: Padre de familia, Ex-alumno o Colaborador.
                </div>

                {bulkRows.length > 0 && (
                  <div onPaste={handleBulkPaste} className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-950 text-[9px] font-black uppercase tracking-widest text-white">
                        <tr><th className="p-3">#</th><th className="min-w-56 p-3">Nombre completo</th><th className="min-w-52 p-3">Número de identidad</th><th className="min-w-24 p-3">Dorsal</th><th className="min-w-44 p-3">Año de nacimiento</th><th className="min-w-52 p-3">Vínculo</th><th className="min-w-40 p-3">Validación</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkRows.map((row, index) => (
                          <tr key={`${row.name}-${index}`} className={row.error ? 'bg-red-50' : 'bg-white'}>
                            <td className="p-3 font-black text-slate-400">{index + 1}</td>
                            <td className="p-2"><input value={row.name} onChange={(event) => updateBulkRow(index, 'name', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-black uppercase outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><input type="text" inputMode="numeric" pattern="[0-9]*" value={row.identityNumber} onChange={(event) => updateBulkRow(index, 'identityNumber', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><input type="number" inputMode="numeric" min="1" max="999" value={row.shirtNumber ?? ''} onChange={(event) => updateBulkRow(index, 'shirtNumber', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><input type="number" inputMode="numeric" min="1900" max={new Date().getFullYear()} value={row.birthYear ?? ''} onChange={(event) => updateBulkRow(index, 'birthYear', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><select value={row.vinculo} onChange={(event) => updateBulkRow(index, 'vinculo', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500"><option value="">Seleccionar</option>{ALLOWED_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></td>
                            <td className={`p-3 text-[10px] font-black uppercase ${row.error ? 'text-red-600' : row.name ? 'text-emerald-600' : 'text-slate-300'}`}>{row.error || (row.name ? 'LISTO' : 'FILA VACÍA')}</td>
                            <td className="p-2"><button type="button" onClick={() => setBulkRows(validateBulkRows(bulkRows.filter((_, rowIndex) => rowIndex !== index)))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={`Eliminar fila ${index + 1}`}><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {bulkRows.length > 0 && (
                  <div onPaste={handleBulkPaste} className="space-y-3 md:hidden">
                    {bulkRows.map((row, index) => (
                      <article key={`mobile-${index}`} className={`rounded-2xl border p-4 shadow-sm ${row.error ? 'border-red-300 bg-red-50' : MOBILE_ROW_COLORS[index % MOBILE_ROW_COLORS.length]}`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jugador {index + 1}</p>
                          <button type="button" onClick={() => setBulkRows(validateBulkRows(bulkRows.filter((_, rowIndex) => rowIndex !== index)))} className="rounded-lg p-2 text-red-500 hover:bg-red-100" aria-label={`Eliminar fila ${index + 1}`}><Trash2 size={15} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Nombre completo<input value={row.name} onChange={(event) => updateBulkRow(index, 'name', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-black uppercase text-slate-900 outline-none focus:border-blue-500" /></label>
                          <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Número de identidad<input type="text" inputMode="numeric" pattern="[0-9]*" value={row.identityNumber} onChange={(event) => updateBulkRow(index, 'identityNumber', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold text-slate-900 outline-none focus:border-blue-500" /></label>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dorsal<input type="number" inputMode="numeric" min="1" max="999" value={row.shirtNumber ?? ''} onChange={(event) => updateBulkRow(index, 'shirtNumber', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold text-slate-900 outline-none focus:border-blue-500" /></label>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Año de nacimiento<input type="number" inputMode="numeric" min="1900" max={new Date().getFullYear()} value={row.birthYear ?? ''} onChange={(event) => updateBulkRow(index, 'birthYear', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold text-slate-900 outline-none focus:border-blue-500" /></label>
                          <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Vínculo<select value={row.vinculo} onChange={(event) => updateBulkRow(index, 'vinculo', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold uppercase text-slate-900 outline-none focus:border-blue-500"><option value="">Seleccionar</option>{ALLOWED_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></label>
                        </div>
                        <p className={`mt-3 rounded-xl px-3 py-2 text-[10px] font-black uppercase ${row.error ? 'bg-red-100 text-red-600' : row.name ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>{row.error || (row.name ? 'Registro listo' : 'Fila vacía')}</p>
                      </article>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setBulkRows(validateBulkRows([...bulkRows, emptyBulkRow()]))} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-blue-400 hover:text-blue-600"><Plus size={14} /> Agregar fila</button>
              </div>

              <footer className="flex flex-col gap-3 border-t border-slate-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <button type="button" onClick={discardBulkDraft} className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50">Eliminar borrador</button>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button type="button" onClick={closeBulkUpload} className="rounded-xl bg-slate-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-600">Continuar después</button>
                  <button type="button" disabled={loading || bulkFilledRows.length === 0 || bulkFilledRows.some((row) => row.error)} onClick={submitBulkPlayers} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">Sincronizar jugadores ({bulkFilledRows.length})</button>
                </div>
              </footer>
            </section>
          </div>
        )}

        {selectedHistoryMatch && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.25em]">Línea de tiempo</p>
                  <h2 className="text-2xl font-black uppercase tracking-tight">Historial del partido</h2>
                </div>
                <button onClick={() => setSelectedHistoryMatch(null)} className="bg-slate-100 text-slate-500 hover:text-slate-900 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest">
                  Cerrar
                </button>
              </div>

              <div className="p-5 border-b border-slate-100">
                {renderMatchCard(selectedHistoryMatch)}
              </div>

              <div className="relative max-h-[54vh] overflow-hidden bg-emerald-800">
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      'linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px), repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 2px, transparent 2px 42px)',
                    backgroundSize: '50% 100%, 100% 42px',
                    backgroundPosition: 'center top, center top',
                  }}
                />
                <div className="pointer-events-none absolute inset-x-5 top-5 bottom-5 rounded-[1.5rem] border border-white/25" />
                <div className="pointer-events-none absolute left-1/2 top-5 bottom-5 w-px bg-white/35" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />

                <div className="relative max-h-[54vh] overflow-y-auto p-4 sm:p-5">
                  {(eventsByMatch[selectedHistoryMatch.id] || []).length === 0 ? (
                    <p className="relative text-center text-white text-xs font-black uppercase tracking-widest py-10">No hay goles ni tarjetas registradas</p>
                  ) : (
                    <div className="relative space-y-4">
                      {(eventsByMatch[selectedHistoryMatch.id] || []).map((event: any) => {
                      const isHomeEvent = event.team_id === selectedHistoryMatch.home_team_id;
                      const isAwayEvent = event.team_id === selectedHistoryMatch.away_team_id;
                      const eventCard = (
                        <div className={`rounded-2xl border p-3 shadow-lg shadow-slate-950/10 ${eventAccent(event.event_type)}`}>
                          <div className={`flex items-start justify-between gap-3 ${isHomeEvent ? 'flex-row-reverse text-right' : ''}`}>
                            <div className={`flex items-center gap-3 min-w-0 ${isHomeEvent ? 'flex-row-reverse' : ''}`}>
                              <TeamLogo team={event.teams} className="w-9 h-9" />
                              <div className="min-w-0">
                                <p className="font-black uppercase text-xs sm:text-sm">{eventLabel(event.event_type)}</p>
                                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest opacity-70 truncate">{event.teams?.name || 'Equipo'}</p>
                              </div>
                            </div>
                            <span className="shrink-0 bg-white/80 border border-white rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-widest">
                              {event.period || '--'} {event.minute_record ? `• ${event.minute_record}'` : ''}
                            </span>
                          </div>
                          {event.players?.name && (
                            <p className={`mt-3 text-[11px] sm:text-xs font-black uppercase text-slate-700 ${isHomeEvent ? 'text-right' : ''}`}>
                              #{event.players?.shirt_number || '-'} {event.players.name}
                            </p>
                          )}
                        </div>
                      );

                      return (
                        <div key={event.id} className="relative grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-start gap-1 sm:gap-3">
                          <div>{isHomeEvent ? eventCard : null}</div>
                          <div className="flex flex-col items-center pt-4">
                            <span className={`h-4 w-4 rounded-full border-2 bg-white ${isAwayEvent ? 'border-orange-400' : 'border-blue-400'}`} />
                          </div>
                          <div>{!isHomeEvent ? eventCard : null}</div>
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {data.teams.length === 0 && (
          <section className="rounded-[2rem] border border-amber-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <ShieldCheck size={30} />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Sin equipos asignados</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-slate-500">
              Tu perfil está activo, pero todavía no tiene un equipo asociado. Comunícate con el administrador del torneo para completar la asignación.
            </p>
          </section>
        )}

        <div className="flex overflow-x-auto gap-3 pb-2">
          {data.teams.map((team: any) => (
            <button key={team.id} onClick={() => setSelectedTeamId(team.id)} className={`shrink-0 flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${selectedTeam?.id === team.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'}`}>
              <TeamLogo team={team} className="w-10 h-10" />
              <div>
                <p className="font-black uppercase text-xs">{team.name}</p>
                <p className={`text-[9px] font-black uppercase tracking-widest ${selectedTeam?.id === team.id ? 'text-blue-100' : 'text-slate-400'}`}>{team.categories?.sports?.name} / {team.categories?.name}</p>
              </div>
            </button>
          ))}
        </div>

        {selectedTeam && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <Users className="text-blue-600 mb-2" size={20} />
                <p className="text-2xl font-black">{players.length}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inscritos</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <Trophy className="text-emerald-600 mb-2" size={20} />
                <p className="text-2xl font-black">{totalScoring}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Goles/Puntos</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <Square className="text-yellow-400 fill-yellow-400 mb-2" size={20} />
                <p className="text-2xl font-black">{eventSummary.YELLOW || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Amarillas</p>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                <Square className="text-red-600 fill-red-600 mb-2" size={20} />
                <p className="text-2xl font-black">{eventSummary.RED || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rojas</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                <Activity className="text-slate-700 mb-2" size={20} />
                <p className="text-2xl font-black">${debt.toLocaleString('es-CO')}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Multas</p>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
              <div className="overflow-hidden rounded-[2rem] border border-blue-100 bg-blue-50/35">
                <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/80 p-5">
                  <div>
                    <h2 className="text-lg font-black uppercase">Tabla de posiciones</h2>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Actualizada con partidos finalizados</p>
                  </div>
                  {fullSchedule.some((match: any) => match.status === 'LIVE') && <span className="rounded-full bg-red-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-red-600">En vivo · actualiza cada 15 s</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[650px] w-full text-xs">
                    <thead className="bg-slate-950 text-[9px] font-black uppercase tracking-widest text-white"><tr><th className="p-3 text-left">Pos.</th><th className="p-3 text-left">Equipo</th><th className="p-3">PJ</th><th className="p-3">G</th><th className="p-3">E</th><th className="p-3">P</th><th className="p-3">{sportRules.scoreLabels.for}</th><th className="p-3">{sportRules.scoreLabels.against}</th><th className="p-3">DG</th><th className="p-3">PTS</th></tr></thead>
                    <tbody className="divide-y divide-blue-100 bg-white/85">
                      {standings.map((team: any, index: number) => <tr key={team.id} className={team.id === selectedTeam.id ? 'bg-blue-100/70' : ''}><td className="p-3 font-black text-slate-400">{index + 1}</td><td className="p-3 font-black uppercase">{team.name}</td><td className="p-3 text-center font-bold">{team.played}</td><td className="p-3 text-center font-bold">{team.won}</td><td className="p-3 text-center font-bold">{team.drawn}</td><td className="p-3 text-center font-bold">{team.lost}</td><td className="p-3 text-center font-bold">{team.goals_for}</td><td className="p-3 text-center font-bold">{team.goals_against}</td><td className="p-3 text-center font-bold">{team.goals_for - team.goals_against}</td><td className="p-3 text-center font-black text-blue-600">{team.points}</td></tr>)}
                    </tbody>
                  </table>
                  {standings.length === 0 && <p className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">No hay equipos programados</p>}
                </div>
              </div>

              <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50/45 p-5">
                <h2 className="text-lg font-black uppercase">Estadísticas del equipo</h2>
                <p className="mb-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Rendimiento oficial</p>
                <div className="grid grid-cols-2 gap-3">
                  {[['Posición', selectedStanding ? `${standings.indexOf(selectedStanding) + 1}°` : '-'], ['Partidos', selectedStanding?.played || 0], ['Ganados', selectedStanding?.won || 0], ['Empatados', selectedStanding?.drawn || 0], ['Perdidos', selectedStanding?.lost || 0], ['Diferencia', selectedStanding ? selectedStanding.goals_for - selectedStanding.goals_against : 0]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-indigo-100 bg-white/75 p-4"><p className="text-xl font-black">{value}</p><p className="text-[9px] font-black uppercase tracking-widest text-indigo-400">{label}</p></div>)}
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/45 p-5">
                <h2 className="text-lg font-black uppercase">{sportRules.scoreLabels.scorerPlural} y goleadores</h2>
                <div className="mt-4 divide-y divide-slate-100">
                  {scorers.map((player: any, index: number) => <div key={player.id} className="flex items-center justify-between py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-xs font-black text-emerald-700">{index + 1}</span><div><p className="text-xs font-black uppercase">{player.name}</p><p className="text-[9px] font-bold uppercase text-slate-400">Dorsal #{player.shirtNumber || '-'}</p></div></div><span className="text-xl font-black text-emerald-600">{player.total}</span></div>)}
                  {scorers.length === 0 && <p className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Sin anotaciones registradas</p>}
                </div>
              </div>
              <div className="rounded-[2rem] border border-amber-100 bg-amber-50/45 p-5">
                <h2 className="text-lg font-black uppercase">Tarjetas y sanciones</h2>
                <div className="mt-4 divide-y divide-slate-100">
                  {cardEvents.map((event: any) => <div key={event.id} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><Square size={18} className={event.event_type === 'RED' ? 'fill-red-600 text-red-600' : 'fill-yellow-400 text-yellow-400'} /><div className="min-w-0"><p className="truncate text-xs font-black uppercase">{event.players?.name || 'Jugador sin asignar'}</p><p className="text-[9px] font-bold uppercase text-slate-400">{eventLabel(event.event_type)} · {event.fine_status === 'PAID' ? 'Pagada' : 'Pendiente'}</p></div></div><span className="shrink-0 text-xs font-black">${eventFineAmount(event).toLocaleString('es-CO')}</span></div>)}
                  {cardEvents.length === 0 && <p className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Sin tarjetas ni sanciones</p>}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)] gap-6">
              <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-black uppercase text-xl">Nómina</h2>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {canEditRoster ? 'Inscripción abierta' : 'Inscripción cerrada'}
                    </p>
                  </div>
                  {canEditRoster ? (
                    <button type="button" onClick={openBulkUpload} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700">
                      <FileSpreadsheet size={15} /> Carga masiva
                    </button>
                  ) : <Lock className="text-red-500" />}
                </div>
                {canEditRoster && (
                  <form onSubmit={handleAddPlayer} className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
                    <input required value={newPlayer.name} onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value.toUpperCase() })} placeholder="Nombre completo" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase outline-none focus:border-blue-500 sm:col-span-1 lg:col-span-3" />
                    <input required type="text" inputMode="numeric" pattern="[0-9]*" value={newPlayer.identityNumber} onChange={(e) => setNewPlayer({ ...newPlayer, identityNumber: e.target.value.replace(/\D/g, '') })} placeholder="Número de identidad" minLength={5} maxLength={30} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 sm:col-span-1 lg:col-span-3" />
                    <input required type="number" inputMode="numeric" min="1" max="999" value={newPlayer.shirtNumber} onChange={(e) => setNewPlayer({ ...newPlayer, shirtNumber: e.target.value })} placeholder="Dorsal" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 lg:col-span-1" />
                    <input required type="number" inputMode="numeric" min="1900" max={new Date().getFullYear()} value={newPlayer.birthYear} onChange={(e) => setNewPlayer({ ...newPlayer, birthYear: e.target.value })} placeholder="Año de nacimiento" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 lg:col-span-2" />
                    <select required value={newPlayer.vinculo} onChange={(e) => setNewPlayer({ ...newPlayer, vinculo: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase outline-none focus:border-blue-500 lg:col-span-2">
                      <option value="">Vínculo con el colegio</option>
                      {ALLOWED_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}
                    </select>
                    <button disabled={loading} className="flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 lg:col-span-1"><Plus size={14} /> Agregar</button>
                  </form>
                )}
                <div className="divide-y divide-slate-50">
                  {players.map((player: any) => (
                    <div key={player.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black uppercase text-sm">{player.name}</p>
                        <p className="text-[10px] font-bold text-slate-400">ID {player.identity_number || 'SIN REGISTRAR'} / #{player.shirt_number || '-'} / {player.birth_year || 'Sin año'} / {player.vinculo || 'Sin vínculo'}</p>
                      </div>
                      {canEditRoster && <button onClick={() => handleDeletePlayer(player.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16} /></button>}
                      </div>
                      {player.birth_year && new Date().getFullYear() - Number(player.birth_year) >= 35 && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500"><FileCheck2 size={13} className="text-blue-600" /> Identidad · categoría 35+</p>
                            <span className="text-[9px] font-black uppercase text-slate-400">Privado</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(['IDENTITY_FRONT', 'IDENTITY_BACK'] as const).map((documentType) => {
                              const document = player.player_documents?.find((item: any) => item.document_type === documentType);
                              const label = documentType === 'IDENTITY_FRONT' ? 'Documento frontal' : 'Documento posterior';
                              return (
                                <div key={documentType} className="rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className="text-[10px] font-black uppercase text-slate-700">{label}</p>
                                      <p className={`text-[9px] font-black uppercase ${document?.status === 'APPROVED' ? 'text-emerald-600' : document?.status === 'REJECTED' ? 'text-red-500' : document ? 'text-amber-500' : 'text-slate-400'}`}>
                                        {document?.status === 'APPROVED' ? 'Aprobado' : document?.status === 'REJECTED' ? 'Rechazado' : document ? 'Pendiente' : 'Sin archivo'}
                                      </p>
                                    </div>
                                    {document && <button type="button" onClick={() => openPlayerDocument(player.id, documentType)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" aria-label={`Ver ${label}`}><Eye size={15} /></button>}
                                  </div>
                                  {document?.rejection_reason && <p className="mt-2 text-[9px] font-bold text-red-500">{document.rejection_reason}</p>}
                                  <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white">
                                    <Upload size={12} /> {document ? 'Reemplazar' : 'Subir'}
                                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={loading} onChange={(event) => handlePlayerDocumentUpload(player.id, documentType, event.target.files?.[0])} />
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {players.length === 0 && <p className="p-8 text-center text-slate-400 text-xs font-black uppercase tracking-widest">Sin jugadores inscritos</p>}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-[2rem] p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <TeamLogo team={selectedTeam} className="w-14 h-14" />
                    <div>
                      <h2 className="font-black uppercase text-lg leading-none">Logo</h2>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">{selectedTeam?.name}</p>
                    </div>
                  </div>
                  <label className="block w-full bg-slate-900 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest text-center cursor-pointer">
                    Subir imagen
                    <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={loading} className="hidden" />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <button type="button" onClick={copyPublicTeamLink} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-[9px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100"><ClipboardCopy size={14} /> Copiar enlace para compartir</button>
                    <a href={`/${slug}/equipo/${toTeamSlug(selectedTeam.name)}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"><ExternalLink size={14} /> Abrir resultados del equipo</a>
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Máximo 800 KB. Formatos de imagen.</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-[2rem] p-5 xl:min-w-[360px]">
                  <h2 className="font-black uppercase text-lg mb-4">Partidos del equipo</h2>
                  <div className="space-y-3">
                    {teamUpcomingMatches.map((match: any) => renderMatchCard(match))}
                    {teamUpcomingMatches.length === 0 && <p className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-8">Sin partidos pendientes</p>}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-[2rem] p-5">
                <h2 className="font-black uppercase text-lg mb-4">Historial del equipo</h2>
                <div className="space-y-3">
                  {historyMatches.map((match: any) => (
                    <button key={match.id} onClick={() => setSelectedHistoryMatch(match)} className="w-full text-left block hover:scale-[1.01] transition-transform">
                      {renderMatchCard(match)}
                    </button>
                  ))}
                  {historyMatches.length === 0 && <p className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-8">Aún no hay partidos finalizados</p>}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-[2rem] p-5">
                <h2 className="font-black uppercase text-lg mb-4">Jornadas completas</h2>
                {roundEntries.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                    {roundEntries.map(([round, roundMatches]) => (
                      <button
                        key={round}
                        onClick={() => setActiveRound(round)}
                        className={`shrink-0 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border transition-colors ${selectedRound === round ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300'}`}
                      >
                        {round}
                        <span className={`ml-2 rounded-full px-2 py-0.5 ${selectedRound === round ? 'bg-white/20' : 'bg-white'}`}>{(roundMatches as any[]).length}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {((scheduleRounds[selectedRound] || []) as any[]).map((match) => renderRoundMatchCard(match))}
                  {fullSchedule.length === 0 && <p className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-8">No hay jornadas generadas</p>}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
