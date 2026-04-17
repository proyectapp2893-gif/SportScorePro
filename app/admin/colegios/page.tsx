'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../supabase';
import { ArrowLeft, School, Upload, Image as ImageIcon, Check, Edit2, X, Plus, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Image from 'next/image';

export default function ColegiosPage() {
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [uploadingForSchool, setUploadingForSchool] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');

  // ESTADO PARA MODAL DE ELIMINACIÓN
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });

  useEffect(() => {
    fetchSchools();
  }, []);

  async function fetchSchools() {
    setLoading(true);
    const { data, error } = await supabase.from('schools').select('*').order('name');
    if (error) {
      toast.error('Error al cargar los colegios');
    } else {
      setSchools(data || []);
    }
    setLoading(false);
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, schoolId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return toast.error('El archivo debe ser una imagen');
    }

    setUploadingForSchool(schoolId);
    const toastId = toast.loading('Subiendo escudo...');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${schoolId}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('schools')
        .update({ logo_url: publicUrl })
        .eq('id', schoolId);

      if (updateError) throw updateError;

      toast.success('Escudo actualizado correctamente', { id: toastId });
      fetchSchools(); 
    } catch (error: any) {
      console.error('Error subiendo logo:', error);
      toast.error('Error al subir la imagen', { id: toastId });
    } finally {
      setUploadingForSchool(null);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim()) return;

    setLoading(true);
    const { error } = await supabase.from('schools').insert([{ name: newSchoolName.trim().toUpperCase() }]);
    
    if (error) {
      toast.error(error.message.includes('unique') ? 'Este colegio ya existe' : 'Error al crear el colegio');
    } else {
      toast.success('Colegio creado exitosamente');
      setNewSchoolName('');
      setIsCreating(false);
      fetchSchools();
    }
    setLoading(false);
  };

  const handleUpdateSchoolName = async (schoolId: string) => {
    if (!editSchoolName.trim()) return;
    
    setLoading(true);
    const { error } = await supabase.from('schools').update({ name: editSchoolName.toUpperCase() }).eq('id', schoolId);
    
    if (error) {
      toast.error('Error al actualizar el nombre');
    } else {
      toast.success('Nombre actualizado');
      setEditingSchoolId(null);
      fetchSchools();
    }
    setLoading(false);
  };

  // FUNCIÓN PARA ELIMINAR COLEGIO
  const executeDeleteSchool = async () => {
    if (!showDeleteConfirm.id) return;
    setLoading(true);

    const toastId = toast.loading('Eliminando institución...');
    const { error } = await supabase.from('schools').delete().eq('id', showDeleteConfirm.id);
    
    if (error) {
      toast.error('Error: El colegio tiene equipos o jugadores asociados.', { id: toastId });
    } else {
      toast.success('Institución eliminada correctamente', { id: toastId });
      setShowDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchSchools();
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      
      {/* ========================================================= */}
      {/* MODAL NATIVO: CONFIRMACIÓN DE BORRADO DE COLEGIO */}
      {/* ========================================================= */}
      {showDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Institución?</h3>
            <p className="text-slate-500 text-sm font-bold mb-2 break-words">"{showDeleteConfirm.name}"</p>
            <p className="text-slate-400 text-xs font-medium mb-8 leading-relaxed">
              Esta acción eliminará el colegio de la base de datos. Solo es posible si la institución no tiene equipos inscritos ni partidos programados en ningún torneo.
            </p>
            
            <div className="flex w-full gap-4">
              <button 
                onClick={() => setShowDeleteConfirm({ isOpen: false, id: null, name: '' })}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm"
                disabled={loading}
              >
                Cancelar
              </button>
              <button 
                onClick={executeDeleteSchool}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                disabled={loading}
              >
                {loading ? 'Borrando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-12">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Gestión de <span className="text-amber-600">Colegios</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">CSJB Championship - Escudos y Nombres</p>
          </div>
          <div className="flex gap-4">
             <button 
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-2xl hover:bg-slate-800 transition-colors text-[10px] font-black uppercase tracking-widest shadow-md"
              >
                <Plus size={14} /> Nuevo Colegio
              </button>
            <Link href="/admin" className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Volver al Búnker
            </Link>
          </div>
        </div>

        {/* FORMULARIO CREAR COLEGIO */}
        {isCreating && (
           <div className="bg-white border border-amber-400 p-6 rounded-[2rem] mb-8 shadow-lg relative overflow-hidden animate-in fade-in slide-in-from-top-4">
               <div className="absolute top-0 left-0 w-full h-1 bg-amber-400"></div>
               <div className="flex justify-between items-center mb-4">
                   <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Registrar Nueva Institución</h3>
                   <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-full"><X size={16}/></button>
               </div>
               <form onSubmit={handleCreateSchool} className="flex flex-col sm:flex-row gap-4">
                   <input 
                      type="text" 
                      placeholder="NOMBRE OFICIAL DEL COLEGIO" 
                      required 
                      className="flex-1 bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-400 focus:bg-white uppercase transition-colors" 
                      value={newSchoolName} 
                      onChange={e => setNewSchoolName(e.target.value)} 
                  />
                  <button type="submit" disabled={loading} className="bg-amber-500 text-white font-black px-8 py-4 sm:py-0 rounded-xl hover:bg-amber-600 transition-all uppercase text-[10px] tracking-widest shadow-md shadow-amber-200">
                    Guardar
                  </button>
               </form>
           </div>
        )}

        {/* LISTA DE COLEGIOS */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <School className="text-amber-600"/>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Directorio de Instituciones ({schools.length})</h3>
          </div>
          
          {loading && schools.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando colegios...</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {schools.map(school => (
                <div key={school.id} className="p-6 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-6 group">
                  
                  {/* INFO DEL COLEGIO (LOGO + NOMBRE) */}
                  <div className="flex items-center gap-6 flex-1">
                    
                    {/* ZONA DE LOGO */}
                    <div className="relative w-16 h-16 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm group-hover:border-amber-300 transition-colors">
                      {school.logo_url ? (
                        <Image 
                          src={school.logo_url} 
                          alt={`Escudo de ${school.name}`} 
                          layout="fill" 
                          objectFit="contain"
                          className="p-1.5"
                        />
                      ) : (
                        <ImageIcon className="text-slate-300" size={24} />
                      )}
                      
                      {/* BOTÓN OVERLAY PARA SUBIR IMAGEN */}
                      <label className={`absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ${uploadingForSchool === school.id ? 'opacity-100' : ''}`}>
                        {uploadingForSchool === school.id ? (
                          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Upload size={16} className="text-amber-600 mb-1" />
                            <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">Subir</span>
                          </>
                        )}
                        <input 
                          type="file" 
                          accept="image/png, image/jpeg, image/jpg, image/webp" 
                          className="hidden" 
                          onChange={(e) => handleLogoUpload(e, school.id)}
                          disabled={uploadingForSchool === school.id}
                        />
                      </label>
                    </div>

                    {/* NOMBRE O EDICIÓN DEL NOMBRE */}
                    <div className="flex-1 flex items-center justify-between">
                      {editingSchoolId === school.id ? (
                        <div className="flex items-center gap-2 w-full max-w-lg">
                          <input 
                            type="text" 
                            value={editSchoolName}
                            onChange={(e) => setEditSchoolName(e.target.value)}
                            className="w-full bg-white border-2 border-amber-400 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none uppercase shadow-sm"
                            autoFocus
                          />
                          <button onClick={() => handleUpdateSchoolName(school.id)} disabled={loading} className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-500 hover:text-white transition-colors">
                            <Check size={18} />
                          </button>
                          <button onClick={() => setEditingSchoolId(null)} className="p-3 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-200 hover:text-slate-700 transition-colors">
                            <X size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">{school.name}</h4>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditSchoolName(school.name);
                                setEditingSchoolId(school.id);
                              }} 
                              className="text-slate-400 hover:text-amber-500 transition-colors p-2 rounded-xl hover:bg-amber-50 border border-transparent hover:border-amber-200"
                              title="Editar nombre"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => setShowDeleteConfirm({ isOpen: true, id: school.id, name: school.name })} 
                              className="text-slate-400 hover:text-red-500 transition-colors p-2 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-200"
                              title="Eliminar institución"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}