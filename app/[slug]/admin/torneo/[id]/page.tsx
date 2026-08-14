'use client';

import { useEffect, useState } from 'react';
// IMPORTANTE: Aseguramos tener useParams para leer el tenant actual
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../supabase';
import { Plus, Activity, Trash2, Users, Trophy, Settings2, School, ChevronLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import AppSelect from '@/app/components/AppSelect';
import { createTournamentCategory, deleteTournamentCategory } from './actions';

export default function TorneoDashboard() {
  const params = useParams();
  const id = params?.id as string;
  // EXTRAEMOS EL SLUG (Ej: 'csjb') PARA LAS RUTAS MULTICUENTA
  const slug = params?.slug as string; 
  const router = useRouter();
  
  const [torneo, setTorneo] = useState<any>(null);
  const [sports, setSports] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [newCat, setNewCat] = useState({ sport_id: '', name: '', gender: 'MASCULINO', match_duration: '' });
  
  // ESTADOS PARA MODALES NATIVOS
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; catId: string | null }>({ isOpen: false, catId: null });

  useEffect(() => {
    if (id && slug) {
      fetchTorneoData();
    }
  }, [id, slug]);

  async function fetchTorneoData() {
    // 1. LÓGICA MULTICUENTA: Obtenemos el ID real del cliente basándonos en la URL
    const { data: clientData } = await supabase
      .from('clients')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!clientData) {
      toast.error('Cliente no encontrado');
      return router.push('/');
    }

    // 2. FILTRO BLINDADO: Traemos el torneo SOLO si el client_id coincide con el dueño
    const { data: tData } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .eq('client_id', clientData.id) // <-- Seguridad en cascada
      .single();

    if (!tData) {
      toast.error('No tienes permisos para ver este torneo');
      return router.push(`/${slug}/admin`);
    }

    setTorneo(tData);

    // Cargamos deportes base
    const { data: sData } = await supabase.from('sports').select('*');
    if (sData) setSports(sData);

    fetchCategories();
  }

  async function fetchCategories() {
    const { data } = await supabase
      .from('categories')
      .select('*, sports(name, scoring_system)')
      .eq('tournament_id', id)
      .order('created_at', { ascending: false });
      
    if (data) setCategories(data);
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.sport_id) return toast.error('Selecciona un deporte oficial');
    setLoading(true);

    const result = await createTournamentCategory(slug, id, {
      sportId: newCat.sport_id,
      name: newCat.name,
      gender: newCat.gender,
      matchDuration: newCat.match_duration,
    });

    if (result.success) {
      toast.success('¡Deporte/Categoría Activada!');
      setNewCat({ sport_id: '', name: '', gender: 'MASCULINO', match_duration: '' });
      fetchCategories();
    } else {
      toast.error(result.error || 'Ocurrió un error al crear la categoría.');
    }
    setLoading(false);
  }

  const confirmDeleteCategory = async () => {
    if (!showDeleteConfirm.catId) return;
    setLoading(true);
    
    const result = await deleteTournamentCategory(slug, id, showDeleteConfirm.catId);
    
    if (result.success) {
      toast.success('Deporte removido exitosamente');
      setShowDeleteConfirm({ isOpen: false, catId: null });
      fetchCategories();
    } else {
      toast.error(result.error || 'No se pudo eliminar. Verifica dependencias.');
    }
    setLoading(false);
  };

  if (!torneo) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-black uppercase text-blue-600 tracking-widest animate-pulse">Cargando torneo...</div>;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      
      {/* MODAL NATIVO DE ELIMINACIÓN DE CATEGORÍA */}
      {showDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Categoría?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              Esta acción es irreversible. Se perderán todas las inscripciones de atletas, fixtures y estadísticas asociadas a este deporte.
            </p>
            
            <div className="flex w-full gap-4">
              <button 
                onClick={() => setShowDeleteConfirm({ isOpen: false, catId: null })}
                disabled={loading}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeleteCategory}
                disabled={loading}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                {loading ? 'Borrando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        
        {/* BARRA DE NAVEGACIÓN SUPERIOR CON RUTAS DINÁMICAS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
           <button 
            onClick={() => router.push(`/${slug}/admin`)}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-all text-[10px] font-black uppercase tracking-widest group bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Panel principal
          </button>
          
          <div className="flex gap-4">
             <button 
              onClick={() => router.push(`/${slug}/admin/inscripcion`)}
              className="px-5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-600 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 shadow-sm"
            >
              <Users size={14} /> Gestión de Delegaciones
            </button>
          </div>
        </div>

        {/* INFO DEL TORNEO */}
        <div className="bg-white border border-slate-200 p-5 sm:p-8 rounded-[2rem] shadow-sm mb-8 sm:mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-200">Configuración Activa</span>
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">ID: {id.slice(0,8)}</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-slate-900 break-words">{torneo.name}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
          
          {/* PANEL IZQUIERDO: AGREGAR DEPORTES */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-blue-200 p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-lg lg:sticky lg:top-8">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tighter mb-6 sm:mb-8 flex items-center gap-2 text-blue-600">
                <Plus size={24} /> AGREGAR DEPORTE
              </h2>
              
              <form onSubmit={handleCreateCategory} className="space-y-6">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                    <Trophy size={14} className="text-blue-500"/> DEPORTE BASE
                  </label>
                  <AppSelect
                    value={newCat.sport_id}
                    onChange={(value) => setNewCat({ ...newCat, sport_id: value })}
                    placeholder="Seleccionar..."
                    options={[
                      { value: '', label: 'Seleccionar...' },
                      ...sports.map((sport) => ({ value: sport.id, label: sport.name })),
                    ]}
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                    <Users size={14} className="text-blue-500"/> NOMBRAMIENTO (NIVEL)
                  </label>
                  <input required type="text" placeholder="EJ: HIGH SCHOOL" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-900 uppercase outline-none focus:border-blue-400 focus:bg-white transition-colors text-sm" value={newCat.name} onChange={e => setNewCat({...newCat, name: e.target.value})} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 block">RAMA</label>
                    <AppSelect
                      value={newCat.gender}
                      onChange={(value) => setNewCat({ ...newCat, gender: value })}
                      options={[
                        { value: 'MASCULINO', label: 'MASC' },
                        { value: 'FEMENINO', label: 'FEM' },
                        { value: 'MIXTO', label: 'MIXTO' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 block">REGLA TIEMPO</label>
                    <input required type="text" placeholder="4x10 MIN" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-900 uppercase outline-none focus:border-blue-400 focus:bg-white transition-colors text-sm" value={newCat.match_duration} onChange={e => setNewCat({...newCat, match_duration: e.target.value})} />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black p-5 rounded-2xl transition-all uppercase text-xs tracking-[0.2em] shadow-lg shadow-blue-200 active:scale-95 mt-4">
                  {loading ? 'Activando...' : 'ACTIVAR DEPORTE'}
                </button>
              </form>
            </div>
          </div>

          {/* LISTADO DE DEPORTES ACTIVOS */}
          <div className="lg:col-span-2 space-y-8">
            <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-2 text-slate-900">
              <Activity className="text-blue-500" size={24} /> DEPORTES EN COMPETENCIA
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {categories.map(cat => (
                <div key={cat.id} className="bg-white border border-slate-200 p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] hover:border-blue-400 hover:shadow-lg transition-all shadow-sm group relative overflow-hidden flex flex-col h-full">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm border border-blue-100">
                      <Trophy size={24} />
                    </div>
                    <button 
                      onClick={() => setShowDeleteConfirm({ isOpen: true, catId: cat.id })} 
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>

                  <div className="flex-grow">
                    <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tighter mb-1 text-slate-900 leading-none break-words">{cat.sports?.name}</h3>
                    <p className="text-blue-600 font-bold uppercase text-[10px] tracking-widest mb-6">{cat.name} — {cat.gender}</p>
                    
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                      <span>{cat.sports?.scoring_system}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                      <span>{cat.match_duration}</span>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-auto">
                    <button 
                      onClick={() => router.push(`/${slug}/admin/inscripcion?cat=${cat.id}&tournament=${id}`)}
                      className="flex-1 bg-slate-900 text-white p-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 shadow-md active:scale-95"
                    >
                      <Users size={16} /> INSCRIBIR
                    </button>
                    <button 
                      onClick={() => router.push(`/${slug}/admin/crear-torneo?edit=${id}`)}
                      className="p-4 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 hover:text-slate-900 transition-colors active:scale-95 border border-slate-200"
                      title="Editar torneo, reglas y categorías"
                    >
                      <Settings2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              
              {categories.length === 0 && (
                <div className="col-span-full py-14 sm:py-20 text-center border-2 border-dashed border-slate-300 rounded-[2rem] sm:rounded-[3rem] bg-white">
                   <p className="text-slate-400 font-black uppercase tracking-widest text-sm">No hay deportes configurados aún</p>
                   <p className="text-slate-400 font-medium text-xs mt-2">Usa el panel lateral para agregar la primera categoría.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
