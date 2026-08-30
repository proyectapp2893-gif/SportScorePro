'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarDays, Camera, CheckCircle2, ChevronDown, CircleHelp, ClipboardCopy, Download, ExternalLink, Eye, FileCheck2, FileSpreadsheet, KeyRound, LoaderCircle, Lock, LogOut, Pencil, Plus, ShieldCheck, Square, Trash2, Trophy, Upload, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '@/app/lib/sports/rules';
import { toTeamSlug } from '@/app/lib/team-slug';
import { DEFAULT_ROSTER_LOCKED_MESSAGE } from '@/app/lib/registration';
import { addDelegatePlayers, changeDelegatePassword, copyTeamRosterFromTournament, deleteDelegatePlayer, getPlayerIdentityDocumentUrl, loginDelegate, logoutDelegate, saveDelegateTeamStaff, saveDelegateMatchLineup, updateDelegatePlayer, uploadDelegateSchoolLogo, uploadPlayerIdentityDocument, uploadPlayerFinePaymentProof } from './actions';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import { addDemoDocument, addDemoPlayers, deleteDemoPlayer, saveDemoStaff, updateDemoPlayer } from '@/app/lib/demo/actions';
import { confirmDialog } from '@/app/components/AppDialog';
import { normalizePlayerBirthDate } from '@/app/lib/players/date';
import { formatCopAmount } from '@/app/lib/formatters';
import FormationBoard from '@/app/components/FormationBoard';
import { getFootball9Formation } from '@/app/lib/sports/formations';

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
const BULK_DRAFT_DB_NAME = 'sportscore-delegate-drafts';
const BULK_DRAFT_STORE = 'bulk-rosters';

function openBulkDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(BULK_DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BULK_DRAFT_STORE)) request.result.createObjectStore(BULK_DRAFT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveBulkDraftFiles(key: string, rows: BulkPlayerRow[]) {
  const database = await openBulkDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(BULK_DRAFT_STORE, 'readwrite');
    const storableRows = rows.map(({ facePreview: _facePreview, ...row }) => row);
    transaction.objectStore(BULK_DRAFT_STORE).put({ version: 3, updatedAt: Date.now(), rows: storableRows }, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function loadBulkDraftFiles(key: string) {
  const database = await openBulkDraftDatabase();
  const draft = await new Promise<any>((resolve, reject) => {
    const transaction = database.transaction(BULK_DRAFT_STORE, 'readonly');
    const request = transaction.objectStore(BULK_DRAFT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return draft;
}

async function deleteBulkDraftFiles(key: string) {
  const database = await openBulkDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(BULK_DRAFT_STORE, 'readwrite');
    transaction.objectStore(BULK_DRAFT_STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function restoreBulkFilePreviews(rows: BulkPlayerRow[]) {
  return rows.map((row) => ({
    ...row,
    facePreview: row.faceFile instanceof File ? URL.createObjectURL(row.faceFile) : undefined,
  }));
}

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

function registrationDeadlineLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha límite';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha límite';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function registrationCountdown(value: string | null | undefined) {
  if (!value) return { label: 'Sin fecha límite', className: 'bg-slate-200 text-slate-600' };
  const deadline = new Date(value).getTime();
  if (Number.isNaN(deadline)) return { label: 'Sin fecha límite', className: 'bg-slate-200 text-slate-600' };
  const remainingMilliseconds = deadline - Date.now();
  if (remainingMilliseconds <= 0) return { label: 'Plazo vencido', className: 'bg-red-600 text-white' };
  const remainingDays = Math.ceil(remainingMilliseconds / 86_400_000);
  if (remainingDays <= 3) return { label: `Faltan ${remainingDays} ${remainingDays === 1 ? 'día' : 'días'}`, className: 'bg-red-600 text-white' };
  return { label: `Faltan ${remainingDays} días`, className: 'bg-amber-500 text-white' };
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

function phaseForRound(roundNumber: number) {
  if (roundNumber === 100 || roundNumber >= 201) return 3;
  if (roundNumber >= 101) return 2;
  return 1;
}

function ageOnDate(birthDate: string | null | undefined, referenceDate: string | null | undefined) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const reference = new Date(`${referenceDate || `${new Date().getFullYear()}-12-31`}T12:00:00`);
  let age = reference.getFullYear() - birth.getFullYear();
  if (reference.getMonth() < birth.getMonth() || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())) age -= 1;
  return age;
}

function playerDossierStatus(documents: any[] | null | undefined) {
  const required = ['FACE_PHOTO', 'IDENTITY_FRONT'].map((type) => documents?.find((item: any) => item.document_type === type));
  if (required.some((document) => !document)) return { label: 'Faltan archivos', className: 'text-red-500' };
  if (required.some((document) => document.status === 'REJECTED')) return { label: 'Requiere corrección', className: 'text-red-500' };
  if (required.every((document) => document.status === 'APPROVED')) return { label: 'Expediente aprobado', className: 'text-emerald-600' };
  return { label: 'Carga completa · pendiente de revisión', className: 'text-amber-600' };
}

function normalizePastedDate(rawValue: string) {
  return normalizePlayerBirthDate(rawValue) || null;
  /*
  const raw = rawValue.trim();
  const digits = raw.replace(/\D/g, '');
  const currentYear = new Date().getFullYear();
  const isValid = (year: number, month: number, day: number) => {
    const candidate = new Date(year, month - 1, day);
    return year >= 1900 && year <= currentYear && month >= 1 && month <= 12 && day >= 1
      && candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
  };
  const candidates: Array<[number, number, number]> = [];
  const separated = raw.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (separated) {
    const first = Number(separated[1]); const second = Number(separated[2]); const third = Number(separated[3]);
    if (separated[1].length === 4) {
      candidates.push([first, second, third], [first, third, second]);
    } else if (separated[3].length === 4) {
      candidates.push([third, second, first], [third, first, second]);
    }
  } else if (digits.length === 8) {
    candidates.push(
      [Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2))],
      [Number(digits.slice(4, 8)), Number(digits.slice(0, 2)), Number(digits.slice(2, 4))],
      [Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8))],
      [Number(digits.slice(0, 4)), Number(digits.slice(6, 8)), Number(digits.slice(4, 6))],
    );
  }
  const interpreted = candidates.find(([year, month, day]) => isValid(year, month, day));
  if (!interpreted) return null;
  const [year, month, day] = interpreted;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  */
}

function BirthDateCards({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }) {
  const [manualValue, setManualValue] = useState('');
  const [year = '', month = '', day = ''] = value.split('-');
  useEffect(() => {
    if (year && month && day) setManualValue(`${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`);
    else if (!value) setManualValue('');
  }, [day, month, value, year]);
  const handleManualDate = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const normalized = normalizePastedDate(raw);
    if (normalized) {
      const [normalizedYear, normalizedMonth, normalizedDay] = normalized.split('-');
      setManualValue(`${normalizedDay}/${normalizedMonth}/${normalizedYear}`);
      onChange(normalized);
    } else setManualValue(digits);
  };
  const interpreted = Boolean(normalizePastedDate(manualValue));
  const completeButInvalid = manualValue.replace(/\D/g, '').length === 8 && !interpreted;

  return <div>
    <input
      type="text"
      inputMode="numeric"
      value={manualValue}
      onChange={(event) => handleManualDate(event.target.value)}
      onPaste={(event) => { event.preventDefault(); handleManualDate(event.clipboardData.getData('text')); }}
      placeholder="DDMMAAAA"
      maxLength={10}
      aria-label="Escribir fecha de nacimiento"
      className={`w-full rounded-xl border bg-white px-3 text-center font-bold text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 ${interpreted ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100' : completeButInvalid ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-blue-200 focus:border-blue-400 focus:ring-blue-100'} ${compact ? 'py-2.5 text-[10px]' : 'py-3 text-xs'}`}
    />
    <p className={`mt-1 text-center text-[8px] font-black uppercase tracking-wider ${interpreted ? 'text-emerald-600' : completeButInvalid ? 'text-red-500' : 'text-slate-400'}`}>{interpreted ? 'Fecha interpretada correctamente' : completeButInvalid ? 'Fecha no válida' : 'Escribe día, mes y año'}</p>
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
  const isDemo = slug === DEMO_SLUG;
  const router = useRouter();
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [data, setData] = useState<any | null>(initialData);
  const [selectedTeamId, setSelectedTeamId] = useState(initialData?.teams?.[0]?.id || '');
  const [staffForm, setStaffForm] = useState({ headCoach: '', assistantCoach: '' });
  const [logoUrl, setLogoUrl] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [activeRound, setActiveRound] = useState('');
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showStaffEditor, setShowStaffEditor] = useState(false);
  const [selectedHistoryMatch, setSelectedHistoryMatch] = useState<any | null>(null);
  const [selectedStatDetail, setSelectedStatDetail] = useState<'GOALS' | 'YELLOW' | 'RED' | 'DEBT' | null>(null);
  const [selectedFineEvent, setSelectedFineEvent] = useState<any | null>(null);
  const [lineupMatch, setLineupMatch] = useState<any | null>(null);
  const [lineupSelection, setLineupSelection] = useState<string[]>([]);
  const [lineupFormation, setLineupFormation] = useState('3-3-2');
  const [lineupAssignments, setLineupAssignments] = useState<Record<string, string | undefined>>({});
  const [savedDefaultLineup, setSavedDefaultLineup] = useState<{ formation: string; players: string[] } | null>(null);
  const [, setLineupPhotoUrls] = useState<Record<string, string>>({});
  const lineupPhotoCache = useRef(new Map<string, string>());
  const lineupPhotoRequests = useRef(new Map<string, Promise<void>>());
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showRegistrationModule, setShowRegistrationModule] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkPlayerRow[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoSyncingRow, setAutoSyncingRow] = useState<number | null>(null);
  const [autoSyncFailureCount, setAutoSyncFailureCount] = useState(0);
  const [autoSyncRetryVersion, setAutoSyncRetryVersion] = useState(0);
  const [editingPlayer, setEditingPlayer] = useState<any | null>(null);
  const [rosterEditMode, setRosterEditMode] = useState(false);
  const [showRegistrationGuide, setShowRegistrationGuide] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceTeamId, setTransferSourceTeamId] = useState('');
  const [editPlayerForm, setEditPlayerForm] = useState({ name: '', identityNumber: '', shirtNumber: '', birthDate: '', vinculo: '', relationshipDetail: '' });
  const failedAutoSyncRows = useRef(new Set<string>());

  const selectedTeam = data?.teams?.find((team: any) => team.id === selectedTeamId) || data?.teams?.[0];
  const selectedCategory = selectedTeam?.categories;
  const categoryDescriptor = `${selectedCategory?.name || ''} ${selectedCategory?.sports?.name || ''} ${selectedCategory?.format || ''} ${selectedCategory?.modality || ''} ${selectedCategory?.players_per_side || ''}`.toUpperCase();
  const isFootball9Category = selectedCategory?.tournaments?.sport_modality === 'SOCCER_9' || /F(?:Ú|U)TBOL\s*9|FOOTBALL\s*9|\b9\s*(?:JUGADORES|PLAYERS)\b/.test(categoryDescriptor) || Number(selectedCategory?.players_per_side) === 9;
  const teamTournamentCount = new Set((data?.teams || []).map((team: any) => team.categories?.tournaments?.id || team.categories?.tournaments?.name).filter(Boolean)).size;
  const fixtureVisibleToDelegates = Boolean(selectedCategory?.tournaments?.fixture_visible_to_delegates);
  const canEditRoster = selectedTeam && isRegistrationOpen(selectedCategory);
  const transferableTeams = (data?.teams || []).filter((team: any) => team.id !== selectedTeam?.id && team.school_id === selectedTeam?.school_id);
  const players = data?.playersByTeam?.[selectedTeam?.id] || [];
  const teamStaff = data?.staffByTeam?.[selectedTeam?.id] || [];
  const bulkFilledRows = bulkRows.filter((row) => row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail);
  const firstEmptyBulkRowIndex = bulkRows.findIndex((row) => !row.name && !row.identityNumber && !row.shirtNumber && !row.birthDate && !row.vinculo && !row.relationshipDetail);
  const bulkInvalidRows = bulkRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => (row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail) && row.error);
  const events = fixtureVisibleToDelegates ? data?.eventsByTeam?.[selectedTeam?.id] || [] : [];
  const matches = fixtureVisibleToDelegates ? data?.matchesByTeam?.[selectedTeam?.id] || [] : [];
  const fullSchedule = fixtureVisibleToDelegates ? data?.schedulesByTeam?.[selectedTeam?.id] || [] : [];
  const eventsByMatch = fixtureVisibleToDelegates ? data?.eventsByMatch || {} : {};
  const historyMatches = matches.filter((match: any) => match.status === 'FINISHED');
  const teamUpcomingMatches = matches.filter((match: any) => match.status !== 'FINISHED');
  const nextMatch = teamUpcomingMatches[0];
  const nextOpponent = nextMatch ? (nextMatch.home_team_id === selectedTeam?.id ? nextMatch.away_team : nextMatch.home_team) : null;
  const currentPhase = phaseForRound(nextMatch?.matchdays?.round_number || Math.max(...fullSchedule.map((match: any) => match.matchdays?.round_number || 1), 1));
  const currentPhaseSchedule = fullSchedule.filter((match: any) => phaseForRound(match.matchdays?.round_number || 1) === currentPhase);
  const scheduleRounds = currentPhaseSchedule.reduce((acc: Record<string, any[]>, match: any) => {
    const round = match.matchdays?.round_number || 0;
    const key = round === 100 || round >= 201 ? 'Fase 3 · Finales' : round >= 101 ? `Fase 2 · Jornada ${round - 100}` : `Fase 1 · Jornada ${round}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
  const roundEntries = Object.entries(scheduleRounds).sort(([, matchesA], [, matchesB]) =>
    ((matchesA as any[])[0]?.matchdays?.round_number || 0) - ((matchesB as any[])[0]?.matchdays?.round_number || 0),
  );
  const lastScheduledRound = roundEntries.at(-1)?.[0] || '';
  const selectedRound = activeRound && scheduleRounds[activeRound] ? activeRound : '';

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const refreshPortalVisibility = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    window.addEventListener('focus', refreshPortalVisibility);
    document.addEventListener('visibilitychange', refreshPortalVisibility);
    return () => {
      window.removeEventListener('focus', refreshPortalVisibility);
      document.removeEventListener('visibilitychange', refreshPortalVisibility);
    };
  }, [router]);

  useEffect(() => {
    setActiveRound('');
    setShowAllUpcoming(false);
    setShowStaffEditor(false);
    setShowRegistrationModule(false);
    setRosterEditMode(false);
    setEditingPlayer(null);
    setStaffForm({
      headCoach: teamStaff.find((member: any) => member.role === 'HEAD_COACH')?.full_name || '',
      assistantCoach: teamStaff.find((member: any) => member.role === 'ASSISTANT_COACH')?.full_name || '',
    });
  }, [selectedTeam?.id]);

  useEffect(() => {
    if (!fixtureVisibleToDelegates) {
      setSelectedHistoryMatch(null);
      setSelectedStatDetail(null);
    }
  }, [fixtureVisibleToDelegates]);

  const bulkDraftKey = selectedTeam?.id ? `sportscore:delegate:${slug}:bulk-roster:${selectedTeam.id}` : '';

  useEffect(() => {
    if (!showBulkUpload || !bulkDraftKey || bulkRows.length === 0) return;
    const timeout = window.setTimeout(async () => {
      try {
        window.localStorage.setItem(bulkDraftKey, JSON.stringify({ version: 2, updatedAt: Date.now(), rows: bulkRows.map(({ faceFile, facePreview, identityFile, ...row }) => row) }));
        await saveBulkDraftFiles(bulkDraftKey, bulkRows);
        setDraftSavedAt(new Date());
      } catch {
        toast.error('El navegador no permitió guardar los archivos del borrador.');
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
    if (event.event_type === 'YELLOW') {
      return selectedCategory?.tournaments?.fine_yellow_amount
        || (typeof event.fine_amount === 'number' ? event.fine_amount : 0)
        || selectedCategory?.tournaments?.fp_yellow_deduction
        || 0;
    }
    if (event.event_type === 'RED') {
      return selectedCategory?.tournaments?.fine_red_amount
        || (typeof event.fine_amount === 'number' ? event.fine_amount : 0)
        || selectedCategory?.tournaments?.fp_red_deduction
        || 0;
    }
    return typeof event.fine_amount === 'number' ? event.fine_amount : 0;
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
  const statDetailEvents = selectedStatDetail === 'GOALS'
    ? events.filter((event: any) => ['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3'].includes(event.event_type))
    : selectedStatDetail === 'DEBT'
      ? cardEvents.filter((event: any) => event.fine_status !== 'PAID')
      : cardEvents.filter((event: any) => event.event_type === selectedStatDetail);
  const statDetailTitle = selectedStatDetail === 'GOALS' ? 'Goles y anotadores' : selectedStatDetail === 'YELLOW' ? 'Tarjetas amarillas' : selectedStatDetail === 'RED' ? 'Tarjetas rojas' : 'Multas pendientes';
  const eventOpponent = (event: any) => {
    const match = fullSchedule.find((item: any) => item.id === event.match_id);
    if (!match) return 'Rival no disponible';
    return match.home_team_id === selectedTeam?.id ? match.away_team?.name : match.home_team?.name;
  };

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
    if (isDemo) { window.location.href = `/${DEMO_SLUG}/admin`; return; }
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
    const result = isDemo ? saveDemoStaff(selectedTeam.id, staffForm) : await saveDelegateTeamStaff(slug, selectedTeam.id, staffForm);
    setLoading(false);
    if (!result.success) return toast.error(result.error || 'No se pudo guardar');
    toast.success('Cuerpo técnico guardado');
    window.location.reload();
  };

  const handleTransferRoster = async () => {
    if (!selectedTeam || !transferSourceTeamId) return;
    const source = transferableTeams.find((team: any) => team.id === transferSourceTeamId);
    const confirmed = await confirmDialog({ title: 'Copiar expediente', description: `Se copiarán jugadores y archivos desde ${source?.name || 'el torneo seleccionado'} a ${selectedTeam.name}. Los registros existentes no se sobrescribirán. ¿Deseas continuar?`, confirmLabel: 'Copiar expediente' });
    if (!confirmed) return;
    setLoading(true);
    const result = isDemo ? { success: false as const, error: 'La transferencia entre torneos está disponible para delegaciones reales.' } : await copyTeamRosterFromTournament(slug, transferSourceTeamId, selectedTeam.id);
    setLoading(false);
    if (!result.success) return toast.error(result.error);
    toast.success(`Transferencia completada: ${result.data.players} jugadores y ${result.data.documents} archivos. ${result.data.skipped} existentes omitidos.`);
    setShowTransferModal(false);
    router.refresh();
  };

  const normalizeExcelHeader = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  const validateBulkRows = (rows: BulkPlayerRow[]) => {
    const normalized = rows.map((row) => ({
      ...row,
      name: row.name.toUpperCase(),
      identityNumber: row.identityNumber.trim().replace(/\D/g, ''),
      vinculo: row.vinculo.trim().toUpperCase(),
      relationshipDetail: row.relationshipDetail.toUpperCase(),
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

  const bulkRowFingerprint = (row: BulkPlayerRow) => JSON.stringify([
    row.name, row.identityNumber, row.shirtNumber, row.birthDate, row.vinculo, row.relationshipDetail,
    row.faceFile?.name, row.faceFile?.size, row.identityFile?.name, row.identityFile?.size,
  ]);

  useEffect(() => {
    if (!showBulkUpload || !selectedTeam || loading || autoSyncingRow !== null) return;
    const readyIndex = bulkRows.findIndex((row) =>
      Boolean(row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail)
      && !row.error
      && !failedAutoSyncRows.current.has(bulkRowFingerprint(row)),
    );
    if (readyIndex < 0) return;

    const row = bulkRows[readyIndex];
    const fingerprint = bulkRowFingerprint(row);
    const timeout = window.setTimeout(async () => {
      setAutoSyncingRow(readyIndex);
      let playerWasCreated = false;
      try {
        const playerInput = [{
          name: row.name,
          identityNumber: row.identityNumber,
          shirtNumber: row.shirtNumber,
          birthYear: row.birthYear,
          birthDate: row.birthDate,
          vinculo: row.vinculo,
          relationshipDetail: row.relationshipDetail,
        }];
        const result = isDemo ? addDemoPlayers(selectedTeam.id, playerInput) : await addDelegatePlayers(slug, selectedTeam.id, playerInput);

        if (!result.success) {
          failedAutoSyncRows.current.add(fingerprint);
          setAutoSyncFailureCount(failedAutoSyncRows.current.size);
          toast.error(`Fila ${readyIndex + 1}: ${result.error}`);
          setAutoSyncingRow(null);
          return;
        }

        playerWasCreated = true;
        const playerId = result.data.playerIds[0];
        const faceUpload = isDemo ? addDemoDocument(playerId, 'FACE_PHOTO', row.faceFile?.name || 'foto-demo.jpg') : await uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, 'FACE_PHOTO', row.faceFile as File);
        const identityUpload = isDemo ? addDemoDocument(playerId, 'IDENTITY_FRONT', row.identityFile?.name || 'documento-demo.jpg') : await uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, 'IDENTITY_FRONT', row.identityFile as File);
        setBulkRows((currentRows) => currentRows.filter((currentRow) => bulkRowFingerprint(currentRow) !== fingerprint));
        if (!faceUpload.success || !identityUpload.success) toast.error(`${row.name} fue inscrito, pero algún archivo no pudo cargarse.`);
        else toast.success(`${row.name} inscrito automáticamente`);
        router.refresh();
      } catch {
        failedAutoSyncRows.current.add(fingerprint);
        setAutoSyncFailureCount(failedAutoSyncRows.current.size);
        if (playerWasCreated) {
          setBulkRows((currentRows) => currentRows.filter((currentRow) => bulkRowFingerprint(currentRow) !== fingerprint));
          toast.error(`${row.name} fue inscrito, pero la conexión se interrumpió al cargar sus archivos.`);
          router.refresh();
        } else {
          toast.error(`No se pudo inscribir la fila ${readyIndex + 1}. El borrador permanece guardado para reintentar.`);
        }
      } finally {
        setAutoSyncingRow(null);
      }
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [autoSyncRetryVersion, autoSyncingRow, bulkRows, loading, router, selectedTeam, showBulkUpload, slug]);

  const retryAutomaticSync = () => {
    failedAutoSyncRows.current.clear();
    setAutoSyncFailureCount(0);
    setAutoSyncRetryVersion((version) => version + 1);
    toast.success('Reintentando archivos pendientes');
  };

  const updateBulkRow = (index: number, field: keyof BulkPlayerRow, value: string) => {
    const normalizedValue = field === 'identityNumber' ? value.replace(/\D/g, '') : value;
    const rows = bulkRows.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      [field]: field === 'shirtNumber' || field === 'birthYear' ? (normalizedValue ? Number(normalizedValue) : null) : normalizedValue,
      ...(field === 'birthDate' ? { birthYear: normalizedValue.match(/^\d{4}-\d{2}-\d{2}$/) ? Number(normalizedValue.slice(0, 4)) : null } : {}),
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

  const keepBulkFieldVisible = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('input, select, button, [role="button"]')) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const handleBulkPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line): BulkPlayerRow => {
      const [name = '', identityNumber = '', shirtNumber = '', rawBirthDate = '', vinculo = '', relationshipDetail = ''] = line.split('\t');
      const birthDate = normalizePastedDate(rawBirthDate) || rawBirthDate.trim();
      return {
        name,
        identityNumber,
        shirtNumber: shirtNumber ? Number(shirtNumber) : null,
        birthYear: birthDate.match(/^\d{4}-\d{2}-\d{2}$/) ? Number(birthDate.slice(0, 4)) : null,
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
        'FECHA DE NACIMIENTO': '20051985',
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
        const rawBirthDate = String(row['FECHA DE NACIMIENTO'] || '').trim();
        const birthDate = normalizePastedDate(rawBirthDate) || rawBirthDate;
        const birthYear = birthDate.match(/^\d{4}-\d{2}-\d{2}$/) ? Number(birthDate.slice(0, 4)) : null;
        const vinculo = String(row['VINCULO CON EL COLEGIO'] || '').trim().toUpperCase();
        const relationshipDetail = String(row['PROMOCION O NOMBRE DEL ESTUDIANTE'] || '').trim().toUpperCase();
        return { name, identityNumber, shirtNumber: shirtNumber || null, birthYear, birthDate, vinculo, relationshipDetail };
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
    const playerInputs = playersToInsert.map((row) => ({
      name: row.name,
      identityNumber: row.identityNumber,
      shirtNumber: row.shirtNumber,
      birthYear: row.birthYear,
      birthDate: row.birthDate,
      vinculo: row.vinculo,
      relationshipDetail: row.relationshipDetail,
    }));
    const result = isDemo ? addDemoPlayers(selectedTeam.id, playerInputs) : await addDelegatePlayers(slug, selectedTeam.id, playerInputs);
    setLoading(false);
    if (!result.success) return toast.error(result.error || 'No se pudieron inscribir los jugadores');
    setLoading(true);
    const uploadResults: Awaited<ReturnType<typeof uploadPlayerIdentityDocument>>[] = [];
    let uploadInterrupted = false;
    try {
      for (const [index, row] of playersToInsert.entries()) {
        const playerId = result.data.playerIds[index];
        uploadResults.push(isDemo ? addDemoDocument(playerId, 'FACE_PHOTO', row.faceFile?.name || 'foto-demo.jpg') as any : await uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, 'FACE_PHOTO', row.faceFile as File));
        uploadResults.push(isDemo ? addDemoDocument(playerId, 'IDENTITY_FRONT', row.identityFile?.name || 'documento-demo.jpg') as any : await uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, 'IDENTITY_FRONT', row.identityFile as File));
      }
    } catch {
      uploadInterrupted = true;
      toast.error('Los jugadores fueron inscritos, pero la conexión se interrumpió al cargar algunos archivos.');
    }
    setLoading(false);
    if (!uploadInterrupted && uploadResults.some((upload) => !upload.success)) toast.error('Los jugadores fueron creados, pero algunos archivos no pudieron cargarse.');
    else if (!uploadInterrupted) toast.success(`${result.data.inserted} jugadores y documentos inscritos`);
    if (bulkDraftKey) {
      window.localStorage.removeItem(bulkDraftKey);
      await deleteBulkDraftFiles(bulkDraftKey).catch(() => undefined);
    }
    setShowBulkUpload(false);
    setBulkRows([]);
    setDraftSavedAt(null);
    window.location.reload();
  };

  const openBulkUpload = async () => {
    let restoredRows: BulkPlayerRow[] | null = null;
    if (bulkDraftKey) {
      try {
        const indexedDraft = await loadBulkDraftFiles(bulkDraftKey).catch(() => null);
        const savedDraft = indexedDraft || JSON.parse(window.localStorage.getItem(bulkDraftKey) || 'null');
        if (Array.isArray(savedDraft?.rows)) {
          restoredRows = validateBulkRows(restoreBulkFilePreviews(savedDraft.rows));
          setDraftSavedAt(savedDraft.updatedAt ? new Date(savedDraft.updatedAt) : new Date());
        }
      } catch {
        window.localStorage.removeItem(bulkDraftKey);
      }
    }
    setBulkRows(restoredRows || Array.from({ length: 8 }, emptyBulkRow));
    setShowBulkUpload(true);
    if (restoredRows) toast.success('Borrador recuperado con sus fotos y documentos');
  };

  const discardBulkDraft = async () => {
    if (autoSyncingRow !== null) return toast.error('Espera a que termine la inscripción automática en curso.');
    if (bulkDraftKey) {
      window.localStorage.removeItem(bulkDraftKey);
      await deleteBulkDraftFiles(bulkDraftKey).catch(() => undefined);
    }
    setBulkRows(Array.from({ length: 8 }, emptyBulkRow));
    setDraftSavedAt(null);
    toast.success('Borrador eliminado');
  };

  const closeBulkUpload = async () => {
    if (autoSyncingRow !== null) return toast.error('Espera a que termine la inscripción automática en curso.');
    if (bulkDraftKey && bulkRows.length > 0) {
      try {
        window.localStorage.setItem(bulkDraftKey, JSON.stringify({ version: 2, updatedAt: Date.now(), rows: bulkRows.map(({ faceFile, facePreview, identityFile, ...row }) => row) }));
        await saveBulkDraftFiles(bulkDraftKey, bulkRows);
        setDraftSavedAt(new Date());
      } catch {
        toast.error('No se pudieron guardar los archivos del último cambio.');
        return;
      }
    }
    setShowBulkUpload(false);
    setBulkRows([]);
  };

  const handleDeletePlayer = async (player: any) => {
    if (!selectedTeam) return;
    if (!await confirmDialog({
      title: 'Eliminar jugador',
      description: `¿Deseas eliminar definitivamente a ${String(player.name || 'este jugador').toUpperCase()} de la nómina? También se retirarán sus documentos cargados.`,
      confirmLabel: 'Eliminar jugador',
      tone: 'danger',
    })) return;
    setLoading(true);
    const result = isDemo ? deleteDemoPlayer(player.id) : await deleteDelegatePlayer(slug, selectedTeam.id, player.id);
    if (!result.success) toast.error(result.error || 'No se pudo eliminar el jugador');
    else {
      toast.success('Jugador removido');
      window.location.reload();
    }
    setLoading(false);
  };

  const openPlayerEditor = (player: any) => {
    setEditingPlayer(player);
    setEditPlayerForm({
      name: player.name || '', identityNumber: player.identity_number || '', shirtNumber: String(player.shirt_number || ''),
      birthDate: player.birth_date || '', vinculo: player.vinculo || '', relationshipDetail: player.relationship_detail || '',
    });
  };

  const savePlayerEdition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTeam || !editingPlayer) return;
    setLoading(true);
    const updateInput = {
      name: editPlayerForm.name,
      identityNumber: editPlayerForm.identityNumber,
      shirtNumber: editPlayerForm.shirtNumber ? Number(editPlayerForm.shirtNumber) : null,
      birthDate: editPlayerForm.birthDate,
      birthYear: editPlayerForm.birthDate ? Number(editPlayerForm.birthDate.slice(0, 4)) : null,
      vinculo: editPlayerForm.vinculo,
      relationshipDetail: editPlayerForm.relationshipDetail,
    };
    const result = isDemo ? updateDemoPlayer(editingPlayer.id, updateInput) : await updateDelegatePlayer(slug, selectedTeam.id, editingPlayer.id, updateInput);
    setLoading(false);
    if (!result.success) return toast.error(result.error || 'No se pudo actualizar el jugador');
    toast.success('Información del jugador actualizada');
    setEditingPlayer(null);
    router.refresh();
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTeam) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('El archivo debe ser una imagen.');
    if (file.size > 800 * 1024) return toast.error('El logo no puede superar 800 KB.');

    setLoading(true);
    const result = isDemo ? { success: true, error: undefined } : await uploadDelegateSchoolLogo(slug, selectedTeam.id, file);
    if (!result.success) toast.error(result.error || 'No se pudo actualizar el logo');
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
    const result = isDemo ? addDemoDocument(playerId, documentType, file.name) : await uploadPlayerIdentityDocument(slug, selectedTeam.id, playerId, documentType, file);
    if (!result.success) toast.error(result.error || 'No se pudo guardar el documento');
    else { toast.success('Documento enviado para revisión'); window.location.reload(); }
    setLoading(false);
  };

  const handleFineProofUpload = async (file?: File) => {
    if (!selectedTeam || !selectedFineEvent || !file) return;
    setLoading(true);
    const result = isDemo
      ? { success: true as const, data: undefined }
      : await uploadPlayerFinePaymentProof(slug, selectedTeam.id, selectedFineEvent.player_id, selectedFineEvent.id, file);
    if (!result.success) toast.error(result.error || 'No se pudo enviar el comprobante');
    else { toast.success(isDemo ? 'Comprobante simulado enviado' : 'Comprobante enviado para validación'); setSelectedFineEvent(null); if (!isDemo) window.location.reload(); }
    setLoading(false);
  };

  const openLineupEditor = async (match: any) => {
    // Abrimos el editor de inmediato; las fotos se resuelven en segundo plano.
    setLineupMatch(match);
    const existing = (eventsByMatch[match.id] || []).filter((event: any) => event.event_type === 'STARTING_LINEUP' && event.team_id === selectedTeam?.id).map((event: any) => event.player_id);
    let defaultFormation = lineupFormation;
    let defaultPlayers = existing;
    let saved: any = null;
    if (selectedTeam) {
      try {
        saved = JSON.parse(localStorage.getItem(`sportscore:default-lineup:${slug}:${selectedTeam.id}`) || 'null');
        setSavedDefaultLineup(saved?.formation && Array.isArray(saved?.players) ? { formation: saved.formation, players: saved.players } : null);
        if (existing.length === 0) {
          if (saved?.formation) defaultFormation = saved.formation;
          if (Array.isArray(saved?.players)) defaultPlayers = saved.players.filter((id: string) => players.some((player: any) => player.id === id));
        }
      } catch { /* preferencias locales inválidas: se ignoran */ }
    }
    const formation = getFootball9Formation(defaultFormation);
    setLineupFormation(defaultFormation);
    setLineupAssignments(Object.fromEntries(formation.players.map((slot, index) => [slot.id, defaultPlayers[index]])));
    setLineupSelection(defaultPlayers);
  };

  const startNewLineup = () => {
    const formation = getFootball9Formation('3-3-2');
    setLineupFormation(formation.code);
    setLineupAssignments(Object.fromEntries(formation.players.map((slot) => [slot.id, undefined])));
    setLineupSelection([]);
  };

  const useSavedDefaultLineup = () => {
    if (!savedDefaultLineup) return;
    const formation = getFootball9Formation(savedDefaultLineup.formation);
    const validPlayers = savedDefaultLineup.players.filter((id) => players.some((player: any) => player.id === id));
    setLineupFormation(formation.code);
    setLineupAssignments(Object.fromEntries(formation.players.map((slot, index) => [slot.id, validPlayers[index]])));
    setLineupSelection(validPlayers);
  };

  const saveCurrentAsDefaultLineup = () => {
    if (!selectedTeam) return;
    const value = { formation: lineupFormation, players: lineupSelection.slice(0, 9) };
    try {
      localStorage.setItem(`sportscore:default-lineup:${slug}:${selectedTeam.id}`, JSON.stringify(value));
      setSavedDefaultLineup(value);
      toast.success('Plantilla guardada como predeterminada');
    } catch {
      toast.error('No fue posible guardar la plantilla en este dispositivo');
    }
  };

  const loadSelectedPlayerPhoto = async (playerId: string) => {
    const player = players.find((item: any) => item.id === playerId);
    if (!player || player.photo_url || player.face_photo_url || player.image_url || !player.player_documents?.some((doc: any) => doc.document_type === 'FACE_PHOTO')) return;
    const cachedUrl = lineupPhotoCache.current.get(playerId);
    if (cachedUrl) {
      player.photo_url = cachedUrl;
      setLineupPhotoUrls((current) => ({ ...current, [playerId]: cachedUrl }));
      return;
    }
    const pendingRequest = lineupPhotoRequests.current.get(playerId);
    if (pendingRequest) return pendingRequest;
    const request = (async () => {
    try {
      const result = isDemo ? { success: false as const } : await getPlayerIdentityDocumentUrl(slug, selectedTeam.id, playerId, 'FACE_PHOTO');
      if (result.success && result.data?.url) {
        lineupPhotoCache.current.set(playerId, result.data.url);
        player.photo_url = result.data.url;
        setLineupPhotoUrls((current) => ({ ...current, [playerId]: result.data.url }));
      }
    } catch { /* la foto es opcional para la alineación */ }
    })().finally(() => lineupPhotoRequests.current.delete(playerId));
    lineupPhotoRequests.current.set(playerId, request);
    return request;
  };

  const assignLineupPlayer = (positionId: string, playerId: string) => {
    if (playerId) void loadSelectedPlayerPhoto(playerId);
    setLineupAssignments((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => { if (key !== positionId && next[key] === playerId) next[key] = undefined; });
      next[positionId] = playerId || undefined;
      setLineupSelection(Object.values(next).filter(Boolean) as string[]);
      return next;
    });
  };

  const changeLineupFormation = (code: string) => {
    const currentPlayers = Object.values(lineupAssignments).filter(Boolean) as string[];
    const formation = getFootball9Formation(code);
    const next = Object.fromEntries(formation.players.map((slot, index) => [slot.id, currentPlayers[index]]));
    setLineupFormation(code); setLineupAssignments(next); setLineupSelection(Object.values(next).filter(Boolean) as string[]);
  };

  const handleSaveLineup = async () => {
    if (!selectedTeam || !lineupMatch) return;
    setLoading(true);
    const result = isDemo ? { success: true as const, data: undefined } : await saveDelegateMatchLineup(slug, selectedTeam.id, lineupMatch.id, lineupSelection);
    if (!result.success) toast.error(result.error); else {
      toast.success('Alineación enviada a Mesa de Control');
      try { localStorage.setItem(`sportscore:default-lineup:${slug}:${selectedTeam.id}`, JSON.stringify({ formation: lineupFormation, players: lineupSelection })); } catch { /* almacenamiento local no disponible */ }
      if (isDemo) {
        setData((current: any) => {
          if (!current) return current;
          const existingEvents = current.eventsByMatch?.[lineupMatch.id] || [];
          const lineupEvents = lineupSelection.map((playerId, index) => ({ id: `demo-lineup-${lineupMatch.id}-${selectedTeam.id}-${index}`, match_id: lineupMatch.id, team_id: selectedTeam.id, player_id: playerId, event_type: 'STARTING_LINEUP', period: '0' }));
          return { ...current, eventsByMatch: { ...(current.eventsByMatch || {}), [lineupMatch.id]: [...existingEvents.filter((event: any) => !(event.event_type === 'STARTING_LINEUP' && event.team_id === selectedTeam.id)), ...lineupEvents] } };
        });
      } else window.location.reload();
      setLineupMatch(null);
    }
    setLoading(false);
  };

  const openPlayerDocument = async (playerId: string, documentType: 'FACE_PHOTO' | 'IDENTITY_FRONT' | 'IDENTITY_BACK') => {
    if (!selectedTeam) return;
    if (isDemo) return toast('Archivo simulado: la demo no sube documentos a servidores.');
    const result = await getPlayerIdentityDocumentUrl(slug, selectedTeam.id, playerId, documentType);
    if (!result.success) return toast.error(result.error);
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };


  const renderTeamMark = (team: any) => (
    <TeamLogo team={team} className="h-16 w-16 rounded-2xl sm:h-20 sm:w-20" />
  );

  const renderMatchCard = (match: any, compact = false) => {
    const restingTeam = match.home_team || match.away_team;
    const isBye = match.status === 'BYE' || !match.home_team || !match.away_team;

    if (isBye && restingTeam) return (
      <div key={match.id} className="rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/60 p-4 text-center sm:p-5">
        <p className="mb-3 flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-widest text-orange-500"><CalendarDays size={12} /> Jornada {match.matchdays?.round_number || '-'} · {match.matchdays?.scheduled_date || 'Fecha pendiente'}</p>
        <div className="flex flex-col items-center gap-2">{renderTeamMark(restingTeam)}<span className="font-black uppercase leading-tight text-slate-800">{restingTeam.name}</span><span className="rounded-full bg-orange-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-orange-600">Jornada de descanso</span></div>
      </div>
    );

    return (
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
      {match.status === 'SCHEDULED' && selectedTeam && <button type="button" onClick={() => openLineupEditor(match)} className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100">{(eventsByMatch[match.id] || []).some((event: any) => event.event_type === 'STARTING_LINEUP' && event.team_id === selectedTeam.id) ? 'Editar alineación' : 'Organizar alineación'}</button>}
    </div>
    );
  };

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

  const renderRoundMatchCard = (match: any) => {
    const restingTeam = match.home_team || match.away_team;
    const isBye = match.status === 'BYE' || !match.home_team || !match.away_team;

    if (isBye && restingTeam) return (
      <div key={match.id} className="rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/60 p-3">
        <div className="flex items-center gap-3"><TeamLogo team={restingTeam} className="h-10 w-10" /><div className="min-w-0"><p className="truncate text-[10px] font-black uppercase text-slate-800">{restingTeam.name}</p><p className="mt-1 text-[9px] font-black uppercase tracking-widest text-orange-600">Descansa esta jornada</p></div></div>
      </div>
    );

    return (
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
      {match.status === 'SCHEDULED' && selectedTeam && <button type="button" onClick={() => openLineupEditor(match)} className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100">{(eventsByMatch[match.id] || []).some((event: any) => event.event_type === 'STARTING_LINEUP' && event.team_id === selectedTeam.id) ? 'Editar alineación' : 'Organizar alineación'}</button>}
    </div>
    );
  };

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-5 rounded-[1.5rem] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:rounded-[2rem] sm:p-8">
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
        <form onSubmit={handleForcedPasswordChange} className="w-full max-w-md space-y-5 rounded-[1.5rem] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:rounded-[2rem] sm:p-8">
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
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
          <img
            src={selectedTeam.schools.logo_url}
            alt=""
            className="h-auto w-[min(82vw,760px)] select-none object-contain opacity-[0.055] sm:opacity-[0.075]"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <header className="sticky top-0 z-40 overflow-hidden bg-slate-950 px-4 py-4 text-white shadow-xl shadow-slate-950/20 sm:py-6">
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
              <div className="relative shrink-0">
                <TeamLogo team={selectedTeam} className="h-20 w-20 rounded-2xl sm:h-28 sm:w-28 sm:rounded-[1.75rem]" />
                <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-slate-950 bg-blue-600 text-white shadow-lg transition hover:bg-blue-500 sm:h-9 sm:w-9" aria-label="Cambiar logo del equipo" title="Cambiar logo del equipo">
                  <Pencil size={14} />
                  <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={loading} className="hidden" />
                </label>
              </div>
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
              {selectedTeam && <div className="mt-3 flex flex-wrap items-center gap-2">
                <a href={`/${slug}/equipo/${toTeamSlug(selectedTeam.name)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[8px] font-black uppercase tracking-wider text-white transition hover:bg-white/15 sm:text-[9px]"><ExternalLink size={13} /> Ver resultados del equipo</a>
                <button type="button" onClick={copyPublicTeamLink} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-blue-300 transition hover:bg-white/15" aria-label="Copiar enlace de resultados" title="Copiar enlace de resultados"><ClipboardCopy size={13} /></button>
              </div>}
              {selectedTeam && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                <span className="text-violet-300">Técnico: <span className="text-slate-200">{teamStaff.find((member: any) => member.role === 'HEAD_COACH')?.full_name || 'Sin registrar'}</span></span>
                <span className="text-violet-300">Asistente: <span className="text-slate-200">{teamStaff.find((member: any) => member.role === 'ASSISTANT_COACH')?.full_name || 'Sin registrar'}</span></span>
                {canEditRoster && <button type="button" onClick={() => setShowStaffEditor((open) => !open)} className="rounded-md bg-white/10 px-2 py-1 text-[8px] font-black text-violet-200 transition hover:bg-white/20" aria-expanded={showStaffEditor}>{showStaffEditor ? 'Cerrar' : 'Editar'}</button>}
              </div>}
              {showStaffEditor && canEditRoster && <form onSubmit={handleSaveStaff} className="mt-3 grid max-w-2xl gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Técnico<input required value={staffForm.headCoach} onChange={(event) => setStaffForm({ ...staffForm, headCoach: event.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-bold uppercase text-white outline-none focus:border-violet-300" /></label>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Asistente<input required value={staffForm.assistantCoach} onChange={(event) => setStaffForm({ ...staffForm, assistantCoach: event.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-bold uppercase text-white outline-none focus:border-violet-300" /></label>
                <button disabled={loading} className="self-end rounded-lg bg-violet-600 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-50">Guardar</button>
              </form>}
            </div>
          </div>
          <button onClick={handleLogout} aria-label="Salir" className="flex w-fit shrink-0 items-center gap-2 rounded-xl bg-white/10 p-3 text-xs font-black uppercase tracking-widest hover:bg-white/15 sm:px-4">
            <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <div className="delegate-portal-content relative z-10 mx-auto max-w-6xl space-y-6 px-4 py-8">
        {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <section role="dialog" aria-modal="true" aria-labelledby="transfer-title" className="w-full max-w-lg rounded-[2rem] bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Respaldo de delegación</p><h2 id="transfer-title" className="mt-1 text-2xl font-black uppercase tracking-tight">Copiar desde otro torneo</h2></div>
                <button type="button" onClick={() => setShowTransferModal(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500" aria-label="Cerrar"><X size={18} /></button>
              </div>
              <p className="mt-4 text-sm font-semibold leading-relaxed text-slate-500">Copia los datos de jugadores y sus archivos privados a <strong>{selectedTeam?.name}</strong>. Solo aparecen equipos de tu misma delegación.</p>
              {transferableTeams.length === 0 ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-xs font-black uppercase text-amber-700">No hay otro torneo disponible para copiar.</p> : <>
                <label className="mt-5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Equipo de origen<select value={transferSourceTeamId} onChange={(event) => setTransferSourceTeamId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-500"><option value="">Seleccionar torneo de origen</option>{transferableTeams.map((team: any) => <option key={team.id} value={team.id}>{team.categories?.tournaments?.name || 'Torneo'} · {team.name}</option>)}</select></label>
                <div className="mt-5 flex gap-3"><button type="button" onClick={() => setShowTransferModal(false)} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600">Cancelar</button><button type="button" disabled={!transferSourceTeamId || loading} onClick={handleTransferRoster} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">{loading ? 'Copiando…' : 'Copiar expediente'}</button></div>
              </>}
            </section>
          </div>
        )}
        {showBulkUpload && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="bulk-upload-title" className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-[2rem] sm:border sm:border-slate-200">
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Planilla de inscripción</p>
                  <h2 id="bulk-upload-title" className="text-xl font-black uppercase tracking-tight sm:text-2xl">Inscribir jugadores y documentos</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Equipo: {selectedTeam?.name}</p>
                  <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                    {draftSavedAt ? `Borrador local guardado · pendiente de sincronizar · ${draftSavedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'Borrador local con guardado automático · pendiente de sincronizar'}
                  </p>
                </div>
                <button type="button" onClick={closeBulkUpload} className="rounded-xl bg-slate-100 p-3 text-slate-500 hover:text-slate-900" aria-label="Cerrar y continuar después"><X size={18} /></button>
              </header>

              <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/50">
                  <div className="flex flex-col gap-2 border-b border-emerald-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-800"><Users size={15} /> Jugadores ya inscritos</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700/70">Los datos básicos están en el servidor; los archivos pueden continuar pendientes</p></div>
                    <span className="w-fit rounded-full bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white">{players.length} inscritos</span>
                  </div>
                  {players.length > 0 ? (
                    <div className="max-h-56 divide-y divide-emerald-100 overflow-y-auto bg-white/80">
                      {players.map((player: any, index: number) => {
                        const dossier = playerDossierStatus(player.player_documents);
                        const localFilesPending = bulkRows.some((row) => row.identityNumber === player.identity_number && row.faceFile && row.identityFile);
                        return (
                          <div key={player.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[32px_minmax(0,1fr)_90px_130px_auto]">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-black text-blue-700">#{player.shirt_number || '-'}</span>
                            <div className="min-w-0"><p className="truncate text-xs font-black uppercase text-slate-900">{index + 1}. {player.name}</p><p className="truncate text-[9px] font-bold uppercase text-slate-400 sm:hidden">ID {player.identity_number || 'sin registrar'} · {player.birth_date || player.birth_year || 'sin fecha'}</p></div>
                            <span className="hidden text-center text-[9px] font-black uppercase text-slate-500 sm:block">{player.birth_date ? String(player.birth_date).slice(0, 4) : player.birth_year || '-'}</span>
                            <span className="hidden truncate text-[9px] font-black uppercase text-slate-500 sm:block">{player.vinculo || 'Sin vínculo'}</span>
                            <span className={`text-right text-[8px] font-black uppercase ${localFilesPending ? 'text-blue-600' : dossier.className}`}>{localFilesPending ? 'Archivos listos localmente · pendientes de enviar' : dossier.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="bg-white px-4 py-5 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">Aún no hay jugadores guardados</p>}
                </section>

                <div className="grid gap-3 md:grid-cols-2">
                  <button type="button" onClick={downloadBulkTemplate} className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-xs font-black uppercase tracking-widest text-blue-700">
                    <Download size={16} /> Descargar plantilla
                  </button>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-4 text-xs font-black uppercase tracking-widest text-white">
                    <FileSpreadsheet size={16} /> Seleccionar Excel
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
                  </label>
                </div>

                {bulkRows.length > 0 && (
                  <div onPaste={handleBulkPaste} onFocusCapture={keepBulkFieldVisible} className="hidden scroll-smooth overflow-x-auto rounded-2xl border border-slate-200 lg:block">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-950 text-[9px] font-black uppercase tracking-widest text-white">
                        <tr className="text-center"><th className="p-3">#</th><th className="p-3">Foto</th><th className="min-w-56 p-3">Nombre completo</th><th className="min-w-52 p-3">Número de identidad</th><th className="min-w-24 p-3">Dorsal</th><th className="min-w-44 p-3">Fecha de nacimiento</th><th className="min-w-52 p-3">Vínculo</th><th className="min-w-60 p-3">Promoción / Estudiante</th><th className="min-w-52 p-3">Documento</th><th className="min-w-40 p-3">Validación</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkRows.map((row, index) => (
                          <tr key={`bulk-player-${index}`} className={`relative ${row.error ? 'bg-red-50' : 'bg-white'} ${autoSyncingRow === index ? '[&>td>*]:opacity-25 [&>td>*]:pointer-events-none' : ''}`}>
                            <td className="p-3 font-black text-slate-400">
                              {index + 1}
                              {autoSyncingRow === index && (
                                <div className="!pointer-events-auto !opacity-100 absolute inset-0 z-20 flex items-center justify-center bg-white/55 backdrop-blur-[1px]">
                                  <span className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-6 py-4 text-xs font-black uppercase tracking-widest text-blue-700 shadow-xl">
                                    <LoaderCircle size={26} className="animate-spin" /> Guardando jugador…
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="p-2"><label title="Subir foto del rostro" className="relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-cyan-300 bg-cyan-50 text-cyan-600">{row.facePreview ? <img src={row.facePreview} alt="Rostro" className="h-full w-full object-cover" /> : <Camera size={18} />}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => updateBulkFile(index, 'faceFile', event.target.files?.[0])} /></label></td>
                            <td className="p-2"><input value={row.name} onChange={(event) => updateBulkRow(index, 'name', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-black uppercase outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><input type="text" inputMode="numeric" pattern="[0-9]*" value={row.identityNumber} onChange={(event) => updateBulkRow(index, 'identityNumber', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><input type="number" inputMode="numeric" min="1" max="999" value={row.shirtNumber ?? ''} onChange={(event) => updateBulkRow(index, 'shirtNumber', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500" /></td>
                            <td className="p-2"><BirthDateCards compact value={row.birthDate} onChange={(value) => updateBulkRow(index, 'birthDate', value)} /></td>
                            <td className="p-2"><select value={row.vinculo} onChange={(event) => updateBulkRow(index, 'vinculo', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-blue-500"><option value="">Seleccionar</option>{ALLOWED_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></td>
                            <td className="p-2">{(row.vinculo === 'PADRE DE FAMILIA' || row.vinculo === 'EX-ALUMNO') && <input type={row.vinculo === 'EX-ALUMNO' ? 'number' : 'text'} inputMode={row.vinculo === 'EX-ALUMNO' ? 'numeric' : undefined} placeholder={row.vinculo === 'EX-ALUMNO' ? 'Año de promoción' : 'Nombre completo del estudiante'} value={row.relationshipDetail} onChange={(event) => updateBulkRow(index, 'relationshipDetail', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold uppercase outline-none focus:border-blue-500" />}</td>
                            <td className="p-2"><label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 font-black uppercase ${row.identityFile ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}><FileCheck2 size={14} /> {row.identityFile ? 'Listo para enviar' : 'Subir'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => updateBulkFile(index, 'identityFile', event.target.files?.[0])} /></label></td>
                            <td className={`p-3 text-[10px] font-black uppercase ${row.error ? 'text-red-600' : row.name ? 'text-emerald-600' : 'text-slate-300'}`}>{row.error || (row.name ? 'LISTO' : 'FILA VACÍA')}</td>
                            <td className="p-2"><button type="button" onClick={() => setBulkRows(validateBulkRows(bulkRows.filter((_, rowIndex) => rowIndex !== index)))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={`Eliminar fila ${index + 1}`}><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {bulkRows.length > 0 && (
                  <div onPaste={handleBulkPaste} className="space-y-3 lg:hidden">
                    {bulkRows.map((row, index) => ({ row, index })).filter(({ row, index }) =>
                      Boolean(row.name || row.identityNumber || row.shirtNumber || row.birthDate || row.vinculo || row.relationshipDetail)
                      || index === firstEmptyBulkRowIndex,
                    ).map(({ row, index }) => (
                      <article key={`mobile-${index}`} className={`relative rounded-2xl border p-4 shadow-sm ${autoSyncingRow === index ? 'border-blue-300 [&>*]:opacity-25 [&>*]:pointer-events-none' : row.error ? 'border-red-300 bg-red-50' : MOBILE_ROW_COLORS[index % MOBILE_ROW_COLORS.length]}`}>
                        {autoSyncingRow === index && (
                          <div className="!pointer-events-auto !opacity-100 absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[1px]">
                            <span className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-5 py-4 text-[10px] font-black uppercase tracking-widest text-blue-700 shadow-xl">
                              <LoaderCircle size={25} className="animate-spin" /> Guardando jugador…
                            </span>
                          </div>
                        )}
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jugador {index + 1}</p>
                          <button type="button" onClick={() => setBulkRows(validateBulkRows(bulkRows.filter((_, rowIndex) => rowIndex !== index)))} className="rounded-lg p-2 text-red-500 hover:bg-red-100" aria-label={`Eliminar fila ${index + 1}`}><Trash2 size={15} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Nombre completo<input value={row.name} onChange={(event) => updateBulkRow(index, 'name', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-black uppercase text-slate-900 outline-none focus:border-blue-500" /></label>
                          <label className="col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-cyan-200 bg-white p-3 text-[10px] font-black uppercase tracking-wider text-cyan-700"><span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-cyan-50">{row.facePreview ? <img src={row.facePreview} alt="Rostro" className="h-full w-full object-cover" /> : <Camera size={20} />}</span>{row.faceFile ? 'Cambiar foto del rostro' : 'Agregar foto del rostro'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => updateBulkFile(index, 'faceFile', event.target.files?.[0])} /></label>
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

              <footer className="mt-2 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <button type="button" disabled={autoSyncingRow !== null} onClick={discardBulkDraft} className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Eliminar borrador</button>
                <div className="flex flex-1 flex-col gap-3 sm:items-end">
                  {bulkInvalidRows.length > 0 && (
                    <div role="alert" className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-black uppercase leading-relaxed tracking-wider text-amber-800 sm:max-w-xl">
                      Sincronización bloqueada: revisa {bulkInvalidRows.length} jugador(es). Filas {bulkInvalidRows.map(({ index }) => index + 1).join(', ')}.
                      <span className="mt-1 block font-bold normal-case tracking-normal text-amber-700">{bulkInvalidRows[0]?.row.error}</span>
                    </div>
                  )}
                  {autoSyncingRow !== null && (
                    <div role="status" className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-blue-700 sm:max-w-xl">
                      Guardando automáticamente el jugador de la fila {autoSyncingRow + 1}… No cierres esta ventana.
                    </div>
                  )}
                  {autoSyncFailureCount > 0 && autoSyncingRow === null && (
                    <button type="button" onClick={retryAutomaticSync} className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-amber-800 hover:bg-amber-100 sm:max-w-xl">
                      Reintentar sincronización de archivos pendientes
                    </button>
                  )}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button type="button" disabled={autoSyncingRow !== null} onClick={closeBulkUpload} className="rounded-xl bg-slate-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Continuar después</button>
                  <button type="button" disabled={loading || autoSyncingRow !== null || bulkFilledRows.length === 0 || bulkInvalidRows.length > 0} onClick={submitBulkPlayers} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40">Sincronizar jugadores ({bulkFilledRows.length})</button>
                  </div>
                </div>
              </footer>
              </div>
            </section>
          </div>
        )}

        {showRegistrationGuide && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="registration-guide-title" className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-[2rem]">
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-950 p-5 text-white sm:p-6">
                <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-400">Tutorial para delegaciones</p><h2 id="registration-guide-title" className="mt-1 text-xl font-black uppercase sm:text-2xl">Cómo inscribir correctamente la nómina</h2><p className="mt-2 text-xs font-semibold text-slate-300">Lee estas instrucciones antes de comenzar la carga.</p></div>
                <button type="button" onClick={() => setShowRegistrationGuide(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="Cerrar tutorial"><X size={19} /></button>
              </header>
              <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"><p className="text-xs font-black uppercase tracking-wider">Importante: borrador no significa inscripción</p><p className="mt-2 text-sm font-semibold leading-relaxed">El mensaje “Borrador local guardado” indica que la información está únicamente en ese navegador. El jugador queda inscrito cuando aparece en la lista de jugadores inscritos.</p></div>
                <ol className="space-y-3">
                  {[
                    ['1. Usa siempre el mismo dispositivo', 'Continúa la carga desde el mismo computador o celular, navegador, perfil y dominio donde comenzaste.'],
                    ['2. Completa un jugador a la vez', 'Ingresa nombre, identificación, dorsal, fecha de nacimiento, vínculo y promoción o estudiante cuando corresponda.'],
                    ['3. Adjunta los dos archivos', 'Cada jugador necesita fotografía clara del rostro y documento de identidad. Imágenes y PDF deben respetar los formatos permitidos.'],
                    ['4. Espera el guardado automático', 'Cuando todos los campos estén válidos aparecerá “Guardando jugador…”. No cierres la ventana ni cambies de página durante ese proceso.'],
                    ['5. Confirma la inscripción', 'El jugador debe desaparecer de la tarjeta de carga y aparecer en la nómina exterior. Verde significa que tiene ambos archivos; rojo significa que todavía falta alguno.'],
                    ['6. Corrige desde Editar jugadores', 'Activa el botón maestro “Editar jugadores” para modificar datos, reemplazar archivos o eliminar un registro. Finaliza el modo edición al terminar.'],
                  ].map(([title, description]) => <li key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-950">{title}</p><p className="mt-1.5 text-sm font-semibold leading-relaxed text-slate-600">{description}</p></li>)}
                </ol>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-red-700">¿Cuándo puede perderse un borrador local?</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm font-semibold leading-relaxed text-red-900"><li>Al borrar los datos, caché o almacenamiento del navegador.</li><li>Al usar modo incógnito o permitir que el navegador elimine datos automáticamente.</li><li>Al cambiar de computador, navegador, perfil o dominio.</li><li>Al pulsar “Eliminar borrador”.</li></ul><p className="mt-3 border-t border-red-200 pt-3 text-sm font-black text-red-800">Una actualización normal de la aplicación no elimina el borrador si se conserva el mismo navegador y dominio.</p></div>
                <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase text-emerald-700">Verde</p><p className="mt-1 text-xs font-bold text-emerald-900">Jugador con foto y documento.</p></div><div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-[10px] font-black uppercase text-red-700">Rojo</p><p className="mt-1 text-xs font-bold text-red-900">Jugador con archivos pendientes.</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase text-amber-700">Ámbar</p><p className="mt-1 text-xs font-bold text-amber-900">Archivos pendientes de revisión.</p></div></div>
              </div>
              <footer className="border-t border-slate-100 bg-white p-4 sm:p-5"><button type="button" onClick={() => setShowRegistrationGuide(false)} className="h-12 w-full rounded-xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white">Entendido, iniciar inscripción</button></footer>
            </section>
          </div>
        )}

        {editingPlayer && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <form onSubmit={savePlayerEdition} className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[1.5rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Editar jugador</p><h2 className="text-xl font-black uppercase text-slate-950">Información de inscripción</h2></div><button type="button" onClick={() => setEditingPlayer(null)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><X size={18} /></button></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Nombre completo<input required value={editPlayerForm.name} onChange={(event) => setEditPlayerForm({ ...editPlayerForm, name: event.target.value.toUpperCase() })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-black uppercase text-slate-950 outline-none focus:border-blue-500" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Identificación<input required inputMode="numeric" value={editPlayerForm.identityNumber} onChange={(event) => setEditPlayerForm({ ...editPlayerForm, identityNumber: event.target.value.replace(/\D/g, '') })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-950 outline-none focus:border-blue-500" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dorsal<input required type="number" min="1" max="999" value={editPlayerForm.shirtNumber} onChange={(event) => setEditPlayerForm({ ...editPlayerForm, shirtNumber: event.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-950 outline-none focus:border-blue-500" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Fecha de nacimiento<input required type="date" value={editPlayerForm.birthDate} onChange={(event) => setEditPlayerForm({ ...editPlayerForm, birthDate: event.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-950 outline-none focus:border-blue-500" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Vínculo<select required value={editPlayerForm.vinculo} onChange={(event) => setEditPlayerForm({ ...editPlayerForm, vinculo: event.target.value, relationshipDetail: '' })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold uppercase text-slate-950 outline-none focus:border-blue-500"><option value="">Seleccionar</option>{ALLOWED_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></label>
                {(editPlayerForm.vinculo === 'EX-ALUMNO' || editPlayerForm.vinculo === 'PADRE DE FAMILIA') && <label className="sm:col-span-2 text-[10px] font-black uppercase tracking-wider text-slate-500">{editPlayerForm.vinculo === 'EX-ALUMNO' ? 'Año de promoción' : 'Nombre completo del estudiante'}<input required value={editPlayerForm.relationshipDetail} onChange={(event) => setEditPlayerForm({ ...editPlayerForm, relationshipDetail: event.target.value.toUpperCase() })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold uppercase text-slate-950 outline-none focus:border-blue-500" /></label>}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingPlayer(null)} className="h-12 rounded-xl bg-slate-100 px-5 text-xs font-black uppercase text-slate-600">Cancelar</button><button disabled={loading} className="h-12 rounded-xl bg-blue-600 px-6 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">Guardar cambios</button></div>
            </form>
          </div>
        )}

        {selectedHistoryMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4">
            <div className="max-h-[94dvh] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl sm:max-h-[88dvh] sm:rounded-[2rem]">
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

        {selectedStatDetail && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4" onClick={() => setSelectedStatDetail(null)}>
            <section role="dialog" aria-modal="true" aria-labelledby="stat-detail-title" className="max-h-[94dvh] w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                <div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-600">Detalle del equipo</p><h2 id="stat-detail-title" className="text-xl font-black uppercase">{statDetailTitle}</h2></div>
                <button type="button" onClick={() => setSelectedStatDetail(null)} className="rounded-xl bg-slate-100 p-2.5 text-slate-500" aria-label="Cerrar detalle"><X size={17} /></button>
              </header>
              <div className="max-h-[65vh] divide-y divide-slate-100 overflow-y-auto p-5">
                {statDetailEvents.map((event: any) => (
                  <button type="button" key={event.id} onClick={() => event.player_id && setSelectedFineEvent(event)} className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:bg-slate-50">
                    <div className="min-w-0"><p className="truncate text-xs font-black uppercase">#{event.players?.shirt_number || '-'} {event.players?.name || 'Jugador sin asignar'}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">{eventLabel(event.event_type)} · vs. {eventOpponent(event)}{event.matches?.matchdays?.round_number ? ` · Jornada ${event.matches.matchdays.round_number}` : ''} · {event.period || 'Periodo sin registrar'}{event.minute_record ? ` · ${event.minute_record}'` : ''}</p></div>
                    {selectedStatDetail === 'DEBT' && <span className="shrink-0 text-sm font-black text-violet-700">{formatCopAmount(eventFineAmount(event))}</span>}
                  </button>
                ))}
                {statDetailEvents.length === 0 && <p className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">No hay registros para mostrar</p>}
              </div>
            </section>
          </div>
        )}

        {selectedFineEvent && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" onClick={() => setSelectedFineEvent(null)}>
            <section role="dialog" aria-modal="true" aria-labelledby="fine-proof-title" className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <header className="flex items-start justify-between gap-4 bg-slate-950 p-6 text-white">
                <div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-300">Perfil operativo del jugador</p><h2 id="fine-proof-title" className="mt-1 text-xl font-black uppercase">{selectedFineEvent.players?.name || 'Jugador'}</h2><p className="mt-1 text-xs font-bold text-slate-300">Dorsal #{selectedFineEvent.players?.shirt_number || '-'} · {eventLabel(selectedFineEvent.event_type)}</p></div>
                <button type="button" onClick={() => setSelectedFineEvent(null)} className="rounded-xl bg-white/10 p-2.5 text-white" aria-label="Cerrar perfil"><X size={18} /></button>
              </header>
              <div className="space-y-4 p-6">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Multa asociada</p><p className="mt-1 text-2xl font-black text-slate-900">{formatCopAmount(eventFineAmount(selectedFineEvent))}</p><p className="mt-1 text-xs font-bold uppercase text-amber-800">{selectedFineEvent.fine_status === 'PAID' ? 'Pagada · pendiente de sincronización visual' : 'Pendiente de validación administrativa'}</p></div>
                {selectedFineEvent.fine_status !== 'PAID' && <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-200 hover:bg-blue-700"> <Upload size={16} /> Subir comprobante<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={loading} onChange={(event) => handleFineProofUpload(event.target.files?.[0])} /></label>}
                <p className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">El comprobante será revisado por la administración. La habilitación solo ocurre después de su aprobación.</p>
              </div>
            </section>
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

        {data.teams.length > 1 && <div className="delegate-team-tabs flex gap-3 overflow-x-auto pb-2 pr-8">
          {data.teams.map((team: any) => (
            <button key={team.id} onClick={() => setSelectedTeamId(team.id)} className={`shrink-0 flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${selectedTeam?.id === team.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'}`}>
              <TeamLogo team={team} className="w-10 h-10" />
              <div>
                <p className="font-black uppercase text-xs">{team.name}</p>
                {teamTournamentCount > 1 && <p className={`text-[9px] font-black uppercase tracking-widest ${selectedTeam?.id === team.id ? 'text-blue-100' : 'text-slate-400'}`}>{team.categories?.tournaments?.name || 'Torneo'}</p>}
              </div>
            </button>
          ))}
        </div>}

        {selectedTeam && (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-center">
                <Users className="mb-2 text-blue-600" size={22} />
                <p className="text-2xl font-black">{players.length}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inscritos</p>
              </div>
              {fixtureVisibleToDelegates && <>
              <button type="button" onClick={() => setSelectedStatDetail('GOALS')} className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-md" aria-label="Ver goleadores">
                <Trophy className="mb-2 text-emerald-600" size={22} />
                <p className="text-2xl font-black">{totalScoring}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Goles/Puntos</p>
                <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-emerald-600/70">Toca para ver detalle</p>
              </button>
              <button type="button" onClick={() => setSelectedStatDetail('YELLOW')} className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-md" aria-label="Ver tarjetas amarillas">
                <Square className="mb-2 fill-yellow-400 text-yellow-400" size={22} />
                <p className="text-2xl font-black">{eventSummary.YELLOW || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Amarillas</p>
                <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-amber-700/70">Toca para ver detalle</p>
              </button>
              <button type="button" onClick={() => setSelectedStatDetail('RED')} className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/70 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-md" aria-label="Ver tarjetas rojas">
                <Square className="mb-2 fill-red-600 text-red-600" size={22} />
                <p className="text-2xl font-black">{eventSummary.RED || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rojas</p>
                <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-red-600/70">Toca para ver detalle</p>
              </button>
              <button type="button" onClick={() => setSelectedStatDetail('DEBT')} className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-violet-100 bg-violet-50/70 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-md" aria-label="Ver quién debe multas">
                <Activity className="mb-2 text-slate-700" size={22} />
                <p className="text-2xl font-black">{formatCopAmount(debt)}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Multas</p>
              </button>
              <button type="button" onClick={() => document.getElementById('upcoming-matches')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="col-span-2 flex min-h-32 flex-col items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-md md:col-span-1" aria-label="Ver próximo partido">
                <CalendarDays className="mb-2 text-cyan-600" size={22} />
                <p className="text-[9px] font-black uppercase tracking-widest text-cyan-700">Próximo rival</p>
                <p className="mt-1 truncate text-sm font-black uppercase">{nextOpponent?.name || 'Sin programación'}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{nextMatch ? `${nextMatch.matchdays?.scheduled_date || 'Fecha pendiente'} · ${nextMatch.scheduled_time?.slice(0, 5) || '--:--'}` : 'Sin próximo partido'}</p>
              </button>
              </>}
            </section>

            {fixtureVisibleToDelegates && <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
              <div className="delegate-module delegate-module-blue overflow-hidden rounded-[2rem] border border-blue-100 bg-blue-50/35">
                <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/80 p-5">
                  <div>
                    <h2 className="text-lg font-black uppercase">Tabla de posiciones</h2>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Actualizada con partidos finalizados</p>
                  </div>
                  {fullSchedule.some((match: any) => match.status === 'LIVE') && <span className="rounded-full bg-red-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-red-600">En vivo · actualiza cada 15 s</span>}
                </div>
                <div className="delegate-table-scroll overflow-x-auto">
                  <table className="min-w-[650px] w-full text-xs">
                    <thead className="bg-slate-950 text-[9px] font-black uppercase tracking-widest text-white"><tr><th className="p-3 text-left">Pos.</th><th className="p-3 text-left">Equipo</th><th className="p-3">PJ</th><th className="p-3">G</th><th className="p-3">E</th><th className="p-3">P</th><th className="p-3">{sportRules.scoreLabels.for}</th><th className="p-3">{sportRules.scoreLabels.against}</th><th className="p-3">DG</th><th className="p-3">PTS</th></tr></thead>
                    <tbody className="divide-y divide-blue-100 bg-white/85">
                      {standings.map((team: any, index: number) => <tr key={team.id} className={team.id === selectedTeam.id ? 'delegate-standing-highlight' : ''}><td className="p-3 font-black text-slate-400">{index + 1}</td><td className="p-3 font-black uppercase">{team.name}</td><td className="p-3 text-center font-bold">{team.played}</td><td className="p-3 text-center font-bold">{team.won}</td><td className="p-3 text-center font-bold">{team.drawn}</td><td className="p-3 text-center font-bold">{team.lost}</td><td className="p-3 text-center font-bold">{team.goals_for}</td><td className="p-3 text-center font-bold">{team.goals_against}</td><td className="p-3 text-center font-bold">{team.goals_for - team.goals_against}</td><td className="p-3 text-center font-black text-blue-600">{team.points}</td></tr>)}
                    </tbody>
                  </table>
                  {standings.length === 0 && <p className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">No hay equipos programados</p>}
                </div>
              </div>

              <div className="delegate-module delegate-module-indigo rounded-[2rem] border border-indigo-100 bg-indigo-50/45 p-5">
                <h2 className="text-lg font-black uppercase">Estadísticas del equipo</h2>
                <p className="mb-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Rendimiento oficial</p>
                <div className="grid grid-cols-2 gap-3">
                  {[['Posición', selectedStanding ? `${standings.indexOf(selectedStanding) + 1}°` : '-'], ['Partidos', selectedStanding?.played || 0], ['Ganados', selectedStanding?.won || 0], ['Empatados', selectedStanding?.drawn || 0], ['Perdidos', selectedStanding?.lost || 0], ['Diferencia', selectedStanding ? selectedStanding.goals_for - selectedStanding.goals_against : 0]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-indigo-100 bg-white/75 p-4"><p className="text-xl font-black">{value}</p><p className="text-[9px] font-black uppercase tracking-widest text-indigo-400">{label}</p></div>)}
                </div>
              </div>
            </section>}

            {fixtureVisibleToDelegates && <section className="grid gap-6 lg:grid-cols-2">
              <div className="delegate-module delegate-module-emerald rounded-[2rem] border border-emerald-100 bg-emerald-50/45 p-5">
                <h2 className="text-lg font-black uppercase">{sportRules.scoreLabels.scorerPlural} y goleadores</h2>
                <div className="mt-4 divide-y divide-slate-100">
                  {scorers.map((player: any, index: number) => <div key={player.id} className="flex items-center justify-between py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-xs font-black text-emerald-700">{index + 1}</span><div><p className="text-xs font-black uppercase">{player.name}</p><p className="text-[9px] font-bold uppercase text-slate-400">Dorsal #{player.shirtNumber || '-'}</p></div></div><span className="text-xl font-black text-emerald-600">{player.total}</span></div>)}
                  {scorers.length === 0 && <p className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Sin anotaciones registradas</p>}
                </div>
              </div>
              <div className="delegate-module delegate-module-amber rounded-[2rem] border border-amber-100 bg-amber-50/45 p-5">
                <h2 className="text-lg font-black uppercase">Tarjetas y sanciones</h2>
                <div className="mt-4 divide-y divide-slate-100">
                  {cardEvents.map((event: any) => <button type="button" key={event.id} onClick={() => setSelectedFineEvent(event)} className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-amber-50"><div className="flex min-w-0 items-center gap-3"><Square size={18} className={event.event_type === 'RED' ? 'fill-red-600 text-red-600' : 'fill-yellow-400 text-yellow-400'} /><div className="min-w-0"><p className="truncate text-xs font-black uppercase">{event.players?.name || 'Jugador sin asignar'}</p><p className="text-[9px] font-bold uppercase text-slate-400">{eventLabel(event.event_type)} · vs. {eventOpponent(event)}{event.matches?.matchdays?.round_number ? ` · Jornada ${event.matches.matchdays.round_number}` : ''} · {event.fine_status === 'PAID' ? 'Pagada' : 'Pendiente'}</p></div></div><span className="shrink-0 text-xs font-black">{formatCopAmount(eventFineAmount(event))}</span></button>)}
                  {cardEvents.length === 0 && <p className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Sin tarjetas ni sanciones</p>}
                </div>
              </div>
            </section>}

            {false && <section className="delegate-module delegate-module-violet rounded-[2rem] border border-violet-100 bg-violet-50/50 p-5">
              <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-violet-600 p-3 text-white"><Users size={20} /></div><div><h2 className="text-lg font-black uppercase">Cuerpo técnico</h2><p className="text-[9px] font-black uppercase tracking-widest text-violet-500">Inscripción oficial de la delegación</p></div></div>
              <form onSubmit={handleSaveStaff} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Técnico<input required value={staffForm.headCoach} onChange={(event) => setStaffForm({ ...staffForm, headCoach: event.target.value.toUpperCase() })} placeholder="Nombre completo del técnico" className="mt-1.5 w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-xs font-bold uppercase outline-none focus:border-violet-500" /></label>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Asistente técnico<input required value={staffForm.assistantCoach} onChange={(event) => setStaffForm({ ...staffForm, assistantCoach: event.target.value.toUpperCase() })} placeholder="Nombre completo del asistente" className="mt-1.5 w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-xs font-bold uppercase outline-none focus:border-violet-500" /></label>
                <button disabled={loading || !canEditRoster} className="self-end rounded-xl bg-violet-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">Guardar</button>
              </form>
            </section>}

            <div className="flex justify-end"><button type="button" onClick={() => { setTransferSourceTeamId(''); setShowTransferModal(true); }} disabled={transferableTeams.length === 0 || !canEditRoster} className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-[9px] font-black uppercase tracking-widest text-blue-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40">Copiar expediente desde otro torneo</button></div>
            <section className="grid grid-cols-1 gap-6">
              <div className="delegate-module delegate-module-sky self-start overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
                <button type="button" onClick={() => setShowRegistrationModule((open) => !open)} className="flex w-full flex-col gap-3 border-b border-slate-100 p-5 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between" aria-expanded={showRegistrationModule}>
                  <div>
                    <h2 className="font-black uppercase text-xl">Nómina</h2>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {players.length} inscritos · {canEditRoster ? 'Inscripción abierta' : 'Inscripción cerrada'}
                    </p>
                  </div>
                  <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-700">{showRegistrationModule ? 'Ocultar planilla' : 'Ver planilla'}<ChevronDown size={18} className={`transition-transform ${showRegistrationModule ? 'rotate-180' : ''}`} /></span>
                </button>
                {showRegistrationModule && <>
                <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 sm:p-5">
                  <div className={`rounded-2xl border p-4 ${selectedCategory?.min_roster_size && players.length >= selectedCategory.min_roster_size ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${selectedCategory?.min_roster_size && players.length >= selectedCategory.min_roster_size ? 'bg-emerald-500' : 'bg-blue-600'}`}><Users size={20} /></div>
                      <div className="min-w-0">
                        <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${selectedCategory?.min_roster_size && players.length >= selectedCategory.min_roster_size ? 'text-emerald-700' : 'text-blue-700'}`}>Mínimo obligatorio</p>
                        <p className="mt-0.5 text-2xl font-black text-slate-950">{players.length} <span className="text-sm text-slate-400">/ {selectedCategory?.min_roster_size || 'sin definir'}</span></p>
                      </div>
                    </div>
                    <p className="mt-3 border-t border-current/10 pt-2 text-[9px] font-black uppercase tracking-wider text-slate-600">
                      {selectedCategory?.min_roster_size ? (players.length >= selectedCategory.min_roster_size ? 'Nómina mínima completada' : `Faltan ${selectedCategory.min_roster_size - players.length} jugador(es)`) : 'La organización debe definir el mínimo'} · Máximo {selectedCategory?.max_roster_size || 'sin definir'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white"><CalendarDays size={20} /></div>
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-700 sm:text-[10px]">Fecha máxima de inscripción</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-black uppercase tracking-wider shadow-sm ${registrationCountdown(selectedCategory?.registration_deadline).className}`}>{registrationCountdown(selectedCategory?.registration_deadline).label}</span>
                    </div>
                    <p className="mt-4 break-words text-lg font-black uppercase leading-tight tracking-tight text-slate-950 sm:text-xl lg:text-2xl">{registrationDeadlineLabel(selectedCategory?.registration_deadline)}</p>
                    <p className="mt-4 border-t border-amber-200 pt-3 text-[9px] font-black uppercase leading-relaxed tracking-wider text-amber-800">Después de esta fecha no se podrán modificar jugadores</p>
                  </div>
                </div>
                <div className={`grid gap-3 border-b border-slate-100 bg-white p-4 sm:p-5 ${canEditRoster ? 'sm:grid-cols-2' : ''}`}>
                  <button type="button" onClick={() => setShowRegistrationGuide(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-amber-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-md sm:text-xs"><CircleHelp size={17} /> Ver tutorial de inscripción</button>
                  {canEditRoster && <button type="button" onClick={openBulkUpload} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-100 hover:shadow-md sm:text-xs"><FileSpreadsheet size={17} /> Abrir planilla de inscripción</button>}
                </div>
                {canEditRoster && players.length > 0 && (
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
                    <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Control de edición</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Activa las acciones para todos los jugadores</p></div>
                    <button type="button" aria-pressed={rosterEditMode} onClick={() => setRosterEditMode((enabled) => !enabled)} className={`flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[10px] font-black uppercase tracking-wider transition ${rosterEditMode ? 'bg-slate-950 text-white shadow-lg' : 'border border-blue-200 bg-blue-50 text-blue-700'}`}><Pencil size={15} /> {rosterEditMode ? 'Finalizar edición' : 'Editar jugadores'}</button>
                  </div>
                )}
                {!canEditRoster && (
                  <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Lock size={16} /></div>
                      <div><p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Inscripción cerrada</p><p className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{selectedCategory?.roster_locked_message?.trim() || DEFAULT_ROSTER_LOCKED_MESSAGE}</p></div>
                    </div>
                  </div>
                )}
                {players.length > 0 ? (
                  <>
                  <div className="divide-y divide-sky-100 bg-white/70 lg:hidden">
                    <div className="grid grid-cols-[64px_minmax(0,1fr)_88px] items-center bg-slate-950 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white sm:px-5"><span>Dorsal</span><span>Jugador / estado</span><span className="text-right">Acciones</span></div>
                    {players.map((player: any, index: number) => {
                      const faceDocument = player.player_documents?.find((item: any) => item.document_type === 'FACE_PHOTO');
                      const identityDocument = player.player_documents?.find((item: any) => item.document_type === 'IDENTITY_FRONT');
                      const hasCompleteFiles = Boolean(faceDocument && identityDocument);
                      const dossier = playerDossierStatus(player.player_documents);
                      const compactDocumentAction = (documentType: 'FACE_PHOTO' | 'IDENTITY_FRONT', document: any, label: string) => (
                        <div className={`flex min-w-0 items-center overflow-hidden rounded-xl border shadow-sm ${document ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50'}`}>
                          {document && <button type="button" onClick={() => openPlayerDocument(player.id, documentType)} className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-slate-200 text-blue-600 hover:bg-blue-50" aria-label={`Ver ${label}`}><Eye size={15} /></button>}
                          <label className={`flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 text-[9px] font-black uppercase tracking-wider ${document ? 'text-slate-700 hover:bg-slate-50' : 'text-blue-700 hover:bg-blue-100'}`}>
                            <Upload size={13} /> <span className="truncate">{document ? `Cambiar ${label}` : `Subir ${label}`}</span>
                            <input type="file" accept={documentType === 'FACE_PHOTO' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} className="hidden" disabled={loading} onChange={(event) => handlePlayerDocumentUpload(player.id, documentType, event.target.files?.[0])} />
                          </label>
                        </div>
                      );
                      return (
                        <article key={player.id} className={`p-4 transition-colors sm:p-5 ${hasCompleteFiles ? 'bg-emerald-50/70' : 'bg-red-50/70'}`}>
                          <div className="flex items-start gap-3">
                            <span className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 px-2 text-xs font-black text-blue-700">#{player.shirt_number || '-'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-black uppercase text-slate-950">{index + 1}. {player.name}</p>{rosterEditMode && <button type="button" onClick={() => openPlayerEditor(player)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700" aria-label={`Editar a ${player.name}`}><Pencil size={15} /></button>}</div><p className="mt-1 text-[11px] font-bold text-slate-500">ID {player.identity_number || 'SIN REGISTRAR'} · {player.birth_date || player.birth_year || 'SIN FECHA'}</p></div>
                                {rosterEditMode && <button type="button" onClick={() => handleDeletePlayer(player)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 shadow-sm transition hover:bg-red-600 hover:text-white" aria-label={`Eliminar a ${player.name}`} title="Eliminar jugador"><Trash2 size={17} /></button>}
                              </div>
                              <p className="mt-2 text-[10px] font-black uppercase leading-relaxed tracking-wider text-slate-500">{ageOnDate(player.birth_date, selectedCategory?.tournaments?.schedule_dates?.[0]) ?? '-'} años · {player.vinculo || 'Sin vínculo'}{player.relationship_detail ? ` · ${player.relationship_detail}` : ''}</p>
                              <p className={`mt-2 text-[10px] font-black uppercase ${dossier.className}`}>{dossier.label}</p>
                            </div>
                          </div>
                          {rosterEditMode && <div className="mt-3 grid grid-cols-2 gap-2">
                            {compactDocumentAction('FACE_PHOTO', faceDocument, 'foto')}
                            {compactDocumentAction('IDENTITY_FRONT', identityDocument, 'documento')}
                          </div>}
                        </article>
                      );
                    })}
                  </div>
                  <div className="delegate-table-scroll hidden overflow-x-auto lg:block">
                    <table className="min-w-[1180px] w-full text-left text-xs">
                      <thead className="bg-slate-950 text-[9px] font-black uppercase tracking-widest text-white">
                        <tr><th className="sticky left-0 z-30 w-12 min-w-12 bg-slate-950 p-3 text-center">#</th><th className="sticky left-12 z-30 w-20 min-w-20 bg-slate-950 p-3 text-center">Dorsal</th><th className="sticky left-32 z-30 min-w-[220px] bg-slate-950 p-3 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.55)]">Jugador</th><th className="p-3">Identificación</th><th className="p-3">Nacimiento</th><th className="p-3 text-center">Edad</th><th className="p-3">Vínculo</th><th className="p-3 text-center">Foto</th><th className="p-3 text-center">Documento</th><th className="p-3">Estado</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {players.map((player: any, index: number) => {
                          const faceDocument = player.player_documents?.find((item: any) => item.document_type === 'FACE_PHOTO');
                          const identityDocument = player.player_documents?.find((item: any) => item.document_type === 'IDENTITY_FRONT');
                          const hasCompleteFiles = Boolean(faceDocument && identityDocument);
                          const dossier = playerDossierStatus(player.player_documents);
                          const documentCell = (documentType: 'FACE_PHOTO' | 'IDENTITY_FRONT', document: any, label: string) => (
                            <div className="flex items-center justify-center gap-1.5">
                              {document && <button type="button" onClick={() => openPlayerDocument(player.id, documentType)} className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600 hover:bg-blue-100" aria-label={`Ver ${label}`} title={`Ver ${label}`}><Eye size={14} /></button>}
                              {rosterEditMode && <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-[8px] font-black uppercase tracking-wider text-white ${document ? 'bg-slate-700' : 'bg-blue-600'}`} title={document ? `Reemplazar ${label}` : `Subir ${label}`}>
                                <Upload size={12} /> {document ? 'Cambiar' : 'Subir'}
                                <input type="file" accept={documentType === 'FACE_PHOTO' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} className="hidden" disabled={loading} onChange={(event) => handlePlayerDocumentUpload(player.id, documentType, event.target.files?.[0])} />
                              </label>}
                            </div>
                          );
                          return (
                            <tr key={player.id} className={`transition-colors ${hasCompleteFiles ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'bg-red-50/60 hover:bg-red-50'}`}>
                              <td className="sticky left-0 z-20 bg-inherit p-3 text-center font-black text-slate-400">{index + 1}</td>
                              <td className="sticky left-12 z-20 bg-inherit p-3 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-blue-50 px-2 py-2 font-black text-blue-700">#{player.shirt_number || '-'}</span></td>
                              <td className="sticky left-32 z-20 min-w-[220px] bg-inherit p-3 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.55)]"><div className="flex items-center gap-2"><p className="font-black uppercase text-slate-950">{player.name}</p>{rosterEditMode && <button type="button" onClick={() => openPlayerEditor(player)} className="rounded-lg bg-blue-100 p-2 text-blue-700 hover:bg-blue-200" aria-label={`Editar a ${player.name}`}><Pencil size={14} /></button>}</div>{player.relationship_detail && <p className="mt-1 text-[9px] font-bold uppercase text-slate-400">{player.relationship_detail}</p>}</td>
                              <td className="p-3 font-bold text-slate-600">{player.identity_number || 'SIN REGISTRAR'}</td>
                              <td className="p-3 font-bold text-slate-600">{player.birth_date || player.birth_year || 'SIN FECHA'}</td>
                              <td className="p-3 text-center font-black text-slate-600">{ageOnDate(player.birth_date, selectedCategory?.tournaments?.schedule_dates?.[0]) ?? '-'}</td>
                              <td className="p-3 text-[10px] font-black uppercase text-slate-600">{player.vinculo || 'Sin vínculo'}</td>
                              <td className="p-3">{documentCell('FACE_PHOTO', faceDocument, 'fotografía del rostro')}</td>
                              <td className="p-3">{documentCell('IDENTITY_FRONT', identityDocument, 'documento de identidad')}</td>
                              <td className={`p-3 text-[9px] font-black uppercase ${dossier.className}`}>{dossier.label}</td>
                              <td className="p-3 text-center">{rosterEditMode && <button type="button" onClick={() => handleDeletePlayer(player)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 shadow-sm transition hover:bg-red-600 hover:text-white" aria-label={`Eliminar a ${player.name}`} title="Eliminar jugador"><Trash2 size={15} /></button>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </>
                ) : <p className="p-8 text-center text-slate-400 text-xs font-black uppercase tracking-widest">Sin jugadores inscritos</p>}
                </>}
              </div>

              <div className="grid gap-6">
                {fixtureVisibleToDelegates ? <div id="upcoming-matches" className="delegate-module delegate-module-cyan scroll-mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 xl:min-w-[420px]">
                  <h2 className="font-black uppercase text-lg mb-1">Próximo partido</h2>
                  <p className="mb-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Tu equipo vs. próximo rival</p>
                  <div className="space-y-3">
                    {(showAllUpcoming ? teamUpcomingMatches : teamUpcomingMatches.slice(0, 1)).map((match: any) => renderMatchCard(match))}
                    {teamUpcomingMatches.length === 0 && <p className="text-center text-slate-400 text-xs font-black uppercase tracking-widest py-8">Sin partidos pendientes</p>}
                    {teamUpcomingMatches.length > 1 && <button type="button" onClick={() => setShowAllUpcoming((open) => !open)} className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyan-700 transition hover:bg-cyan-100" aria-expanded={showAllUpcoming}>{showAllUpcoming ? 'Mostrar solo el próximo' : `Ver los ${teamUpcomingMatches.length} partidos`}</button>}
                  </div>
                </div> : <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-6 text-center xl:min-w-[420px]"><Lock className="mx-auto text-indigo-400" size={24} /><h2 className="mt-3 text-sm font-black uppercase text-indigo-800">Fixture pendiente de publicación</h2><p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-indigo-400">La organización lo habilitará cuando esté confirmado.</p></div>}
              </div>
            </section>

            {fixtureVisibleToDelegates && <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="delegate-module delegate-module-slate rounded-[2rem] border border-slate-200 bg-white p-5">
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

              {fixtureVisibleToDelegates && <div className="delegate-module delegate-module-blue rounded-[2rem] border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><h2 className="font-black uppercase text-lg">Jornadas de la fase actual</h2><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fase {currentPhase} · incluye fechas futuras programadas</p></div>
                  {lastScheduledRound && <button type="button" onClick={() => setActiveRound(lastScheduledRound)} className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100">Ver última programada</button>}
                </div>
                {roundEntries.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {roundEntries.map(([round, roundMatches]) => (
                      <div key={round} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setActiveRound(selectedRound === round ? '' : round)}
                          className={`flex w-full items-center justify-center rounded-xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedRound === round ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300'}`}
                          aria-expanded={selectedRound === round}
                        >
                          {round}
                          <span className={`ml-2 rounded-full px-2 py-0.5 ${selectedRound === round ? 'bg-white/20' : 'bg-white'}`}>{(roundMatches as any[]).length}</span>
                          <ChevronDown size={15} className={`ml-2 transition-transform ${selectedRound === round ? 'rotate-180' : ''}`} />
                        </button>
                        {selectedRound === round && <div className="space-y-2 rounded-2xl border border-blue-100 bg-blue-50/35 p-2 sm:p-3">
                          {(roundMatches as any[]).map((match) => renderRoundMatchCard(match))}
                        </div>}
                      </div>
                    ))}
                  </div>
                )}
                {roundEntries.length === 0 && <p className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center text-[10px] font-black uppercase tracking-widest text-blue-500">No hay jornadas generadas para esta fase</p>}
              </div>}
            </section>}
          </>
        )}
        {lineupMatch && selectedTeam && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" onClick={() => setLineupMatch(null)}>
            <section role="dialog" aria-modal="true" aria-labelledby="lineup-title" className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <header className="flex items-start justify-between bg-slate-950 p-5 text-white"><div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-300">Partido del día</p><h2 id="lineup-title" className="text-xl font-black uppercase">Organizar alineación</h2><p className="mt-1 text-xs font-bold text-slate-300">{lineupMatch.home_team?.name} vs {lineupMatch.away_team?.name}</p></div><button type="button" onClick={() => setLineupMatch(null)} className="rounded-xl bg-white/10 p-2" aria-label="Cerrar"><X size={18}/></button></header>
              <div className="overflow-y-auto p-5 space-y-4">
                {isFootball9Category && <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Plantilla del equipo</p><p className="mt-1 text-[10px] font-bold text-slate-500">Puedes iniciar una nueva o reutilizar la guardada.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={startNewLineup} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-600">Nueva</button>{savedDefaultLineup && <button type="button" onClick={useSavedDefaultLineup} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-wider text-blue-700">Usar guardada</button>}<button type="button" onClick={saveCurrentAsDefaultLineup} className="rounded-xl bg-blue-600 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white">Guardar predeterminada</button></div></div>}
                {isFootball9Category && <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr] rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3"><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Formación Fútbol 9<select value={lineupFormation} onChange={(event) => changeLineupFormation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800">{['3-3-2', '3-2-3', '2-3-3', '2-4-2', '4-3-1', '3-4-1'].map((code) => <option key={code} value={code}>{code}{code === '3-3-2' ? ' · Recomendada' : ''}</option>)}</select></label><p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">{getFootball9Formation(lineupFormation).name} · 1 portero + 8 jugadores de campo</p></div><FormationBoard positions={getFootball9Formation(lineupFormation).players} assignments={lineupAssignments} players={players} blockedPlayerIds={players.filter((player: any) => events.some((event: any) => event.player_id === player.id && (event.event_type === 'RED' || (event.event_type === 'YELLOW' && event.fine_status !== 'PAID') || event.fine_status === 'UNPAID'))).map((player: any) => player.id)} onAssign={assignLineupPlayer} /></div>}
                <div><p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Titulares de {selectedTeam.name} · seleccionados {lineupSelection.length}{isFootball9Category ? ' / 9' : ''}</p><div className="grid gap-2 sm:grid-cols-2">{players.map((player: any) => { const blocked = events.some((event: any) => { if (event.player_id !== player.id) return false; if (event.event_type === 'RED') return true; if (event.event_type === 'YELLOW') return event.fine_status !== 'PAID'; return event.fine_status === 'UNPAID'; }); const selected = lineupSelection.includes(player.id); const atFormationLimit = isFootball9Category && lineupSelection.length >= 9 && !selected; return <button type="button" key={player.id} disabled={blocked || atFormationLimit} onClick={() => setLineupSelection((current) => selected ? current.filter((id) => id !== player.id) : [...current, player.id])} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700'} ${blocked || atFormationLimit ? 'cursor-not-allowed bg-slate-100 opacity-50' : ''}`}><span className="w-8 text-center text-lg font-black">#{player.shirt_number || '-'}</span><span className="truncate text-xs font-black uppercase">{player.name}</span>{blocked ? <span className="ml-auto text-[9px] font-black uppercase text-red-600">Bloqueado</span> : atFormationLimit ? <span className="ml-auto text-[9px] font-black uppercase text-slate-400">Máximo 9</span> : selected && <CheckCircle2 size={16} className="ml-auto"/>}</button>; })}</div></div>
              </div>
              <footer className="flex gap-3 border-t border-slate-100 p-5"><button type="button" onClick={() => setLineupMatch(null)} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600">Cancelar</button><button type="button" disabled={loading} onClick={handleSaveLineup} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">Enviar a Mesa</button></footer>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
