'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../supabase';
import { ArrowLeft, School, Upload, Image as ImageIcon, Check, Edit2, X, Plus, Trash2, AlertTriangle, LayoutDashboard, Database, TableProperties, Eraser, Save } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { createSchools, deleteSchool, updateSchoolName, uploadSchoolLogo } from './actions';

export default function ColegiosPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [uploadingForSchool, setUploadingForSchool] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');

  const [clientId, setClientId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });

  // ESTADOS PARA LA GRILLA TIPO EXCEL
  const [showGridModal, setShowGridModal] = useState(false);
  const [gridData, setGridData] = useState<string[]>(Array(10).fill('')); // Empezamos con 10 filas vacías

  useEffect(() => {
    if (slug) {
      initializePage();
    }
  }, [slug]);

  async function initializePage() {
    setLoading(true);
    const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
    
    if (client) {
      setClientId(client.id);
      fetchSchools(client.id);
    } else {
      toast.error('Error de autenticación de inquilino');
    }
    setLoading(false);
  }

  async function fetchSchools(id?: string) {
    const targetId = id || clientId;
    if (!targetId) return;

    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('client_id', targetId)
      .order('name');

    if (error) {
      toast.error('Error al cargar los colegios');
    } else {
      setSchools(data || []);
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, schoolId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return toast.error('El archivo debe ser una imagen');
    }

    setUploadingForSchool(schoolId);
    const toastId = toast.loading('Subiendo escudo institucional...');

    try {
      const result = await uploadSchoolLogo(slug, schoolId, file);
      if (!result.success) throw new Error(result.error);

      toast.success('Escudo actualizado en el servidor', { id: toastId });
      fetchSchools(); 
    } catch (error: any) {
      toast.error('Fallo en la carga del archivo', { id: toastId });
    } finally {
      setUploadingForSchool(null);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim() || !clientId) return;

    setLoading(true);
    const result = await createSchools(slug, [newSchoolName]);
    
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success('Institución añadida al Directorio');
      setNewSchoolName('');
      setIsCreating(false);
      fetchSchools();
    }
    setLoading(false);
  };

  const handleUpdateSchoolName = async (schoolId: string) => {
    if (!editSchoolName.trim()) return;
    
    setLoading(true);
    const result = await updateSchoolName(slug, schoolId, editSchoolName);
    
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success('Nombre actualizado');
      setEditingSchoolId(null);
      fetchSchools();
    }
    setLoading(false);
  };

  const executeDeleteSchool = async () => {
    if (!showDeleteConfirm.id) return;
    setLoading(true);

    const toastId = toast.loading('Eliminando institución de la base de datos...');
    const result = await deleteSchool(slug, showDeleteConfirm.id);
    
    if (!result.success) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success('Institución eliminada correctamente', { id: toastId });
      setShowDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchSchools();
    }
    setLoading(false);
  };

  // ==========================================================
  // FUNCIONALIDAD GRILLA TIPO EXCEL (MAGIA DE PORTAPAPELES)
  // ==========================================================
  
  const handleGridChange = (index: number, value: string) => {
    const newData = [...gridData];
    newData[index] = value;
    setGridData(newData);
  };

  const handleGridPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    
    // Separar los datos copiados por salto de línea (como lo copia Excel)
    const rows = pasteData.split(/\r?\n/).map(r => r.trim()).filter(r => r);
    if (rows.length === 0) return;

    let newData = [...gridData];
    
    // Si lo que pegamos excede el tamaño actual de la cuadrícula, la hacemos más grande
    while (rowIndex + rows.length > newData.length) {
      newData.push('');
    }

    // Insertar los datos copiados a partir de la celda donde se hizo el Paste
    for (let i = 0; i < rows.length; i++) {
      newData[rowIndex + i] = rows[i];
    }
    
    setGridData(newData);
    toast.success(`${rows.length} registros pegados correctamente`);
  };

  const addMoreRows = () => {
    setGridData([...gridData, ...Array(10).fill('')]);
  };

  const clearGrid = () => {
    setGridData(Array(10).fill(''));
  };

  const processGridData = async () => {
    if (!clientId) return toast.error('Error de sesión. Recargue la página.');
    
    // Filtrar celdas vacías y extraer los nombres válidos
    const validEntries = gridData.map(name => name.trim()).filter(name => name.length > 0);
    
    if (validEntries.length === 0) {
      return toast.error('La cuadrícula está vacía.');
    }

    setLoading(true);
    const toastId = toast.loading('Procesando lista de instituciones...');

    try {
      const result = await createSchools(slug, validEntries);
      if (!result.success) throw new Error(result.error);

      toast.success(`¡Éxito! ${result.data.inserted} instituciones creadas.`, { id: toastId });
      setShowGridModal(false);
      clearGrid();
      fetchSchools();

    } catch (error: any) {
      toast.error(error.message || 'Error al procesar la información.', { id: toastId });
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      
      {/* ========================================================== */}
      {/* MODAL: GRILLA INTERACTIVA TIPO EXCEL */}
      {/* ========================================================== */}
      {showGridModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-600"></div>
            
            <div className="p-8 pb-4 flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Carga Masiva <span className="text-emerald-600">Pro</span></h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                  <TableProperties size={12} className="text-emerald-500"/> Copia y pega directamente desde Excel
                </p>
              </div>
              <button onClick={() => setShowGridModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* CUADRÍCULA DE DATOS */}
            <div className="px-8 overflow-y-auto flex-1 scrollbar-hide py-4 border-y border-slate-100 bg-slate-50">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="grid grid-cols-[60px_1fr] bg-slate-100 border-b border-slate-200">
                  <div className="py-3 text-center text-[10px] font-black text-slate-400 uppercase border-r border-slate-200">Fila</div>
                  <div className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre de la Institución</div>
                </div>
                
                <div className="divide-y divide-slate-100">
                  {gridData.map((rowValue, idx) => (
                    <div key={idx} className="grid grid-cols-[60px_1fr] group">
                      <div className="py-3 text-center text-xs font-bold text-slate-300 border-r border-slate-100 bg-slate-50 flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <input 
                        type="text"
                        value={rowValue}
                        onChange={(e) => handleGridChange(idx, e.target.value)}
                        onPaste={(e) => handleGridPaste(e, idx)}
                        placeholder={idx === 0 ? "Ej: Copia y pega tu columna aquí..." : ""}
                        className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:bg-blue-50 focus:text-blue-700 uppercase transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              <button onClick={addMoreRows} className="w-full mt-4 py-3 bg-slate-200/50 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 border border-dashed border-slate-300">
                 <Plus size={14}/> Añadir 10 filas más
              </button>
            </div>
            
            <div className="p-8 pt-4 flex flex-wrap sm:flex-nowrap w-full gap-4 shrink-0 bg-white">
              <button onClick={clearGrid} className="w-full sm:w-auto py-4 px-6 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center gap-2">
                 <Eraser size={16}/> Limpiar
              </button>
              <button onClick={processGridData} disabled={loading} className="w-full flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50">
                <Database size={16} /> {loading ? 'Procesando...' : 'Sincronizar Lista con BD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NATIVO: CONFIRMACIÓN DE BORRADO */}
      {showDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Institución?</h3>
            <p className="text-slate-500 text-sm font-bold mb-2 break-words">"{showDeleteConfirm.name}"</p>
            <p className="text-slate-400 text-xs font-medium mb-8 leading-relaxed">
              Esta acción es permanente dentro de su Management Suite. Solo es posible si la institución no tiene participación activa.
            </p>
            
            <div className="flex w-full gap-4">
              <button onClick={() => setShowDeleteConfirm({ isOpen: false, id: null, name: '' })} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm" disabled={loading}>
                Cancelar
              </button>
              <button onClick={executeDeleteSchool} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200" disabled={loading}>
                {loading ? 'Procesando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-12">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Directorio de <span className="text-blue-600">Instituciones</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">SportScore HUB - Gestión de Identidad Visual</p>
          </div>
          <div className="flex flex-wrap gap-4">
             <button onClick={() => setShowGridModal(true)} className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl hover:bg-emerald-500 transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-200">
                <TableProperties size={16} /> Carga Masiva (Excel)
              </button>
             <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl hover:bg-blue-600 transition-colors text-xs font-black uppercase tracking-widest shadow-md">
                <Plus size={16} /> Crear Uno
              </button>
            
            <Link href={`/${slug}/admin`} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> Volver al HUB
            </Link>
          </div>
        </div>

        {/* FORMULARIO CREAR COLEGIO (MANUAL) */}
        {isCreating && (
           <div className="bg-white border border-blue-400 p-6 rounded-[2rem] mb-8 shadow-lg relative overflow-hidden animate-in fade-in slide-in-from-top-4">
               <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
               <div className="flex justify-between items-center mb-4">
                   <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Alta Individual</h3>
                   <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-full"><X size={16}/></button>
               </div>
               <form onSubmit={handleCreateSchool} className="flex flex-col sm:flex-row gap-4">
                   <input 
                      type="text" 
                      placeholder="NOMBRE OFICIAL (EJ: COLEGIO SAN JOSÉ)" 
                      required 
                      className="flex-1 bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white uppercase transition-colors" 
                      value={newSchoolName} 
                      onChange={e => setNewSchoolName(e.target.value)} 
                  />
                  <button type="submit" disabled={loading} className="bg-blue-600 text-white font-black px-8 py-4 sm:py-0 rounded-xl hover:bg-blue-700 transition-all uppercase text-[10px] tracking-widest shadow-md shadow-blue-200">
                    Guardar Registro
                  </button>
               </form>
           </div>
        )}

        {/* LISTA DE COLEGIOS */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <School className="text-blue-600"/>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Instituciones Autorizadas ({schools.length})</h3>
          </div>
          
          {loading && schools.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">Escaneando base de datos del cliente...</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {schools.map(school => (
                <div key={school.id} className="p-6 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-6 group">
                  
                  <div className="flex items-center gap-6 flex-1">
                    
                    {/* ZONA DE LOGO */}
                    <div className="relative w-16 h-16 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm group-hover:border-blue-300 transition-colors">
                      {school.logo_url ? (
                        <Image src={school.logo_url} alt={`Logo ${school.name}`} layout="fill" objectFit="contain" className="p-1.5"/>
                      ) : (
                        <ImageIcon className="text-slate-300" size={24} />
                      )}
                      
                      <label className={`absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ${uploadingForSchool === school.id ? 'opacity-100' : ''}`}>
                        {uploadingForSchool === school.id ? (
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Upload size={16} className="text-blue-600 mb-1" />
                            <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">Cargar PC</span>
                          </>
                        )}
                        <input type="file" accept="image/png, image/jpeg, image/jpg, image/webp" className="hidden" onChange={(e) => handleLogoUpload(e, school.id)} disabled={uploadingForSchool === school.id}/>
                      </label>
                    </div>

                    <div className="flex-1 flex items-center justify-between">
                      {editingSchoolId === school.id ? (
                        <div className="flex items-center gap-2 w-full max-w-lg">
                          <input type="text" value={editSchoolName} onChange={(e) => setEditSchoolName(e.target.value)} className="w-full bg-white border-2 border-blue-400 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none uppercase shadow-sm" autoFocus/>
                          <button onClick={() => handleUpdateSchoolName(school.id)} disabled={loading} className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-500 hover:text-white transition-colors"><Check size={18} /></button>
                          <button onClick={() => setEditingSchoolId(null)} className="p-3 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-200 hover:text-slate-700 transition-colors"><X size={18} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">{school.name}</h4>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditSchoolName(school.name); setEditingSchoolId(school.id); }} className="text-slate-400 hover:text-blue-500 transition-colors p-2 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-200" title="Renombrar"><Edit2 size={16} /></button>
                            <button onClick={() => setShowDeleteConfirm({ isOpen: true, id: school.id, name: school.name })} className="text-slate-400 hover:text-red-500 transition-colors p-2 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-200" title="Remover"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              ))}
              {schools.length === 0 && !loading && (
                 <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">
                    Sin instituciones registradas. Utilice la carga masiva o registre manualmente.
                 </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
