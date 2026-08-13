'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, CalendarDays, ExternalLink, Lock, MonitorPlay, Play, ShieldCheck, Trophy, User, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSportKind } from '@/app/lib/sports/rules';
import { loginScorekeeper } from './actions';
import MesaFutbol from '../admin/mesa/components/MesaFutbol';
import MesaBaloncesto from '../admin/mesa/components/MesaBaloncesto';
import MesaVoleibol from '../admin/mesa/components/MesaVoleibol';
import MesaSoftbol from '../admin/mesa/components/MesaSoftbol';

const roleLabels: Record<string, string> = {
  JUDGE: 'Juez',
  SCOREKEEPER: 'Planillero',
  SUPERVISOR: 'Supervisor',
};

function statusLabel(status: string) {
  if (status === 'LIVE') return 'En vivo';
  if (status === 'FINISHED') return 'Finalizado';
  return 'Programado';
}

function statusClass(status: string) {
  if (status === 'LIVE') return 'bg-red-50 text-red-600';
  if (status === 'FINISHED') return 'bg-slate-100 text-slate-500';
  return 'bg-blue-50 text-blue-600';
}

function matchTitle(match: any) {
  return `${match.home_team?.name || 'Local'} vs ${match.away_team?.name || 'Visitante'}`;
}

function sportName(match: any) {
  return match.matchdays?.categories?.sports?.name || 'Sin deporte';
}

function matchDateTime(match: any) {
  return `${match.matchdays?.scheduled_date || 'Sin fecha'} / ${match.scheduled_time?.slice(0, 5) || '--:--'}`;
}

