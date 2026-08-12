'use client';

import { useEffect, useState } from 'react';
import { Activity, CalendarDays, Eye, FileCheck2, KeyRound, Lock, LogOut, Plus, ShieldCheck, Square, Trash2, Trophy, Upload, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { addDelegatePlayers, changeDelegatePassword, deleteDelegatePlayer, getPlayerIdentityDocumentUrl, loginDelegate, logoutDelegate, uploadDelegateSchoolLogo, uploadPlayerIdentityDocument } from './actions';

type DelegatePortalClientProps = {
  slug: string;
  initialData: any | null;
};

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

function fallbackColor(team: any) {
  const logoUrl = String(team?.schools?.logo_url || '');
  const background = logoUrl.match(/[?&]background=([^&]+)/)?.[1];
  if (background && /^[a-fA-F0-9]{6}$/.test(background)) return `#${background}`;

  const palette = ['#1d4ed8', '#dc2626', '#334155', '#7c3aed', '#be123c', '#0891b2', '#059669', '#ea580c'];
  const source = String(team?.name || team?.schools?.name || '');
  const index = source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
  return palette[index];
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
      className={`${className} rounded-xl border border-slate-100 flex items-center justify-center p-1.5 shrink-0 overflow-hidden relative shadow-sm`}
      style={{ backgroundColor: fallbackColor(team) }}
    >
      <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-black">
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
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [data, setData] = useState<any | null>(initialData);
  const [selectedTeamId, setSelectedTeamId] = useState(initialData?.teams?.[0]?.id || '');
  const [newPlayer, setNewPlayer] = useState({ name: '', shirtNumber: '', birthYear: '', vinculo: '' });
  const [logoUrl, setLogoUrl] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [activeRound, setActiveRound] = useState('');
  const [selectedHistoryMatch, setSelectedHistoryMatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedTeam = data?.teams?.find((team: any) => team.id === selectedTeamId) || data?.teams?.[0];
  const selectedCategory = selectedTeam?.categories;
  const canEditRoster = selectedTeam && isRegistrationOpen(selectedCategory);
  const players = data?.playersByTeam?.[selectedTeam?.id] || [];
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
    setActiveRound('');
  }, [selectedTeam?.id]);

  const eventSummary = events.reduce((acc: any, event: any) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + 1;
    return acc;
  }, {});
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
      shirtNumber: newPlayer.shirtNumber ? Number(newPlayer.shirtNumber) : null,
      birthYear: newPlayer.birthYear ? Number(newPlayer.birthYear) : null,
      vinculo: newPlayer.vinculo,
    }]);
    if (!result.success) toast.error(result.error);
    else {
      toast.success('Jugador inscrito');
      setNewPlayer({ name: '', shirtNumber: '', birthYear: '', vinculo: '' });
      window.location.reload();
    }
    setLoading(false);
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-950 text-white px-4 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.25em]">Portal Delegado</p>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter">{data.delegate.name}</h1>
          </div>
          <button onClick={handleLogout} className="w-fit flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest">
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
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
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Users className="text-blue-600 mb-2" size={20} />
                <p className="text-2xl font-black">{players.length}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inscritos</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Trophy className="text-emerald-600 mb-2" size={20} />
                <p className="text-2xl font-black">{eventSummary.GOAL || eventSummary.BASKET_1 || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Goles/Puntos</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Square className="text-yellow-400 fill-yellow-400 mb-2" size={20} />
                <p className="text-2xl font-black">{eventSummary.YELLOW || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Amarillas</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Square className="text-red-600 fill-red-600 mb-2" size={20} />
                <p className="text-2xl font-black">{eventSummary.RED || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rojas</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Activity className="text-slate-700 mb-2" size={20} />
                <p className="text-2xl font-black">${debt.toLocaleString('es-CO')}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Multas</p>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)] gap-6">
              <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-black uppercase text-xl">Nómina</h2>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {canEditRoster ? 'Inscripción abierta' : 'Inscripción cerrada'}
                    </p>
                  </div>
                  {!canEditRoster && <Lock className="text-red-500" />}
                </div>
                {canEditRoster && (
                  <form onSubmit={handleAddPlayer} className="grid grid-cols-1 md:grid-cols-5 gap-2 p-4 bg-slate-50 border-b border-slate-100">
                    <input value={newPlayer.name} onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })} placeholder="Nombre" className="md:col-span-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                    <input value={newPlayer.shirtNumber} onChange={(e) => setNewPlayer({ ...newPlayer, shirtNumber: e.target.value })} placeholder="Dorsal" className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                    <input value={newPlayer.birthYear} onChange={(e) => setNewPlayer({ ...newPlayer, birthYear: e.target.value })} placeholder="Año" className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                    <button disabled={loading} className="bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1"><Plus size={14} /> Agregar</button>
                  </form>
                )}
                <div className="divide-y divide-slate-50">
                  {players.map((player: any) => (
                    <div key={player.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black uppercase text-sm">{player.name}</p>
                        <p className="text-[10px] font-bold text-slate-400">#{player.shirt_number || '-'} / {player.birth_year || 'Sin año'}</p>
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
