'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarDays, Camera, ClipboardCopy, Download, ExternalLink, Eye, FileCheck2, FileSpreadsheet, KeyRound, Lock, LogOut, Plus, ShieldCheck, Square, Trash2, Trophy, Upload, UserRoundCog, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '@/app/lib/sports/rules';
import { toTeamSlug } from '@/app/lib/team-slug';
import { addDelegatePlayers, changeDelegatePassword, deleteDelegatePlayer, getPlayerIdentityDocumentUrl, loginDelegate, logoutDelegate, saveDelegateTeamStaff, uploadDelegateSchoolLogo, uploadPlayerIdentityDocument } from './actions';

type DelegatePortalClientProps = {
  slug: string;
  initialData: any | null;
};

type BulkPlayerRow = {
  name: string;
  identityNumber: string;
  shirtNumber: number | null;
  birthYear: number | null;
  birthDate: string;
  vinculo: string;
  relationshipDetail: string;
  faceFile?: File | null;
  facePreview?: string;
  identityFile?: File | null;
  error?: string;
};

const ALLOWED_RELATIONSHIPS = ['PADRE DE FAMILIA', 'EX-ALUMNO', 'COLABORADOR'] as const;
const emptyBulkRow = (): BulkPlayerRow => ({ name: '', identityNumber: '', shirtNumber: null, birthYear: null, birthDate: '', vinculo: '', relationshipDetail: '' });
const MOBILE_ROW_COLORS = [
  'border-blue-200 bg-blue-50/80',
  'border-emerald-200 bg-emerald-50/80',
  'border-amber-200 bg-amber-50/80',
  'border-violet-200 bg-violet-50/80',
  'border-cyan-200 bg-cyan-50/80',
] as const;
const MAX_COMPRESSED_IMAGE_BYTES = 1024 * 1024;

async function compressRosterImage(file: File) {
  if (!file.type.startsWith('image/') || file.size <= MAX_COMPRESSED_IMAGE_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.86;
  let blob: Blob | null = null;
  while (quality >= 0.35) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_COMPRESSED_IMAGE_BYTES) break;
    quality -= 0.1;
  }
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

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

function ageOnDate(birthDate: string | null | undefined, referenceDate: string | null | undefined) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const reference = new Date(`${referenceDate || `${new Date().getFullYear()}-12-31`}T12:00:00`);
  let age = reference.getFullYear() - birth.getFullYear();
  if (reference.getMonth() < birth.getMonth() || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())) age -= 1;
  return age;
}

