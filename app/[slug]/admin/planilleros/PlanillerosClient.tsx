'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CheckCircle2, ExternalLink, KeyRound, Lock, MonitorPlay, Plus, Trash2, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { promptDialog } from '@/app/components/AppDialog';
import {
  assignScorekeeperMatch,
  createScorekeeperUser,
  removeScorekeeperMatch,
  resetScorekeeperPassword,
  toggleScorekeeperStatus,
} from './actions';

const roleLabels: Record<string, string> = {
  JUDGE: 'Juez',
  SCOREKEEPER: 'Planillero',
  SUPERVISOR: 'Supervisor',
};

function passwordLabel(user: any) {
  if (user.must_change_password) return user.assigned_password || 'Pendiente de asignar';
  if (user.password_changed_at) return 'Cambiada por usuario';
  return user.assigned_password || 'No registrada';
}

function matchLabel(match: any) {
  const home = match.home_team?.name || 'Local';
  const away = match.away_team?.name || 'Visitante';
  const date = match.matchdays?.scheduled_date || 'Sin fecha';
  const time = match.scheduled_time?.slice(0, 5) || '--:--';
  const category = match.matchdays?.categories?.name || 'Categoría';
  return `${date} ${time} · ${home} vs ${away} · ${category}`;
}

function matchDate(match: any) {
  return match.matchdays?.scheduled_date || 'Sin fecha';
}

function matchTime(match: any) {
  return match.scheduled_time?.slice(0, 5) || '--:--';
}

function matchRound(match: any) {
  const round = match.matchdays?.round_number;
  return round ? `Jornada ${round}` : matchDate(match);
}

function teamLabel(team: any) {
  return team?.name || 'Visitante';
}

function statusLabel(status: string | null) {
  if (status === 'LIVE') return 'En vivo';
  if (status === 'FINISHED') return 'Finalizado';
  return 'Programado';
}

