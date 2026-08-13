'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase'; 
import { ShieldAlert, Plus, Building, Power, PowerOff, Save, X, Search, Globe, Trash2, UploadCloud, AlertTriangle, User, Lock, LogOut, RefreshCcw, KeyRound,  } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createMasterClient,
  deleteMasterClient,
  listMasterClients,
  logoutMaster,
  resetClientAccessCode,
  toggleMasterClientStatus,
  type MasterClientRecord,
} from './actions';

export default function MasterBunkerPage() {
  const [clients, setClients] = useState<MasterClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados del formulario y subida de archivos
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', slug: '', username: '', access_code: '' });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado para confirmación de borrado
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });
  const [passwordReset, setPasswordReset] = useState<{ isOpen: boolean; id: string | null; name: string; username: string; accessCode: string }>({
    isOpen: false,
    id: null,
    name: '',
    username: '',
    accessCode: '',
  });
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const result = await listMasterClients();

    if (result.success) {
      setClients(result.data);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Carga inicial del listado remoto de clientes del bunker master.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchClients();
  }, [fetchClients]);

  // Generador automático de Slugs y Usuario
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value.toUpperCase();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const username = `admin_${slug.replace(/-/g, '')}`;
    setNewClient({ ...newClient, name, slug, username });
  };

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    const toastId = toast.loading('Procesando alta de sistema...');

    let finalLogoUrl = '/logo.png'; // Logo por defecto

    // 1. Subir la imagen si el usuario seleccionó una
    if (logoFile) {
      toast.loading('Subiendo imagen al servidor...', { id: toastId });
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${newClient.slug}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile);

      if (uploadError) {
        toast.error('Error al subir la imagen. Verifica que el bucket "logos" exista y sea público.', { id: toastId });
        setIsSubmitting(false);
        return;
      }

      // Obtener la URL pública de la imagen
      const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
      finalLogoUrl = publicUrlData.publicUrl;
    }

    // 2. Guardar el cliente en la base de datos desde Server Action protegida
    toast.loading('Creando matriz de datos...', { id: toastId });
    const result = await createMasterClient({
      name: newClient.name,
      slug: newClient.slug,
      username: newClient.username,
      accessCode: newClient.access_code,
      logoUrl: finalLogoUrl,
    });

    if (!result.success) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success('¡Nuevo Cliente Operativo!', { id: toastId });
      setNewClient({ name: '', slug: '', username: '', access_code: '' });
      setLogoFile(null);
      setShowNewClientForm(false);
      fetchClients();
    }
    setIsSubmitting(false);
  }

  async function toggleClientStatus(clientId: string, currentStatus: boolean, clientName: string) {
    const toastId = toast.loading(`Actualizando estado de ${clientName}...`);
    const newStatus = !currentStatus;
    const result = await toggleMasterClientStatus(clientId, currentStatus);

    if (!result.success) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success(newStatus ? 'Sistema Reactivado' : 'Sistema Suspendido', { id: toastId });
      fetchClients(); 
    }
  }

  async function executeDeleteClient() {
    if (!showDeleteConfirm.id) return;
    const toastId = toast.loading('Eliminando sistema base...');

    const result = await deleteMasterClient(showDeleteConfirm.id);
    
    if (!result.success) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success('Cliente eliminado de la matriz', { id: toastId });
      setShowDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchClients();
    }
  }

  function generateAccessCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%';
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  }

  function openPasswordReset(client: MasterClientRecord) {
    setPasswordReset({
      isOpen: true,
      id: client.id,
      name: client.name,
      username: client.username || '',
      accessCode: generateAccessCode(),
    });
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordReset.id) return;

    setIsResettingPassword(true);
    const toastId = toast.loading(`Reiniciando contraseña de ${passwordReset.name}...`);
    const result = await resetClientAccessCode(passwordReset.id, passwordReset.accessCode);

    if (!result.success) {
      toast.error(result.error || 'No se pudo reiniciar la contraseña', { id: toastId });
      setIsResettingPassword(false);
      return;
    }

    toast.success('Contraseña reiniciada', { id: toastId });
    setPasswordReset({ isOpen: false, id: null, name: '', username: '', accessCode: '' });
    setIsResettingPassword(false);
    fetchClients();
  }

  // --- NUEVA FUNCIÓN PARA CERRAR SESIÓN ---
  const handleLogout = async () => {
    const toastId = toast.loading('Cerrando sesión maestra...');
    await logoutMaster();
    toast.success('Sesión finalizada con éxito', { id: toastId });
    
    // 👇 EL CAMBIO ESTÁ AQUÍ: Te enviamos de vuelta a la puerta principal
    window.location.href = '/'; 
  };

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 selection:bg-blue-500/30">
      
      {/* MODAL DE CONFIRMACIÓN DE BORRADO */}
      {showDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Cliente?</h3>
            <p className="text-slate-500 text-sm font-bold mb-2 break-words">&quot;{showDeleteConfirm.name}&quot;</p>
            <p className="text-slate-400 text-xs font-medium mb-8 leading-relaxed">
              Peligro: Esto destruirá todos los torneos, estadísticas, jugadores y partidos asociados a este colegio. Es irreversible.
            </p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowDeleteConfirm({ isOpen: false, id: null, name: '' })} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm">
                Cancelar
              </button>
              <button onClick={executeDeleteClient} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200">
                Destruir Datos
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordReset.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100 shadow-inner shrink-0">
                <KeyRound size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Reiniciar Contraseña</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1 break-words">{passwordReset.name}</p>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Usuario: {passwordReset.username || 'No asignado'}</p>
              </div>
            </div>

            <form onSubmit={handlePasswordReset} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Nueva Contraseña</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={16}/></div>
                    <input
                      type="text"
                      required
                      minLength={8}
                      className="w-full bg-slate-50 border border-slate-200 p-4 pl-12 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors font-mono"
                      value={passwordReset.accessCode}
                      onChange={(e) => setPasswordReset({ ...passwordReset, accessCode: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasswordReset({ ...passwordReset, accessCode: generateAccessCode() })}
                    className="px-4 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors border border-slate-200"
                    title="Generar contraseña"
                  >
                    <RefreshCcw size={18} />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Copia esta contraseña antes de cerrar el modal. Luego quedará oculta en el listado.</p>
              </div>

              <div className="flex gap-4 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasswordReset({ isOpen: false, id: null, name: '', username: '', accessCode: '' })}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-60"
                >
                  {isResettingPassword ? 'Guardando...' : 'Guardar Nueva Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto relative">
        
        {/* CABECERA MASTER CLARA */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8 mb-8">
          <div>
            <div className="flex items-center gap-3 text-blue-600 mb-2">
              <ShieldAlert size={28} />
              <span className="font-black tracking-[0.3em] uppercase text-xs">Nivel 5 de Acceso</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">
              SportScore <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600">Master</span>
            </h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2">
              Centro de Control Multi-Tenant
            </p>
          </div>

          {/* GRUPO DE BOTONES DE ACCIÓN */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button 
              onClick={handleLogout}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300"
            >
              <LogOut size={16}/> Salir
            </button>
            
            <button 
              onClick={() => setShowNewClientForm(!showNewClientForm)}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg ${showNewClientForm ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30'}`}
            >
              {showNewClientForm ? <><X size={16}/> Cancelar Registro</> : <><Plus size={16}/> Nuevo Inquilino</>}
            </button>
          </div>
        </div>

        {/* FORMULARIO DE NUEVO CLIENTE */}
        {showNewClientForm && (
          <div className="bg-white border border-slate-200 p-8 rounded-[2rem] mb-8 shadow-xl animate-in fade-in slide-in-from-top-4">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2 pb-4 border-b border-slate-100">
              <Building size={20} className="text-blue-500"/> Alta de Nuevo Sistema
            </h2>
            <form onSubmit={handleCreateClient} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Nombre del Colegio/Club</label>
                <input type="text" required placeholder="Ej: Elite Gymnastics" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" value={newClient.name} onChange={handleNameChange} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Slug (Ruta Web)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Globe size={16}/></div>
                  <input type="text" required placeholder="elite-gymnastics" className="w-full bg-slate-50 border border-slate-200 p-4 pl-12 rounded-xl text-sm font-bold text-slate-500 outline-none focus:border-blue-500 focus:bg-white transition-colors" value={newClient.slug} onChange={(e) => setNewClient({...newClient, slug: e.target.value.toLowerCase()})} />
                </div>
              </div>

              {/* CARGA DE ARCHIVO DESDE PC */}
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Escudo Institucional (PC)</label>
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => setLogoFile(e.target.files ? e.target.files[0] : null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  />
                  <div className={`w-full border-2 border-dashed p-4 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${logoFile ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-400'}`}>
                    <UploadCloud size={18} />
                    <span className="truncate">{logoFile ? logoFile.name : 'Subir logo...'}</span>
                  </div>
                </div>
              </div>

              {/* CREDENCIALES DE ACCESO */}
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Usuario Administrador</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><User size={16}/></div>
                  <input type="text" required placeholder="admin_elite" className="w-full bg-slate-50 border border-slate-200 p-4 pl-12 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" value={newClient.username} onChange={(e) => setNewClient({...newClient, username: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Contraseña Maestra</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={16}/></div>
                  <input type="text" required placeholder="Código Secreto" className="w-full bg-slate-50 border border-slate-200 p-4 pl-12 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" value={newClient.access_code} onChange={(e) => setNewClient({...newClient, access_code: e.target.value})} />
                </div>
              </div>

              <div className="lg:col-span-4 flex justify-end mt-4 pt-6 border-t border-slate-100">
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-emerald-600/30">
                  {isSubmitting ? 'Configurando...' : <><Save size={16}/> Desplegar Sistema Completo</>}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* LISTADO DE CLIENTES (LIGHT THEME) */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl">
          
          <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
            <div className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-3 rounded-xl w-full max-w-sm shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <Search size={16} className="text-slate-400" />
              <input type="text" placeholder="Buscar inquilino..." className="bg-transparent text-sm font-bold text-slate-900 outline-none w-full placeholder:text-slate-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-4">
              {filteredClients.length} Sistemas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-100 text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] border-b border-slate-200">
                  <th className="p-6 pl-8">Estado</th>
                  <th className="p-6">Cliente</th>
                  <th className="p-6">Credenciales</th>
                  <th className="p-6">Alta</th>
                  <th className="p-6 text-right pr-8">Control Maestro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">Escaneando Servidores...</td></tr>
                ) : filteredClients.map(client => (
                  <tr key={client.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-6 pl-8">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shadow-sm ${client.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${client.is_active ? 'text-emerald-600' : 'text-red-600'}`}>
                          {client.is_active ? 'Online' : 'Suspendido'}
                        </span>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 p-1 flex items-center justify-center overflow-hidden shadow-sm">
                           <img src={client.logo_url || '/logo.png'} alt="logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 uppercase tracking-tight">{client.name}</span>
                          <span className="font-mono text-[10px] text-blue-500">/{client.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><User size={12}/> {client.username || 'No asignado'}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Lock size={12}/> {client.has_access_code ? '••••••••' : 'Sin clave'}</span>
                      </div>
                    </td>
                    <td className="p-6 text-slate-500 text-xs font-bold">{new Date(client.created_at).toLocaleDateString()}</td>
                    <td className="p-6 pr-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => toggleClientStatus(client.id, client.is_active, client.name)}
                          className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            client.is_active 
                              ? 'bg-white border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300' 
                              : 'bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'
                          }`}
                        >
                          {client.is_active ? <><PowerOff size={14}/> Suspender</> : <><Power size={14}/> Activar</>}
                        </button>
                        <button 
                          onClick={() => openPasswordReset(client)}
                          className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border bg-white border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                          title="Reiniciar contraseña"
                        >
                          <KeyRound size={14}/> Clave
                        </button>
                        <button 
                          onClick={() => setShowDeleteConfirm({ isOpen: true, id: client.id, name: client.name })}
                          className="p-3 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-100"
                          title="Eliminar Cliente"
                        >
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
