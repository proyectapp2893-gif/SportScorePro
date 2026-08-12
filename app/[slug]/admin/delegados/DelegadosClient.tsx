'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Copy, KeyRound, Link2, Lock, Plus, RefreshCcw, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import AppSelect from '@/app/components/AppSelect';
import { confirmDialog, promptDialog } from '@/app/components/AppDialog';
import { assignDelegateTeam, createDelegateUser, deleteDelegateUsers, removeDelegateTeam, resetDelegatePassword, syncDelegatesFromTournament, toggleDelegateStatus, updateCategoryRegistrationSettings } from './actions';

export default function DelegadosClient({ slug, initialData }: { slug: string; initialData: any }) {
  const searchParams = useSearchParams();
  const initialTournamentId = searchParams.get('tournament') || initialData.tournaments?.[0]?.id || '';
  const [delegates, setDelegates] = useState<any[]>(initialData.delegates || []);
  const [delegateForm, setDelegateForm] = useState({ name: '', username: '', password: '', email: '', schoolId: '' });
  const [selectedDelegateId, setSelectedDelegateId] = useState(initialData.delegates?.[0]?.id || '');
  const [selectedDelegateIds, setSelectedDelegateIds] = useState<string[]>([]);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState(initialTournamentId);
  const [syncResult, setSyncResult] = useState<any | null>(null);
  const [resetExistingPasswords, setResetExistingPasswords] = useState(false);
  const [categorySettings, setCategorySettings] = useState<Record<string, any>>(
    Object.fromEntries(initialData.categories.map((category: any) => [category.id, {
      registrationOpen: category.registration_open ?? true,
      registrationDeadline: category.registration_deadline || '',
      minRosterSize: category.min_roster_size || '',
      maxRosterSize: category.max_roster_size || '',
      lockedMessage: category.roster_locked_message || '',
    }]))
  );
  const [loading, setLoading] = useState(false);

  const selectedDelegate = delegates.find((delegate: any) => delegate.id === selectedDelegateId);
  const delegatePasswordLabel = (delegate: any) => {
    if (delegate.must_change_password) return delegate.assigned_password || 'Pendiente de asignar';
    if (delegate.password_changed_at) return 'Cambiada por delegado';
    if (delegate.assigned_password) return 'Cambiada por delegado';
    return delegate.assigned_password || 'No registrada';
  };
  const filteredTeams = selectedTournamentId
    ? initialData.teams.filter((team: any) => team.categories?.tournament_id === selectedTournamentId)
    : initialData.teams;
  const filteredCategories = selectedTournamentId
    ? initialData.categories.filter((category: any) => category.tournaments?.id === selectedTournamentId)
    : initialData.categories;

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

  const handleCreateDelegate = (event: React.FormEvent) => {
    event.preventDefault();
    runAction(createDelegateUser(slug, {
      name: delegateForm.name,
      username: delegateForm.username,
      password: delegateForm.password,
      email: delegateForm.email,
      schoolId: delegateForm.schoolId || undefined,
    }), 'Delegado creado');
  };

  const allDelegatesSelected = delegates.length > 0 && selectedDelegateIds.length === delegates.length;

  const toggleAllDelegates = () => {
    setSelectedDelegateIds(allDelegatesSelected ? [] : delegates.map((delegate: any) => delegate.id));
  };

  const toggleDelegateSelection = (delegateId: string) => {
    setSelectedDelegateIds((current) => current.includes(delegateId)
      ? current.filter((id) => id !== delegateId)
      : [...current, delegateId]);
  };

  const handleDeleteSelectedDelegates = async () => {
    if (selectedDelegateIds.length === 0) return;
    if (!await confirmDialog({
      title: 'Eliminar delegaciones',
      description: `Se eliminarán definitivamente ${selectedDelegateIds.length} delegaciones seleccionadas y todos sus accesos.`,
      confirmLabel: 'Eliminar',
    })) return;
    runAction(deleteDelegateUsers(slug, selectedDelegateIds), `${selectedDelegateIds.length} delegaciones eliminadas`);
  };

  const closeDeleteMode = () => {
    setDeleteMode(false);
    setSelectedDelegateIds([]);
  };

  const handleSaveCategory = (categoryId: string) => {
    const settings = categorySettings[categoryId];
    runAction(updateCategoryRegistrationSettings(slug, categoryId, {
      registrationOpen: Boolean(settings.registrationOpen),
      registrationDeadline: settings.registrationDeadline || null,
      minRosterSize: settings.minRosterSize ? Number(settings.minRosterSize) : null,
      maxRosterSize: settings.maxRosterSize ? Number(settings.maxRosterSize) : null,
      lockedMessage: settings.lockedMessage || null,
    }), 'Configuración actualizada');
  };

  const handleSyncTournament = async () => {
    if (!selectedTournamentId) return toast.error('Selecciona un torneo.');
    setLoading(true);
    const result = await syncDelegatesFromTournament(slug, selectedTournamentId, { resetExistingPasswords });
    if (!result.success) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    setSyncResult(result.data);
    setDelegates(result.data.delegates || []);
    if (!selectedDelegateId && result.data.delegates?.[0]?.id) {
      setSelectedDelegateId(result.data.delegates[0].id);
    }
    toast.success('Delegaciones sincronizadas');
    setLoading(false);
  };

  const copyCredentials = () => {
    if (!syncResult?.credentials?.length) return;
    const text = syncResult.credentials
      .map((credential: any) => [
        credential.schoolName,
        `Usuario: ${credential.username}`,
        credential.password ? `Contraseña: ${credential.password}` : 'Contraseña: ya existente / no modificada',
        `Equipos asignados: ${credential.assignedTeams}`,
      ].join('\n'))
      .join('\n\n');

    navigator.clipboard.writeText(text);
    toast.success('Credenciales copiadas');
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-6 sm:py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/${slug}/admin`} className="w-fit mb-4 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <ArrowLeft size={16} /> Volver al hub
            </Link>
            <p className="text-blue-600 font-black text-[10px] uppercase tracking-[0.25em]">Control de acceso</p>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Delegados</h1>
          </div>
          <a href={`/${slug}/delegado`} target="_blank" className="w-full sm:w-fit text-center bg-slate-900 text-white rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest">
            Abrir portal
          </a>
        </div>

        {!initialData.schemaReady && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-black uppercase tracking-widest">
            La migración de inscripción de delegados está pendiente. Puedes revisar usuarios y accesos, pero el cierre de inscripciones se habilita al aplicar la migración.
          </div>
        )}

        <section className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 space-y-4 overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-blue-600 font-black text-[10px] uppercase tracking-[0.25em]">Sincronización</p>
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight break-words">Delegaciones por torneo</h2>
              <p className="text-slate-400 text-xs font-bold mt-1">Usa las delegaciones y equipos ya inscritos para crear accesos automáticamente.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <AppSelect
                value={selectedTournamentId}
                onChange={(value) => { setSelectedTournamentId(value); setSelectedTeamId(''); setSyncResult(null); }}
                className="w-full sm:min-w-[260px]"
                placeholder="Todos los torneos"
                options={[
                  { value: '', label: 'Todos los torneos' },
                  ...initialData.tournaments.map((tournament: any) => ({ value: tournament.id, label: tournament.name })),
                ]}
              />
              <button disabled={!selectedTournamentId || loading} onClick={handleSyncTournament} className="bg-blue-600 text-white rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                <Link2 size={16} /> Sincronizar
              </button>
            </div>
          </div>

          <label className="w-full sm:w-fit flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest leading-tight">
            <input
              type="checkbox"
              checked={resetExistingPasswords}
              onChange={(event) => setResetExistingPasswords(event.target.checked)}
            />
            Regenerar claves existentes para mostrar credenciales
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-2xl font-black">{filteredTeams.length}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Equipos del filtro</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-2xl font-black">{new Set(filteredTeams.map((team: any) => team.school_id).filter(Boolean)).size}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Delegaciones</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-2xl font-black">{filteredCategories.length}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Categorías</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-2xl font-black">{delegates.length}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Usuarios delegado</p>
            </div>
          </div>

          {syncResult && (
            <div className="border border-emerald-100 bg-emerald-50 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <p className="font-black uppercase text-emerald-700">Sincronización completada</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    {syncResult.createdDelegates} creados / {syncResult.reusedDelegates} existentes / {syncResult.resetPasswords || 0} claves regeneradas / {syncResult.assignedTeams} equipos asignados
                  </p>
                </div>
                <button onClick={copyCredentials} className="w-full sm:w-fit bg-white border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  <Copy size={14} /> Copiar credenciales
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {syncResult.credentials.map((credential: any) => (
                  <div key={credential.schoolId} className="bg-white border border-emerald-100 rounded-xl p-3">
                    <p className="font-black uppercase text-xs">{credential.schoolName}</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">Usuario: <span className="font-black text-slate-900">{credential.username}</span></p>
                    <p className="text-[10px] font-bold text-slate-500">Clave: <span className="font-black text-slate-900">{credential.password || 'Existente. Marca regenerar claves para verla.'}</span></p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mt-2">{credential.assignedTeams} equipos asignados</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleCreateDelegate} className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-blue-600" />
              <h2 className="font-black uppercase text-xl">Crear Delegado</h2>
            </div>
            <input value={delegateForm.name} onChange={(e) => setDelegateForm({ ...delegateForm, name: e.target.value })} placeholder="Nombre" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none" />
            <input value={delegateForm.username} onChange={(e) => setDelegateForm({ ...delegateForm, username: e.target.value })} placeholder="Usuario" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none" />
            <input value={delegateForm.email} onChange={(e) => setDelegateForm({ ...delegateForm, email: e.target.value })} placeholder="Email opcional" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none" />
            <input type="password" value={delegateForm.password} onChange={(e) => setDelegateForm({ ...delegateForm, password: e.target.value })} placeholder="Contraseña inicial" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none" />
            <AppSelect
              value={delegateForm.schoolId}
              onChange={(value) => setDelegateForm({ ...delegateForm, schoolId: value })}
              placeholder="Sin institución fija"
              options={[
                { value: '', label: 'Sin institución fija' },
                ...initialData.schools.map((school: any) => ({ value: school.id, label: school.name })),
              ]}
            />
            <button disabled={loading} className="w-full bg-blue-600 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><Plus size={16} /> Crear</button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-black uppercase text-xl">Usuarios creados</h2>
                {deleteMode && (
                  <label className="mt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={allDelegatesSelected} onChange={toggleAllDelegates} />
                    Seleccionar todas ({delegates.length})
                  </label>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {!deleteMode ? (
                  <button type="button" disabled={loading || delegates.length === 0} onClick={() => setDeleteMode(true)} className="border border-red-200 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                    <Trash2 size={16} /> Eliminar
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={loading} onClick={closeDeleteMode} className="border border-slate-200 bg-white text-slate-600 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-50">
                      Cancelar
                    </button>
                    <button type="button" disabled={loading || selectedDelegateIds.length === 0} onClick={handleDeleteSelectedDelegates} className="bg-red-600 text-white rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                      <Trash2 size={16} /> Eliminar seleccionadas ({selectedDelegateIds.length})
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {delegates.map((delegate: any) => (
                <div key={delegate.id} className={`w-full p-4 flex items-center gap-2 ${selectedDelegateId === delegate.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  {deleteMode && (
                    <input
                      type="checkbox"
                      checked={selectedDelegateIds.includes(delegate.id)}
                      onChange={() => toggleDelegateSelection(delegate.id)}
                      aria-label={`Seleccionar delegación ${delegate.name}`}
                      className="shrink-0"
                    />
                  )}
                  <button onClick={() => setSelectedDelegateId(delegate.id)} className="min-w-0 flex-1 text-left flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="min-w-0">
                    <p className="font-black uppercase break-words">{delegate.name}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usuario: {delegate.username}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clave: {delegatePasswordLabel(delegate)}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">{delegate.schools?.name || 'Global'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${delegate.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{delegate.is_active ? 'Activo' : 'Bloqueado'}</span>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${delegate.must_change_password ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{delegate.must_change_password ? 'Debe cambiar clave' : 'Clave cambiada'}</span>
                      <span className="text-[10px] font-black text-slate-400">{delegate.delegate_team_access?.length || 0} equipos</span>
                    </div>
                  </button>
                </div>
              ))}
              {delegates.length === 0 && <p className="p-8 text-center text-slate-400 text-xs font-black uppercase tracking-widest">No hay delegados creados</p>}
            </div>
          </div>
        </section>

        {selectedDelegate && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 space-y-4 overflow-hidden">
              <h2 className="font-black uppercase text-lg sm:text-xl flex items-center gap-2 break-words"><UserCheck className="text-blue-600 shrink-0" /> Accesos de {selectedDelegate.name}</h2>
              <div className="flex flex-col sm:flex-row gap-2">
                <AppSelect
                  value={selectedTeamId}
                  onChange={setSelectedTeamId}
                  className="w-full sm:flex-1"
                  placeholder="Selecciona equipo"
                  options={[
                    { value: '', label: 'Selecciona equipo' },
                    ...filteredTeams.map((team: any) => ({
                      value: team.id,
                      label: team.name,
                      description: `${team.categories?.tournaments?.name || 'Torneo'} / ${team.categories?.name || 'Categoría'}`,
                    })),
                  ]}
                />
                <button disabled={!selectedTeamId || loading} onClick={() => runAction(assignDelegateTeam(slug, selectedDelegate.id, selectedTeamId), 'Equipo asignado')} className="w-full sm:w-auto bg-blue-600 text-white rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-50">Asignar</button>
              </div>
              <div className="space-y-2">
                {(selectedDelegate.delegate_team_access || []).map((access: any) => (
                  <div key={access.team_id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <span className="font-black uppercase text-xs break-words min-w-0">{access.teams?.name}</span>
                    <button onClick={() => runAction(removeDelegateTeam(slug, selectedDelegate.id, access.team_id), 'Equipo removido')} className="text-red-500 p-2 hover:bg-red-50 rounded-lg shrink-0"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                <button onClick={() => runAction(toggleDelegateStatus(slug, selectedDelegate.id, !selectedDelegate.is_active), 'Estado actualizado')} className="w-full sm:w-auto bg-slate-900 text-white rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><Lock size={14} /> {selectedDelegate.is_active ? 'Bloquear' : 'Activar'}</button>
                <button onClick={async () => {
                  const password = await promptDialog({
                    title: 'Reiniciar contraseña',
                    description: `Asigna una nueva contraseña para ${selectedDelegate.name}.`,
                    placeholder: 'Nueva contraseña',
                    inputType: 'password',
                    minLength: 8,
                    confirmLabel: 'Reiniciar clave',
                  });
                  if (password) runAction(resetDelegatePassword(slug, selectedDelegate.id, password), 'Contraseña reiniciada');
                }} className="w-full sm:w-auto bg-white border border-slate-200 text-slate-700 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><KeyRound size={14} /> Reiniciar clave</button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 space-y-4 overflow-hidden">
              <h2 className="font-black uppercase text-lg sm:text-xl flex items-center gap-2"><ShieldCheck className="text-blue-600 shrink-0" /> Bloqueo de inscripción</h2>
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {filteredCategories.map((category: any) => {
                  const settings = categorySettings[category.id];
                  return (
                    <div key={category.id} className="border border-slate-100 rounded-2xl p-4 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black uppercase text-sm break-words">{category.name}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{category.tournaments?.name} / {category.sports?.name}</p>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">
                          <input type="checkbox" checked={Boolean(settings.registrationOpen)} onChange={(e) => setCategorySettings({ ...categorySettings, [category.id]: { ...settings, registrationOpen: e.target.checked } })} />
                          Abierta
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input type="datetime-local" value={settings.registrationDeadline} onChange={(e) => setCategorySettings({ ...categorySettings, [category.id]: { ...settings, registrationDeadline: e.target.value } })} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none sm:col-span-2 min-w-0" />
                        <input value={settings.minRosterSize} onChange={(e) => setCategorySettings({ ...categorySettings, [category.id]: { ...settings, minRosterSize: e.target.value } })} placeholder="Mín." className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                        <input value={settings.maxRosterSize} onChange={(e) => setCategorySettings({ ...categorySettings, [category.id]: { ...settings, maxRosterSize: e.target.value } })} placeholder="Máx." className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                      </div>
                      <input value={settings.lockedMessage} onChange={(e) => setCategorySettings({ ...categorySettings, [category.id]: { ...settings, lockedMessage: e.target.value } })} placeholder="Mensaje de cierre" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" />
                      <button disabled={!initialData.schemaReady} onClick={() => handleSaveCategory(category.id)} className="w-full bg-slate-900 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"><RefreshCcw size={14} /> Guardar configuración</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