function BirthDateCards({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'YEAR' | 'MONTH' | 'DAY'>('YEAR');
  const [year = '', month = '', day = ''] = value.split('-');
  const days = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const displayValue = year && month && day ? `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}` : 'Seleccionar fecha';
  const chooseYear = (nextYear: number) => { onChange(`${nextYear}--`); setStep('MONTH'); };
  const chooseMonth = (nextMonth: number) => { onChange(`${year}-${String(nextMonth).padStart(2, '0')}-`); setStep('DAY'); };
  const chooseDay = (nextDay: number) => { onChange(`${year}-${month.padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`); setOpen(false); setStep('YEAR'); };
  const openPicker = () => { setStep(year ? month ? 'DAY' : 'MONTH' : 'YEAR'); setOpen(true); };

  return <div className="relative">
    <button type="button" onClick={openPicker} className={`flex w-full items-center justify-between rounded-xl border border-blue-100 bg-white font-black text-slate-800 outline-none transition-colors hover:border-blue-400 ${compact ? 'px-3 py-2.5 text-[10px]' : 'px-4 py-3 text-xs'}`}>
      <span>{displayValue}</span><CalendarDays size={compact ? 13 : 16} className="text-blue-600" />
    </button>
    {open && <div className={`absolute z-[80] mt-2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl ${compact ? 'left-1/2 w-[330px] -translate-x-1/2' : 'left-0 w-full min-w-[300px]'}`}>
      <div className="flex items-center justify-between border-b border-blue-50 bg-blue-50 px-4 py-3">
        <div><p className="text-[8px] font-black uppercase tracking-widest text-blue-500">Fecha de nacimiento</p><p className="text-xs font-black uppercase">{step === 'YEAR' ? 'Selecciona el año' : step === 'MONTH' ? `Año ${year} · selecciona el mes` : `${monthNames[Number(month) - 1]} ${year} · selecciona el día`}</p></div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-white p-2 text-slate-400"><X size={14} /></button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3">
        {step === 'YEAR' && <div className="grid grid-cols-4 gap-2">{Array.from({ length: new Date().getFullYear() - 1899 }, (_, index) => new Date().getFullYear() - index).map((item) => <button type="button" key={item} onClick={() => chooseYear(item)} className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-3 text-xs font-black hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">{item}</button>)}</div>}
        {step === 'MONTH' && <div className="grid grid-cols-3 gap-2">{monthNames.map((name, index) => <button type="button" key={name} onClick={() => chooseMonth(index + 1)} className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-4 text-xs font-black hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">{name}</button>)}</div>}
        {step === 'DAY' && <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: days }, (_, index) => index + 1).map((item) => <button type="button" key={item} onClick={() => chooseDay(item)} className="aspect-square rounded-lg border border-slate-100 bg-slate-50 text-[10px] font-black hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">{item}</button>)}</div>}
      </div>
      {step !== 'YEAR' && <button type="button" onClick={() => setStep(step === 'DAY' ? 'MONTH' : 'YEAR')} className="w-full border-t border-slate-100 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-blue-600">Volver a {step === 'DAY' ? 'meses' : 'años'}</button>}
    </div>}
  </div>;
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
  const [staffForm, setStaffForm] = useState({ headCoach: '', assistantCoach: '' });
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
  const fixtureVisibleToDelegates = Boolean(selectedCategory?.tournaments?.fixture_visible_to_delegates);
  const canEditRoster = selectedTeam && isRegistrationOpen(selectedCategory);
  const players = data?.playersByTeam?.[selectedTeam?.id] || [];
  const teamStaff = data?.staffByTeam?.[selectedTeam?.id] || [];
  const bulkFilledRows = bulkRows.filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail);
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
    setStaffForm({
      headCoach: teamStaff.find((member: any) => member.role === 'HEAD_COACH')?.full_name || '',
      assistantCoach: teamStaff.find((member: any) => member.role === 'ASSISTANT_COACH')?.full_name || '',
    });
  }, [selectedTeam?.id]);

  const bulkDraftKey = selectedTeam?.id ? `sportscore:delegate:${slug}:bulk-roster:${selectedTeam.id}` : '';

  useEffect(() => {
    if (!showBulkUpload || !bulkDraftKey || bulkRows.length === 0) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(bulkDraftKey, JSON.stringify({ version: 2, updatedAt: Date.now(), rows: bulkRows.map(({ faceFile, facePreview, identityFile, ...row }) => row) }));
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

  const handleSaveStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTeam) return;
    setLoading(true);
    const result = await saveDelegateTeamStaff(slug, selectedTeam.id, staffForm);
    setLoading(false);
    if (!result.success) return toast.error(result.error);
    toast.success('Cuerpo técnico guardado');
    window.location.reload();
  };

  const normalizeExcelHeader = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  const validateBulkRows = (rows: BulkPlayerRow[]) => {
    const normalized = rows.map((row) => ({
      ...row,
      name: row.name.trim().toUpperCase(),
      identityNumber: row.identityNumber.trim().replace(/\D/g, ''),
      vinculo: row.vinculo.trim().toUpperCase(),
      relationshipDetail: row.relationshipDetail.trim().toUpperCase(),
      error: undefined,
    }));
    const meaningfulRows = normalized.filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail);

    return normalized.map((row) => {
      if (!row.name && !row.identityNumber && !row.shirtNumber && !row.birthDate && !row.vinculo && !row.relationshipDetail) return row;
      const errors: string[] = [];
      if (!row.name) errors.push('Falta nombre');
      if (row.identityNumber.length < 5 || row.identityNumber.length > 30) errors.push('Identidad inválida');
      if (!Number.isInteger(row.shirtNumber) || Number(row.shirtNumber) < 1 || Number(row.shirtNumber) > 999) errors.push('Dorsal inválido');
      if (!row.birthDate || Number.isNaN(Date.parse(row.birthDate))) errors.push('Fecha inválida');
      if (!ALLOWED_RELATIONSHIPS.includes(row.vinculo as typeof ALLOWED_RELATIONSHIPS[number])) errors.push('Vínculo inválido');
      if (row.vinculo === 'EX-ALUMNO' && !/^\d{4}$/.test(row.relationshipDetail)) errors.push('Falta promoción');
      if (row.vinculo === 'PADRE DE FAMILIA' && row.relationshipDetail.length < 5) errors.push('Falta estudiante');
      if (!row.faceFile) errors.push('Falta foto');
      if (!row.identityFile) errors.push('Falta documento');
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
      ...(field === 'vinculo' ? { relationshipDetail: '' } : {}),
    } : row);
    setBulkRows(validateBulkRows(rows));
  };

  const updateBulkFile = async (index: number, field: 'faceFile' | 'identityFile', file?: File) => {
    if (!file) return;
    if (field === 'identityFile' && file.type === 'application/pdf' && file.size > MAX_COMPRESSED_IMAGE_BYTES) return toast.error('El PDF debe pesar máximo 1 MB. Las imágenes sí se comprimen automáticamente.');
    setLoading(true);
    try {
      const processed = file.type.startsWith('image/') ? await compressRosterImage(file) : file;
      if (processed.size > MAX_COMPRESSED_IMAGE_BYTES) return toast.error('No fue posible comprimir el archivo a 1 MB. Usa una imagen más liviana.');
      const rows = bulkRows.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        [field]: processed,
        ...(field === 'faceFile' ? { facePreview: URL.createObjectURL(processed) } : {}),
      } : row);
      setBulkRows(validateBulkRows(rows));
      if (processed.size < file.size) toast.success(`Imagen comprimida a ${Math.ceil(processed.size / 1024)} KB`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo procesar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line): BulkPlayerRow => {
      const [name = '', identityNumber = '', shirtNumber = '', birthDate = '', vinculo = '', relationshipDetail = ''] = line.split('\t');
      return {
        name,
        identityNumber,
        shirtNumber: shirtNumber ? Number(shirtNumber) : null,
        birthYear: birthDate ? Number(birthDate.slice(0, 4)) : null,
        birthDate,
        vinculo,
        relationshipDetail,
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
        'FECHA DE NACIMIENTO': '1985-05-20',
        'VINCULO CON EL COLEGIO': 'EX-ALUMNO',
        'PROMOCION O NOMBRE DEL ESTUDIANTE': '2003',
      },
    ]);
    worksheet['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 38 }];
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
        const birthDate = String(row['FECHA DE NACIMIENTO'] || '').trim();
        const birthYear = Number(birthDate.slice(0, 4));
        const vinculo = String(row['VINCULO CON EL COLEGIO'] || '').trim().toUpperCase();
        const relationshipDetail = String(row['PROMOCION O NOMBRE DEL ESTUDIANTE'] || '').trim().toUpperCase();
        return { name, identityNumber, shirtNumber: shirtNumber || null, birthYear: birthYear || null, birthDate, vinculo, relationshipDetail };
      }).filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail);

      if (parsedRows.length === 0) return toast.error('El archivo no contiene jugadores.');
      setBulkRows(validateBulkRows([...parsedRows, ...Array.from({ length: Math.max(0, 8 - parsedRows.length) }, emptyBulkRow)]));
    } catch {
      toast.error('No se pudo leer el archivo Excel.');
    }
  };

  const submitBulkPlayers = async () => {
    const playersToInsert = bulkRows.filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail);
    if (!selectedTeam || playersToInsert.length === 0 || playersToInsert.some((row) => row.error)) return;
    setLoading(true);
    const result = await addDelegatePlayers(slug, selectedTeam.id, playersToInsert.map((row) => ({
      name: row.name,
      identityNumber: row.identityNumber,
      shirtNumber: row.shirtNumber,
      birthYear: row.birthYear,
      birthDate: row.birthDate,
      vinculo: row.vinculo,
      relationshipDetail: row.relationshipDetail,
    })));
    setLoading(false);
    if (!result.success) return toast.error(result.error);
    setLoading(true);
    const uploads = playersToInsert.flatMap((row, index) => {
      const playerId = result.data.playerIds[index];
      return [
        uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, 'FACE_PHOTO', row.faceFile as File),
        uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, 'IDENTITY_FRONT', row.identityFile as File),
      ];
    });
    const uploadResults = await Promise.all(uploads);
    setLoading(false);
    if (uploadResults.some((upload) => !upload.success)) toast.error('Los jugadores fueron creados, pero algunos archivos no pudieron cargarse.');
    else toast.success(`${result.data.inserted} jugadores y documentos inscritos`);
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
        window.localStorage.setItem(bulkDraftKey, JSON.stringify({ version: 2, updatedAt: Date.now(), rows: bulkRows.map(({ faceFile, facePreview, identityFile, ...row }) => row) }));
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

  const handlePlayerDocumentUpload = async (playerId: string, documentType: 'FACE_PHOTO' | 'IDENTITY_FRONT' | 'IDENTITY_BACK', file?: File) => {
    if (!selectedTeam || !file) return;
    setLoading(true);
    const result = await uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, documentType, file);
    if (!result.success) toast.error(result.error);
    else { toast.success('Documento enviado para revisión'); window.location.reload(); }
    setLoading(false);
  };

  const openPlayerDocument = async (playerId: string, documentType: 'FACE_PHOTO' | 'IDENTITY_FRONT' | 'IDENTITY_BACK') => {
    if (!selectedTeam) return;
    const result = await getPlayerIdentityDocumentUrl(slug, selectedTeam.id, playerId, documentType);
    if (!result.success) return toast.error(result.error);
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  const renderTeamMark = (team: any) => (
    <TeamLogo team={team} className="h-16 w-16 rounded-2xl sm:h-20 sm:w-20" />
  );

  const renderMatchCard = (match: any, compact = false) => (
    <div key={match.id} className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
      <p className="mb-4 flex items-center justify-center gap-1 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">
        <CalendarDays size={12} /> {match.matchdays?.scheduled_date || 'Sin fecha'} / {match.scheduled_time?.slice(0, 5) || '--:--'}
      </p>
      <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5 ${compact ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          {renderTeamMark(match.home_team)}
          <span className="w-full break-words font-black uppercase leading-tight">{match.home_team?.name}</span>
        </div>
        <div className="min-w-[58px] self-center rounded-xl bg-slate-900 px-3 py-3 text-center text-sm font-black text-white sm:min-w-[72px] sm:px-4">
          {match.status !== 'SCHEDULED' ? `${match.home_score || 0} - ${match.away_score || 0}` : 'VS'}
        </div>
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          {renderTeamMark(match.away_team)}
          <span className="w-full break-words font-black uppercase leading-tight">{match.away_team?.name}</span>
        </div>
      </div>
      <p className={`mt-4 text-center text-[9px] font-black uppercase tracking-widest ${match.status === 'LIVE' ? 'text-red-500' : 'text-slate-400'}`}>{matchStatusLabel(match.status)}</p>
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
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Planilla de inscripción</p>
                  <h2 id="bulk-upload-title" className="text-xl font-black uppercase tracking-tight sm:text-2xl">Inscribir jugadores y documentos</h2>
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
                  Escribe directamente o pega seis columnas desde Excel: Nombre completo, Número de identidad, Dorsal, Fecha de nacimiento, Vínculo y Promoción/Estudiante. Después de sincronizar debes cargar la foto y el documento de cada jugador para habilitarlo.
                </div>

                {bulkRows.length > 0 && (
                  <div onPaste={handleBulkPaste} className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-950 text-[9px] font-black uppercase tracking-widest text-white">
                        <tr className="text-center"><th className="p-3">#</th><th className="p-3">Foto</th><th className="min-w-56 p-3">Nombre completo</th><th className="min-w-52 p-3">Número de identidad</th><th className="min-w-24 p-3">Dorsal</th><th className="min-w-44 p-3">Fecha de nacimiento</th><th className="min-w-52 p-3">Vínculo</th><th className="min-w-60 p-3">Promoción / Estudiante</th><th className="min-w-52 p-3">Documento</th><th className="min-w-40 p-3">Validación</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkRows.map((row, index) => (
                          <tr key={`${row.name}-${index}`} className={row.error ? 'bg-red-50' : 'bg-white'}>
                            <td className="p-3 font-black text-slate-400">{index + 1}</td>
                            <td className="p-2"><label title="Subir foto del rostro" className="relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-cyan-300 bg-cyan-50 text-cyan-600">{row.facePreview ? <img src={row.facePreview} alt="Rostro" className="h-full w-full object-cover" /> : <Camera size={18} />}<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" onChange={(event) => updateBulkFile(index, 'faceFile', event.target.files?.[0])} /></label></td>
                            <td className="p-2"><input value={row.name} onChange={(event) => updateBulkRow(index, 'name', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-black uppercase outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><input type="text" inputMode="numeric" pattern="[0-9]*" value={row.identityNumber} onChange={(event) => updateBulkRow(index, 'identityNumber', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><input type="number" inputMode="numeric" min="1" max="999" value={row.shirtNumber ?? ''} onChange={(event) => updateBulkRow(index, 'shirtNumber', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><BirthDateCards compact value={row.birthDate} onChange={(value) => updateBulkRow(index, 'birthDate', value)} /></td>
                            <td className="p-2"><select value={row.vinculo} onChange={(event) => updateBulkRow(index, 'vinculo', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500"><option value="">Seleccionar</option>{ALLOWED_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></td>
                            <td className="p-2">{(row.vinculo === 'PADRE DE FAMILIA' || row.vinculo === 'EX-ALUMNO') && <input type={row.vinculo === 'EX-ALUMNO' ? 'number' : 'text'} inputMode={row.vinculo === 'EX-ALUMNO' ? 'numeric' : undefined} placeholder={row.vinculo === 'EX-ALUMNO' ? 'Año de promoción' : 'Nombre completo del estudiante'} value={row.relationshipDetail} onChange={(event) => updateBulkRow(index, 'relationshipDetail', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold uppercase outline-none focus:border-blue-500" />}</td>
                            <td className="p-2"><label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 font-black uppercase ${row.identityFile ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}><FileCheck2 size={14} /> {row.identityFile ? 'Cargado' : 'Subir'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => updateBulkFile(index, 'identityFile', event.target.files?.[0])} /></label></td>
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
                          <label className="col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-cyan-200 bg-white p-3 text-[10px] font-black uppercase tracking-wider text-cyan-700"><span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-cyan-50">{row.facePreview ? <img src={row.facePreview} alt="Rostro" className="h-full w-full object-cover" /> : <Camera size={20} />}</span>{row.faceFile ? 'Cambiar foto del rostro' : 'Agregar foto del rostro'}<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" onChange={(event) => updateBulkFile(index, 'faceFile', event.target.files?.[0])} /></label>
                          <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Número de identidad<input type="text" inputMode="numeric" pattern="[0-9]*" value={row.identityNumber} onChange={(event) => updateBulkRow(index, 'identityNumber', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold text-slate-900 outline-none focus:border-blue-500" /></label>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dorsal<input type="number" inputMode="numeric" min="1" max="999" value={row.shirtNumber ?? ''} onChange={(event) => updateBulkRow(index, 'shirtNumber', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold text-slate-900 outline-none focus:border-blue-500" /></label>
                          <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Fecha de nacimiento · año, mes y día<div className="mt-1.5"><BirthDateCards value={row.birthDate} onChange={(value) => updateBulkRow(index, 'birthDate', value)} /></div></label>
                          <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Vínculo<select value={row.vinculo} onChange={(event) => updateBulkRow(index, 'vinculo', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold uppercase text-slate-900 outline-none focus:border-blue-500"><option value="">Seleccionar</option>{ALLOWED_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></label>
                          {row.vinculo !== 'COLABORADOR' && row.vinculo && <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">{row.vinculo === 'EX-ALUMNO' ? 'Año de la promoción' : 'Nombre completo del estudiante'}<input type={row.vinculo === 'EX-ALUMNO' ? 'number' : 'text'} inputMode={row.vinculo === 'EX-ALUMNO' ? 'numeric' : undefined} value={row.relationshipDetail} onChange={(event) => updateBulkRow(index, 'relationshipDetail', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-bold uppercase text-slate-900 outline-none focus:border-blue-500" /></label>}
                          <label className={`col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-wider ${row.identityFile ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-indigo-200 bg-white text-indigo-700'}`}><FileCheck2 size={16} /> {row.identityFile ? row.identityFile.name : 'Agregar documento de identidad'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => updateBulkFile(index, 'identityFile', event.target.files?.[0])} /></label>
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

            <section className="rounded-[2rem] border border-violet-100 bg-violet-50/50 p-5">
              <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-violet-600 p-3 text-white"><UserRoundCog size={20} /></div><div><h2 className="text-lg font-black uppercase">Cuerpo técnico</h2><p className="text-[9px] font-black uppercase tracking-widest text-violet-500">Inscripción oficial de la delegación</p></div></div>
              <form onSubmit={handleSaveStaff} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Técnico<input required value={staffForm.headCoach} onChange={(event) => setStaffForm({ ...staffForm, headCoach: event.target.value.toUpperCase() })} placeholder="Nombre completo del técnico" className="mt-1.5 w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-xs font-bold uppercase outline-none focus:border-violet-500" /></label>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Asistente técnico<input required value={staffForm.assistantCoach} onChange={(event) => setStaffForm({ ...staffForm, assistantCoach: event.target.value.toUpperCase() })} placeholder="Nombre completo del asistente" className="mt-1.5 w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-xs font-bold uppercase outline-none focus:border-violet-500" /></label>
                <button disabled={loading || !canEditRoster} className="self-end rounded-xl bg-violet-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">Guardar</button>
              </form>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,1fr)]">
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
                      <FileSpreadsheet size={15} /> Inscribir jugadores
                    </button>
                  ) : <Lock className="text-red-500" />}
                </div>
                {canEditRoster && (
                  <button type="button" onClick={openBulkUpload} className="flex w-full items-center justify-center gap-2 border-b border-slate-100 bg-blue-50 px-5 py-5 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100"><FileSpreadsheet size={17} /> Abrir planilla de inscripción</button>
                )}
                <div className="divide-y divide-slate-50">
                  {players.map((player: any) => (
                    <div key={player.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black uppercase text-sm">{player.name}</p>
                        <p className="text-[10px] font-bold text-slate-400">ID {player.identity_number || 'SIN REGISTRAR'} / #{player.shirt_number || '-'} / {player.birth_date || player.birth_year || 'Sin fecha'} / {ageOnDate(player.birth_date, selectedCategory?.tournaments?.schedule_dates?.[0]) ?? '-'} años en el torneo / {player.vinculo || 'Sin vínculo'}{player.relationship_detail ? ` · ${player.relationship_detail}` : ''}</p>
                      </div>
                      {canEditRoster && <button onClick={() => handleDeletePlayer(player.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16} /></button>}
                      </div>
                      {(
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500"><FileCheck2 size={13} className="text-blue-600" /> Foto y documento obligatorios</p>
                            <span className={`text-[9px] font-black uppercase ${player.player_documents?.some((item: any) => item.document_type === 'FACE_PHOTO') && player.player_documents?.some((item: any) => item.document_type === 'IDENTITY_FRONT') ? 'text-emerald-600' : 'text-red-500'}`}>{player.player_documents?.some((item: any) => item.document_type === 'FACE_PHOTO') && player.player_documents?.some((item: any) => item.document_type === 'IDENTITY_FRONT') ? 'Expediente completo' : 'No habilitado'}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(['FACE_PHOTO', 'IDENTITY_FRONT'] as const).map((documentType) => {
                              const document = player.player_documents?.find((item: any) => item.document_type === documentType);
                              const label = documentType === 'FACE_PHOTO' ? 'Fotografía del rostro' : 'Documento de identidad';
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
                                    <input type="file" accept={documentType === 'FACE_PHOTO' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} capture={documentType === 'FACE_PHOTO' ? 'user' : undefined} className="hidden" disabled={loading} onChange={(event) => handlePlayerDocumentUpload(player.id, documentType, event.target.files?.[0])} />
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

                {fixtureVisibleToDelegates ? <div className="rounded-[2rem] border border-slate-200 bg-white p-5 xl:min-w-[420px]">
                  <h2 className="font-black uppercase text-lg mb-4">Partidos del equipo</h2>
                  <div className="space-y-3">
                    {teamUpcomingMatches.map((match: any) => renderMatchCard(match))}
                    {teamUpcomingMatches.length === 0 && <p className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-8">Sin partidos pendientes</p>}
                  </div>
                </div> : <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-6 text-center xl:min-w-[420px]"><Lock className="mx-auto text-indigo-400" size={24} /><h2 className="mt-3 text-sm font-black uppercase text-indigo-800">Fixture pendiente de publicación</h2><p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-indigo-400">La organización lo habilitará cuando esté confirmado.</p></div>}
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

              {fixtureVisibleToDelegates && <div className="bg-white border border-slate-200 rounded-[2rem] p-5">
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
              </div>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