export default function PlanilleroPortalClient({ slug, initialData }: { slug: string; initialData: any | null }) {
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [selectedSport, setSelectedSport] = useState('');
  const [selectedScorekeeperId, setSelectedScorekeeperId] = useState('');
  const [activeMatch, setActiveMatch] = useState<any | null>(null);

  const scorekeepers = initialData?.scorekeepers || [];
  const selectedScorekeeper = scorekeepers.find((user: any) => user.id === selectedScorekeeperId);

  const sports = useMemo(() => {
    const groups = new Map<string, { name: string; users: any[]; matchCount: number; liveCount: number }>();
    scorekeepers.forEach((user: any) => {
      const sportsForUser = new Set<string>();
      (user.matches || []).forEach((match: any) => {
        const name = sportName(match);
        const group = groups.get(name) || { name, users: [], matchCount: 0, liveCount: 0 };
        group.matchCount += 1;
        if (match.status === 'LIVE') group.liveCount += 1;
        groups.set(name, group);
        sportsForUser.add(name);
      });
      sportsForUser.forEach((name) => {
        const group = groups.get(name);
        if (group && !group.users.some((item) => item.id === user.id)) group.users.push(user);
      });
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [scorekeepers]);

  const currentSport = sports.find((sport) => sport.name === selectedSport);
  const judgeMatches = (selectedScorekeeper?.matches || []).filter((match: any) => !selectedSport || sportName(match) === selectedSport);

  const renderMesa = () => {
    if (!activeMatch) return null;
    const categoryData = activeMatch.matchdays?.categories;
    const sportKind = getSportKind(categoryData?.sports?.name || '');
    const commonProps = {
      match: activeMatch,
      categoryData,
      onClose: () => setActiveMatch(null),
      onMatchUpdate: () => window.location.reload(),
      slug,
    };

    if (sportKind === 'basketball') return <MesaBaloncesto {...commonProps} />;
    if (sportKind === 'volleyball') return <MesaVoleibol {...commonProps} />;
    if (sportKind === 'baseball') return <MesaSoftbol {...commonProps} />;
    return <MesaFutbol {...commonProps} />;
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    const result = await loginScorekeeper(slug, loginForm.username, loginForm.password);
    setLoginLoading(false);
    if (!result.success) return toast.error(result.error);
    window.location.reload();
  };

  if (!initialData) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8 space-y-5">
          <div className="text-center">
            <ShieldCheck size={42} className="mx-auto mb-3 text-blue-500" />
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.25em]">Portal operativo</p>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Jueces y Planilleros</h1>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Ingresa con el usuario asignado</p>
          </div>
          <label className="relative block">
            <User size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              required
              value={loginForm.username}
              onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
              placeholder="Usuario"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500"
            />
          </label>
          <label className="relative block">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              required
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              placeholder="Contraseña"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500"
            />
          </label>
          <button disabled={loginLoading} className="w-full rounded-xl bg-blue-600 py-4 text-xs font-black uppercase tracking-widest hover:bg-blue-500 disabled:opacity-50">
            {loginLoading ? 'Validando acceso...' : 'Ingresar al portal'}
          </button>
        </form>
      </main>
    );
  }

  if (activeMatch) return renderMesa();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-950 text-white px-4 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.25em]">Portal operativo</p>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter break-words">Jueces y Planilleros</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Acceso por deporte y responsable asignado</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link href={`/${slug}/admin`} className="bg-white/10 hover:bg-white/15 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <ArrowLeft size={16} /> Volver
            </Link>
            <button onClick={() => window.open('/tv', '_blank')} className="bg-blue-600 hover:bg-blue-500 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <ExternalLink size={16} /> TV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {!initialData.schemaReady && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-black uppercase tracking-widest">
            Falta aplicar la migración del portal de planilleros.
          </div>
        )}

        {!selectedSport && (
          <section className="space-y-4">
            <div>
              <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.25em]">Paso 1</p>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">Selecciona deporte</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sports.map((sport) => (
                <button
                  key={sport.name}
                  onClick={() => { setSelectedSport(sport.name); setSelectedScorekeeperId(''); }}
                  className="group text-left bg-white border border-slate-200 rounded-[1.5rem] p-5 hover:border-blue-400 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Trophy size={24} />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight break-words">{sport.name}</h3>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xl font-black">{sport.users.length}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Responsables</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xl font-black">{sport.matchCount}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Partidos</p>
                    </div>
                  </div>
                  {sport.liveCount > 0 && (
                    <span className="mt-4 inline-flex rounded-full bg-red-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-red-600">
                      {sport.liveCount} en vivo
                    </span>
                  )}
                </button>
              ))}
              {sports.length === 0 && (
                <div className="sm:col-span-2 lg:col-span-3 bg-white border border-slate-200 rounded-[2rem] p-10 text-center">
                  <ShieldCheck className="mx-auto mb-3 text-slate-300" size={42} />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">No hay partidos asignados a jueces o planilleros</p>
                </div>
              )}
            </div>
          </section>
        )}

        {selectedSport && !selectedScorekeeper && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.25em]">Paso 2</p>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">{selectedSport}</h2>
              </div>
              <button onClick={() => setSelectedSport('')} className="w-fit bg-white border border-slate-200 text-slate-600 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <ArrowLeft size={16} /> Deportes
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(currentSport?.users || []).map((user: any) => {
                const matches = (user.matches || []).filter((match: any) => sportName(match) === selectedSport);
                const liveCount = matches.filter((match: any) => match.status === 'LIVE').length;
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedScorekeeperId(user.id)}
                    className="text-left bg-white border border-slate-200 rounded-[1.5rem] p-5 hover:border-blue-400 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                        <UserCheck size={22} />
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-blue-600">{roleLabels[user.role] || user.role}</span>
                    </div>
                    <h3 className="mt-5 text-xl font-black uppercase tracking-tight break-words">{user.name}</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{user.username}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xl font-black">{matches.length}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Partidos</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xl font-black">{liveCount}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">En vivo</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {selectedSport && selectedScorekeeper && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.25em]">Paso 3</p>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight break-words">{selectedScorekeeper.name}</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{selectedSport} · {roleLabels[selectedScorekeeper.role] || selectedScorekeeper.role}</p>
              </div>
              <button onClick={() => setSelectedScorekeeperId('')} className="w-fit bg-white border border-slate-200 text-slate-600 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <ArrowLeft size={16} /> Responsables
              </button>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <MonitorPlay className="text-blue-600 mb-2" size={20} />
                <p className="text-2xl font-black">{judgeMatches.length}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Partidos asignados</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Activity className="text-red-600 mb-2" size={20} />
                <p className="text-2xl font-black">{judgeMatches.filter((match: any) => match.status === 'LIVE').length}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">En vivo</p>
              </div>
              <button onClick={() => window.open('/tv', '_blank')} className="bg-slate-900 text-white border border-slate-900 rounded-2xl p-4 text-left hover:bg-blue-600 hover:border-blue-600 transition-colors">
                <ExternalLink className="mb-2" size={20} />
                <p className="text-lg font-black uppercase">Abrir TV</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Pantalla externa</p>
              </button>
            </section>

            <section className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="font-black uppercase text-xl">Partidos asignados</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {judgeMatches.map((match: any) => (
                  <div key={match.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="font-black uppercase text-lg break-words">{matchTitle(match)}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <CalendarDays size={12} className="inline mr-1" />
                        {matchDateTime(match)} · {match.matchdays?.categories?.name}
                      </p>
                      <span className={`inline-flex mt-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusClass(match.status)}`}>
                        {statusLabel(match.status)}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button onClick={() => setActiveMatch(match)} className="bg-blue-600 text-white rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        <Play size={14} /> Abrir mesa
                      </button>
                      <button onClick={() => window.open(`/tv/${match.id}`, '_blank')} className="bg-white border border-slate-200 text-slate-700 rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        <ExternalLink size={14} /> TV
                      </button>
                    </div>
                  </div>
                ))}
                {judgeMatches.length === 0 && (
                  <p className="p-10 text-center text-slate-400 text-xs font-black uppercase tracking-widest">Este responsable no tiene partidos asignados</p>
                )}
              </div>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
