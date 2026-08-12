'use client';

import { Suspense, useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '../supabase'; // Asegúrate de que la ruta a supabase sea correcta desde fuera de admin
import { UserPlus, Trash2, ArrowLeft, Download, Upload, Users, Edit2, Check, X, AlertTriangle, ArrowRight, Trophy, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AppSelect from '@/app/components/AppSelect';
import {
  addPublicRegistrationPlayers,
  deletePublicRegistrationPlayer,
  deletePublicRegistrationTeam,
  getOrCreatePublicRegistrationTeam,
  updatePublicRegistrationTeamName,
} from './actions';

type School = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name?: string | null;
  gender?: string | null;
  sports?: { name?: string | null } | null;
};

type Team = {
  id: string;
  name: string;
};

type Player = {
  id: string;
  name: string;
  shirt_number?: number | string | null;
  birth_year?: number | string | null;
};

type ExcelRow = Record<string, string | number | null | undefined>;

function InscripcionPublicaContent() {
  const searchParams = useSearchParams();
  const urlCategory = searchParams.get('cat');

  // Estado para la Pantalla de Bienvenida
  const [hasStarted, setHasStarted] = useState(false);

  // Datos base
  const [schools, setSchools] = useState<School[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Flujo de navegación
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Datos específicos de la categoría seleccionada
  const [selectedSchool, setSelectedSchool] = useState('');
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  
  // Estados de interfaz y formularios
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newPlayer, setNewPlayer] = useState({ name: '', shirt_number: '', birth_year: '' });
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [editTeamName, setEditTeamName] = useState('');

  // Modales
  const [showDeleteTeamModal, setShowDeleteTeamModal] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      const { data: s } = await supabase.from('schools').select('*').order('name');
      const { data: c } = await supabase.from('categories').select('*, sports(name)').order('name');
      if (s) setSchools(s);
      if (c) setCategories(c);
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    if (urlCategory && categories.length > 0) {
      const cat = categories.find(c => c.id === urlCategory);
      if (cat) {
        setSelectedCategory(urlCategory);
        setSelectedSport(cat.sports?.name ?? null);
        setHasStarted(true); // Si entra por link directo con categoría, saltamos el landing
      }
    }
  }, [urlCategory, categories]);

  const fetchPlayers = useCallback(async () => {
    const { data: team } = await supabase.from('teams').select('*').eq('school_id', selectedSchool).eq('category_id', selectedCategory).single();
    if (team) {
      setCurrentTeam(team);
      const { data: p } = await supabase.from('players').select('*').eq('team_id', team.id).order('shirt_number');
      setPlayers(p || []);
    } else {
      setCurrentTeam(null);
      setPlayers([]);
    }
  }, [selectedCategory, selectedSchool]);

  useEffect(() => {
    if (selectedSchool && selectedCategory) {
      fetchPlayers();
    } else {
      setCurrentTeam(null);
      setPlayers([]);
    }
  }, [fetchPlayers, selectedSchool, selectedCategory]);

  async function getOrCreateTeam() {
    if (!selectedSchool || !selectedCategory) return null;
    const result = await getOrCreatePublicRegistrationTeam(selectedSchool, selectedCategory);
    if (!result.success) {
      toast.error(result.error);
      return null;
    }
    setCurrentTeam(result.data);
    return result.data;
  }

  const handleUpdateTeamName = async () => {
    if (!editTeamName.trim() || !currentTeam) return;
    setLoading(true);
    const result = await updatePublicRegistrationTeamName(currentTeam.id, editTeamName);
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success('Nombre de delegación actualizado');
      setCurrentTeam({ ...currentTeam, name: editTeamName.toUpperCase() });
      setIsEditingTeam(false);
    }
    setLoading(false);
  };

  const executeDeleteTeam = async () => {
    if (!currentTeam) return;
    setLoading(true);
    setShowDeleteTeamModal(false);
    const toastId = toast.loading('Eliminando delegación y jugadores...');
    
    const result = await deletePublicRegistrationTeam(currentTeam.id);
    
    if (!result.success) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success('Delegación eliminada con éxito', { id: toastId });
      setSelectedSchool('');
      setCurrentTeam(null);
      setPlayers([]);
    }
    setLoading(false);
  };

  const executeDeletePlayer = async () => {
    if (!playerToDelete) return;
    setLoading(true);
    const result = await deletePublicRegistrationPlayer(playerToDelete.id);
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success('Atleta dado de baja');
      fetchPlayers();
    }
    setPlayerToDelete(null);
    setLoading(false);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { NOMBRE_COMPLETO: "EJEMPLO PEREZ", DORSAL: 10, ANO_NACIMIENTO: 2011 },
      { NOMBRE_COMPLETO: "JUAN DOMINGUEZ", DORSAL: 7, ANO_NACIMIENTO: "26-06-2010" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INSCRIPCION");
    XLSX.writeFile(wb, "Plantilla_CSJB_Jugadores.xlsx");
    toast.success('Plantilla descargada con éxito');
  };

  const extractYearFromExcelValue = (value: unknown): number => {
    if (!value) return 0;
    if (typeof value === 'number' && value > 1900 && value < 2100) return value;
    const strVal = String(value).trim();
    if (/^\d{4}$/.test(strVal)) return parseInt(strVal);
    const yearMatch = strVal.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) return parseInt(yearMatch[1]);
    return 0; 
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedSchool || !selectedCategory) return toast.error('Primero selecciona Colegio y Deporte');
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const toastId = toast.loading('Leyendo Excel y encriptando datos...');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<ExcelRow>(ws);

        const team = await getOrCreateTeam();
        if (!team) throw new Error("Error de delegación");

        const formattedPlayers = data.map((row) => {
          const rawYear = row.ANO_NACIMIENTO || row.Ano_Nacimiento || row.ano_nacimiento || row.FECHA_NACIMIENTO || '';
          return {
            name: String(row.NOMBRE_COMPLETO || row.Nombre || row.nombre || '').toUpperCase().trim(),
            shirtNumber: parseInt(String(row.DORSAL || row.Dorsal || row.dorsal || 0)),
            birthYear: extractYearFromExcelValue(rawYear),
          };
        }).filter(p => p.name && p.name !== 'UNDEFINED');

        if (formattedPlayers.length === 0) {
          throw new Error("No se encontraron jugadores válidos. Revisa las columnas de tu Excel.");
        }

        const result = await addPublicRegistrationPlayers(selectedSchool, selectedCategory, formattedPlayers);
        if (!result.success) throw new Error(result.error);
        setCurrentTeam(result.data.team);
        
        toast.success(`¡${result.data.inserted} atletas inscritos con éxito!`, { id: toastId });
        fetchPlayers();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error procesando el Excel.', { id: toastId });
      }
      setLoading(false);
      if(fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSchool || !selectedCategory) return toast.error('Selecciona Colegio y Deporte');
    setLoading(true);
    
    const team = await getOrCreateTeam();
    if (!team) { setLoading(false); return; }

    const yearToSave = extractYearFromExcelValue(newPlayer.birth_year);

    const result = await addPublicRegistrationPlayers(selectedSchool, selectedCategory, [{
      name: newPlayer.name.trim().toUpperCase(),
      shirtNumber: parseInt(newPlayer.shirt_number),
      birthYear: yearToSave,
    }]);

    if (result.success) {
      toast.success('Atleta registrado');
      setNewPlayer({ name: '', shirt_number: '', birth_year: '' });
      fetchPlayers();
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol')) return <FaFutbol className="text-emerald-500" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-500" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-yellow-500" size={size} />;
    if (name.includes('softbol') || name.includes('softball') || name.includes('béisbol') || name.includes('baseball')) return <FaBaseballBall className="text-red-500" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  const uniqueSports = Array.from(new Set(categories.map(c => c.sports?.name).filter(Boolean)));

  // ==============================================================================
  // VISTA 0: PANTALLA DE BIENVENIDA (LANDING)
  // ==============================================================================
  if (!hasStarted) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans relative overflow-hidden">
        
        {/* Decoración de fondo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="bg-white border border-slate-200 p-6 sm:p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] w-full max-w-2xl shadow-2xl flex flex-col items-center text-center relative z-10 animate-in fade-in zoom-in-95 duration-700">
          
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-white rounded-full flex items-center justify-center mb-6 sm:mb-8 border-4 border-slate-50 shadow-xl p-4">
             <Image src="/logo.png" alt="Logo Torneo" width={128} height={128} className="w-full h-full object-contain" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 uppercase tracking-tighter mb-4 leading-none">
            CSJB <span className="text-blue-600">Championship</span>
          </h1>
          
          <p className="text-slate-500 font-bold uppercase tracking-[0.18em] text-[10px] sm:text-xs mb-8 sm:mb-10">
            Portal Oficial de Inscripción de Delegaciones
          </p>

          <div className="bg-slate-50 border border-slate-100 rounded-2xl sm:rounded-3xl p-4 sm:p-6 mb-8 sm:mb-10 w-full text-left space-y-4">
             <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> Selecciona tu Deporte y Categoría
             </div>
             <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> Busca el nombre de tu Institución
             </div>
             <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> Carga tu nómina usando Excel o Manualmente
             </div>
          </div>

          <button 
            onClick={() => setHasStarted(true)}
            className="w-full py-4 sm:py-6 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3"
          >
            Iniciar Inscripción <ArrowRight size={20} />
          </button>
        </div>
      </main>
    );
  }

  // ==============================================================================
  // VISTAS PRINCIPALES (DEPORTES, CATEGORÍAS, REGISTRO)
  // ==============================================================================
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      
      {/* MODALES (Eliminar Equipo y Jugador) */}
      {showDeleteTeamModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Delegación?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              Esta acción borrará al equipo completo <strong>&quot;{currentTeam?.name}&quot;</strong> y eliminará a todos los jugadores inscritos en esta categoría. No se puede deshacer.
            </p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowDeleteTeamModal(false)} disabled={loading} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm">Cancelar</button>
              <button onClick={executeDeleteTeam} disabled={loading} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200">{loading ? 'Borrando...' : 'Sí, Eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {playerToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-6 border border-amber-100 shadow-inner">
              <UserPlus size={40} className="rotate-45 opacity-50" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Dar de Baja?</h3>
            <p className="text-slate-800 font-black text-lg mb-2">{playerToDelete.name}</p>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">Eliminarás a este atleta de la nómina oficial. Perderá sus registros de goles/puntos si ya los tiene.</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setPlayerToDelete(null)} disabled={loading} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm">Cancelar</button>
              <button onClick={executeDeletePlayer} disabled={loading} className="flex-1 py-4 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200">{loading ? 'Procesando...' : 'Dar de Baja'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-12 relative">
        
        {/* CABECERA Y NAVEGACIÓN CAUTIVA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Central de <span className="text-blue-600">Inscripciones</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Gestión Oficial de Nóminas</p>
          </div>
          
          {/* Lógica de botones "Atrás" que NO envían al admin */}
          {selectedCategory ? (
            <button onClick={() => { setSelectedCategory(''); setSelectedSchool(''); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Cambiar Categoría
            </button>
          ) : selectedSport ? (
            <button onClick={() => setSelectedSport(null)} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Cambiar Deporte
            </button>
          ) : null}
        </div>

        {/* VISTA 1: SELECCIONAR DEPORTE */}
        {!selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-6">
               <Trophy className="text-blue-600" size={24}/> 1. Selecciona el Deporte
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{sport as string}</h3>
                   <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 mt-4 group-hover:text-blue-600 transition-colors w-full justify-between">
                     Ver Categorías <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </p>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIONAR CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-4 mb-6">
               {getSportIcon(selectedSport, 28)} 2. Categorías de {selectedSport}
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => setSelectedCategory(c.id)}
                   className="group flex flex-col p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2">{c.name}</h3>
                   <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 w-full justify-between">
                     Inscribir Jugadores <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: GESTIÓN DE NÓMINAS */}
        {selectedCategory && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            
            {/* SELECTOR DE DELEGACIÓN */}
            <div className="bg-white border border-slate-200 p-6 rounded-[2rem] mb-8 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
              <label className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mb-3 flex items-center gap-2 mt-2"><Users size={14} className="text-blue-500"/> 3. Seleccionar Institución o Club</label>
              <AppSelect
                value={selectedSchool}
                onChange={setSelectedSchool}
                placeholder="Buscar en la lista oficial..."
                options={[
                  { value: '', label: 'Buscar en la lista oficial...' },
                  ...schools.map((school) => ({ value: school.id, label: school.name })),
                ]}
              />
            </div>

            {selectedSchool && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
                
                {/* PANEL IZQUIERDO: REGISTRO */}
                <div className="space-y-6">
                  <div className="bg-white border border-blue-200 p-8 rounded-[2.5rem] text-center shadow-md relative overflow-hidden group hover:border-blue-400 transition-colors">
                    <div className="absolute -right-10 -top-10 text-blue-50 rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
                      <Users size={150} />
                    </div>
                    <Users size={40} className="text-blue-500 mx-auto mb-4 relative z-10" />
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter mb-2 relative z-10">Carga Masiva Excel</h3>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-6 font-bold relative z-10">1 clic para inscribir todo el equipo</p>
                    <div className="relative z-10 space-y-3">
                      <button onClick={downloadTemplate} className="w-full flex items-center justify-center gap-2 bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 p-4 rounded-xl hover:bg-slate-200 transition-all text-[10px] font-black uppercase tracking-widest">
                        <Download size={16} /> Descargar Plantilla
                      </button>
                      <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                      <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-4 rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-200 text-[10px] font-black uppercase tracking-widest">
                        <Upload size={16} /> Subir Archivo Lleno
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2"><UserPlus size={16} className="text-blue-500"/> Registro Manual</h3>
                    <form onSubmit={handleAddPlayer} className="space-y-4">
                      <input type="text" placeholder="NOMBRE COMPLETO" required className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white uppercase transition-colors" value={newPlayer.name} onChange={e => setNewPlayer({...newPlayer, name: e.target.value})} />
                      <div className="grid grid-cols-2 gap-4">
                        <input type="number" placeholder="DORSAL #" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white transition-colors" value={newPlayer.shirt_number} onChange={e => setNewPlayer({...newPlayer, shirt_number: e.target.value})} />
                        <input type="text" placeholder="AÑO / FECHA NAC." className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white transition-colors" value={newPlayer.birth_year} onChange={e => setNewPlayer({...newPlayer, birth_year: e.target.value})} title="Ej: '2011' o '26-06-2011'" />
                      </div>
                      <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black p-4 rounded-xl hover:bg-slate-800 transition-all uppercase text-[10px] tracking-widest mt-2 shadow-md">
                        {loading ? 'Procesando...' : 'Inscribir Atleta'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* PANEL DERECHO: ROSTER OFICIAL */}
                <div className="lg:col-span-2">
                  <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm min-h-[400px] flex flex-col">
                    {currentTeam && (
                      <div className="bg-slate-50 border-b border-slate-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {isEditingTeam ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input type="text" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} className="flex-1 bg-white border border-blue-400 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none uppercase shadow-sm" autoFocus />
                            <button onClick={handleUpdateTeamName} disabled={loading} className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-500 hover:text-white transition-colors"><Check size={18} /></button>
                            <button onClick={() => setIsEditingTeam(false)} className="p-3 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-200 hover:text-slate-700 transition-colors"><X size={18} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                              {getSportIcon(selectedSport || '')}
                            </div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{currentTeam.name}</h2>
                            <button onClick={() => { setEditTeamName(currentTeam.name ?? ''); setIsEditingTeam(true); }} className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200">
                              <Edit2 size={16} />
                            </button>
                          </div>
                        )}
                        <button onClick={() => setShowDeleteTeamModal(true)} disabled={loading} className="flex items-center justify-center gap-2 px-5 py-3 bg-white text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all text-[10px] font-black uppercase tracking-widest shrink-0 shadow-sm">
                          <Trash2 size={16} /> Borrar Delegación
                        </button>
                      </div>
                    )}

                    <div className="overflow-x-auto flex-1 bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">
                            <th className="p-6 w-20 text-center">#</th>
                            <th className="p-6">Nombre del Atleta</th>
                            <th className="p-6 text-center">Año Nac.</th>
                            <th className="p-6 text-right">Baja</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {players.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                              <td className="p-6 text-center font-black text-blue-600 text-lg">{p.shirt_number || '-'}</td>
                              <td className="p-6 font-black text-slate-900 uppercase tracking-tight">{p.name}</td>
                              <td className="p-6 text-center text-slate-500 font-bold">{p.birth_year || '-'}</td>
                              <td className="p-6 text-right">
                                <button onClick={() => setPlayerToDelete({ id: p.id, name: p.name })} className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {players.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-16 text-center">
                                 <div className="flex flex-col items-center justify-center">
                                   <Upload size={32} className="text-slate-300 mb-4" />
                                   <p className="text-slate-500 font-black uppercase text-sm tracking-widest">Nómina Vacía</p>
                                   <p className="text-slate-400 font-medium text-xs mt-2">Usa la carga masiva de Excel o el registro manual.</p>
                                 </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function InscripcionPublicaPage() {
  return (
    <Suspense fallback={null}>
      <InscripcionPublicaContent />
    </Suspense>
  );
}