const roleOptions = [
  { value: 'SCOREKEEPER', label: 'Planillero' },
  { value: 'JUDGE', label: 'Juez' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
] as const;

export default function PlanillerosClient({ slug, initialData }: { slug: string; initialData: any }) {
  const [scorekeepers, setScorekeepers] = useState<any[]>(initialData.scorekeepers || []);
  const [selectedScorekeeperId, setSelectedScorekeeperId] = useState(initialData.scorekeepers?.[0]?.id || '');
  const [selectedTournamentId, setSelectedTournamentId] = useState(initialData.tournaments?.[0]?.id || '');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [selectedRound, setSelectedRound] = useState('');
  const [form, setForm] = useState({ name: '', username: '', password: '', email: '', role: 'SCOREKEEPER' as 'JUDGE' | 'SCOREKEEPER' | 'SUPERVISOR' });
  const [loading, setLoading] = useState(false);

  const selectedScorekeeper = scorekeepers.find((user) => user.id === selectedScorekeeperId);
  const assignedMatches = useMemo(() => {
    const assignments = new Map<string, any>();
    scorekeepers.forEach((user) => {
      (user.scorekeeper_match_access || []).forEach((access: any) => {
        if (access.match_id) assignments.set(access.match_id, user);
      });
    });
    return assignments;
  }, [scorekeepers]);

  const filteredMatches = useMemo(() => {
    if (!selectedTournamentId) return initialData.matches || [];
    return (initialData.matches || []).filter((match: any) => match.matchdays?.categories?.tournaments?.id === selectedTournamentId);
  }, [initialData.matches, selectedTournamentId]);

  const rounds = useMemo(() => {
    const unique = new Map<string, { key: string; label: string; date: string }>();
    filteredMatches.forEach((match: any) => {
      const key = String(match.matchdays?.round_number || matchDate(match));
      if (!unique.has(key)) unique.set(key, { key, label: matchRound(match), date: matchDate(match) });
    });
    return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  }, [filteredMatches]);

  const visibleRound = selectedRound && rounds.some((round) => round.key === selectedRound) ? selectedRound : rounds[0]?.key || '';
  const roundMatches = useMemo(() => {
    return filteredMatches.filter((match: any) => String(match.matchdays?.round_number || matchDate(match)) === visibleRound);
  }, [filteredMatches, visibleRound]);

  const reload = () => window.location.reload();
  const runAction = async (promise: Promise<any>, successMessage: string) => {
    setLoading(true);
    const result = await promise;
    if (!result.success) toast.error(result.error);
    else {
      toast.success(successMessage);
      reload();
    }
    setLoading(false);
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    runAction(createScorekeeperUser(slug, form), 'Usuario operativo creado');
  };

  const handleToggleMatch = (match: any) => {
    const assignedUser = assignedMatches.get(match.id);
    if (assignedUser && assignedUser.id !== selectedScorekeeper?.id) {
      toast.error('Este partido ya está asignado.');
      return;
    }
    setSelectedMatchId(match.id);
    if (assignedUser?.id === selectedScorekeeper.id) {
      runAction(removeScorekeeperMatch(slug, selectedScorekeeper.id, match.id), 'Partido removido');
      return;
    }
    runAction(assignScorekeeperMatch(slug, selectedScorekeeper.id, match.id), 'Partido asignado');
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-6 sm:py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/${slug}/admin`} className="w-fit mb-4 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <ArrowLeft size={16} /> Volver al inicio
            </Link>
            <p className="text-blue-600 font-black text-[10px] uppercase tracking-[0.25em]">Operación de partidos</p>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Jueces y Planilleros</h1>
          </div>
          <a href={`/${slug}/planillero`} target="_blank" className="w-full sm:w-fit text-center bg-slate-900 text-white rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest">
            Abrir portal <ExternalLink size={14} className="inline ml-2" />
          </a>
        </div>

        {!initialData.schemaReady && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-black uppercase tracking-widest">
            Falta aplicar la migración del portal de planilleros. Puedes ver la pantalla, pero la creación y asignación se habilitan al aplicar la migración.
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="text-blue-600" />
              <h2 className="font-black uppercase text-xl">Crear usuario</h2>
            </div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })} placeholder="Nombre" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold uppercase outline-none" />
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Usuario" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none" />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email opcional" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none" />
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Contraseña inicial opcional" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none" />
            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setForm({ ...form, role: role.value })}
                  className={`rounded-xl border px-2 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${form.role === role.value ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-100' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-200'}`}
                >
                  {role.label}
                </button>
              ))}
            </div>
            <button disabled={loading || !initialData.schemaReady} className="w-full bg-blue-600 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
              <Plus size={16} /> Crear
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-black uppercase text-xl">Usuarios operativos</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {scorekeepers.map((user) => (
                <button key={user.id} onClick={() => setSelectedScorekeeperId(user.id)} className={`w-full text-left p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${selectedScorekeeperId === user.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <div className="min-w-0">
                    <p className="font-black uppercase break-words">{user.name}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usuario: {user.username}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clave: {passwordLabel(user)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-600">{roleLabels[user.role] || user.role}</span>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${user.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{user.is_active ? 'Activo' : 'Bloqueado'}</span>
                    <span className="text-[10px] font-black text-slate-400">{user.scorekeeper_match_access?.length || 0} partidos</span>
                  </div>
                </button>
              ))}
              {scorekeepers.length === 0 && <p className="p-8 text-center text-slate-400 text-xs font-black uppercase tracking-widest">No hay usuarios operativos creados</p>}
            </div>
          </div>
        </section>

        {selectedScorekeeper && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 space-y-4 overflow-hidden">
              <h2 className="font-black uppercase text-lg sm:text-xl flex items-center gap-2 break-words">
                <MonitorPlay className="text-blue-600 shrink-0" /> Partidos de {selectedScorekeeper.name}
              </h2>
              <div className="space-y-4">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => { setSelectedTournamentId(''); setSelectedMatchId(''); setSelectedRound(''); }}
                    className={`shrink-0 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-widest ${!selectedTournamentId ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                  >
                    Todos
                  </button>
                  {initialData.tournaments.map((tournament: any) => (
                    <button
                      key={tournament.id}
                      onClick={() => { setSelectedTournamentId(tournament.id); setSelectedMatchId(''); setSelectedRound(''); }}
                      className={`shrink-0 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-widest ${selectedTournamentId === tournament.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                    >
                      {tournament.name}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {rounds.map((round) => (
                    <button
                      key={round.key}
                      onClick={() => { setSelectedRound(round.key); setSelectedMatchId(''); }}
                      className={`shrink-0 rounded-xl border px-4 py-3 text-left transition-all ${visibleRound === round.key ? 'border-slate-900 bg-slate-900 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">{round.label}</span>
                      <span className="block text-[10px] font-bold opacity-70">{round.date}</span>
                    </button>
                  ))}
                  {rounds.length === 0 && (
                    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                      No hay partidos para mostrar
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 max-h-[460px] overflow-y-auto pr-1">
                  {roundMatches.map((match: any) => {
                    const assignedUser = assignedMatches.get(match.id);
                    const isAssignedToSelected = assignedUser?.id === selectedScorekeeper.id;
                    const isLocked = Boolean(assignedUser && !isAssignedToSelected);
                    return (
                      <button
                        key={match.id}
                        type="button"
                        disabled={loading || isLocked}
                        onClick={() => handleToggleMatch(match)}
                        className={`group text-left rounded-2xl border p-4 transition-all ${isAssignedToSelected ? 'border-emerald-200 bg-emerald-50 hover:border-red-200 hover:bg-red-50 hover:shadow-xl hover:-translate-y-0.5' : isLocked ? 'border-slate-200 bg-slate-100 opacity-70 cursor-not-allowed' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-xl hover:-translate-y-0.5'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <CalendarDays size={14} />
                            <span>{matchDate(match)} / {matchTime(match)}</span>
                          </div>
                          <span className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${match.status === 'LIVE' ? 'bg-red-50 text-red-600' : match.status === 'FINISHED' ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-600'}`}>
                            {statusLabel(match.status)}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                          <p className="font-black uppercase text-sm leading-tight text-slate-900 break-words">{teamLabel(match.home_team)}</p>
                          <span className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black text-white">VS</span>
                          <p className="font-black uppercase text-sm leading-tight text-slate-900 text-right break-words">{teamLabel(match.away_team)}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">{match.matchdays?.categories?.name || 'Categoría'}</p>
                          {isAssignedToSelected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 group-hover:text-red-600"><CheckCircle2 size={14} /> Tocar para quitar</span>
                          ) : assignedUser ? (
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Asignado a {assignedUser.name}</span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 group-hover:text-blue-700">Asignar ahora</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                {(selectedScorekeeper.scorekeeper_match_access || []).map((access: any) => (
                  <div key={access.match_id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <span className="font-black uppercase text-xs break-words min-w-0">{matchLabel(access.matches)}</span>
                    <button onClick={() => runAction(removeScorekeeperMatch(slug, selectedScorekeeper.id, access.match_id), 'Partido removido')} className="text-red-500 p-2 hover:bg-red-50 rounded-lg shrink-0"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 space-y-4">
              <h2 className="font-black uppercase text-lg sm:text-xl">Control de acceso</h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => runAction(toggleScorekeeperStatus(slug, selectedScorekeeper.id, !selectedScorekeeper.is_active), 'Estado actualizado')} className="w-full sm:w-auto bg-slate-900 text-white rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  <Lock size={14} /> {selectedScorekeeper.is_active ? 'Bloquear' : 'Activar'}
                </button>
                <button onClick={async () => {
                  const password = await promptDialog({
                    title: 'Reiniciar contraseña',
                    description: `Asigna una nueva contraseña para ${selectedScorekeeper.name}.`,
                    placeholder: 'Nueva contraseña',
                    inputType: 'password',
                    minLength: 8,
                    confirmLabel: 'Reiniciar clave',
                  });
                  if (password) runAction(resetScorekeeperPassword(slug, selectedScorekeeper.id, password), 'Contraseña reiniciada');
                }} className="w-full sm:w-auto bg-white border border-slate-200 text-slate-700 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  <KeyRound size={14} /> Reiniciar clave
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
