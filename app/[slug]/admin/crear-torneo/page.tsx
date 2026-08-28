'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { supabase } from '../../../supabase'; 
import { Trophy, Plus, School, CheckCircle2, ChevronRight, ChevronLeft, Image as ImageIcon, UploadCloud, Scale, DollarSign, X, Swords, GitMerge, Settings, Crown, ListOrdered, Grid2x2, LayoutGrid, TableProperties, Eraser, Database, Upload, Trash2, AlertTriangle, Edit2, Check, Clock, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/app/components/AppDialog';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall, FaTableTennis, FaGolfBall } from 'react-icons/fa';
import { GiTennisRacket } from 'react-icons/gi';
import { createSchools, deleteSchool, updateSchoolName, uploadSchoolLogo } from '../colegios/actions';
import { saveTournamentWizard, uploadTournamentLogo } from './actions';
import Image from 'next/image';
import AppSelect from '@/app/components/AppSelect';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import { createDemoSchools, deleteDemoSchool, saveDemoTournament, updateDemoSchool } from '@/app/lib/demo/actions';

export default function CrearTorneoPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const slug = params?.slug as string;
  const isDemo = slug === DEMO_SLUG;
  const editingTournamentId = searchParams.get('edit');

  const [clientInfo, setClientInfo] = useState<{ id: string; name: string } | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Paso 1 y 2
  const [availableSports, setAvailableSports] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState<any | null>(null);
  const [tournamentFormat, setTournamentFormat] = useState<string>('LEAGUE');

  // Paso 3: Info del Torneo
  const [newTournamentName, setNewTournamentName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null); 
  
  const [fpEnabled, setFpEnabled] = useState(false);
  const [fpStartingPoints, setFpStartingPoints] = useState<number | ''>(1000);
  const [fpYellowDeduction, setFpYellowDeduction] = useState<number | ''>(100);
  const [fpRedDeduction, setFpRedDeduction] = useState<number | ''>(300);
  const [fpNoShowDeduction, setFpNoShowDeduction] = useState<number | ''>(500);
  const [fpYellowFine, setFpYellowFine] = useState<number | ''>(0);
  const [fpRedFine, setFpRedFine] = useState<number | ''>(0);
  const [scheduleTimeSlots, setScheduleTimeSlots] = useState<string[]>(['08:00', '10:00', '12:00']);
  const [scheduleDates, setScheduleDates] = useState<string[]>(['']);
  const [availableVenues, setAvailableVenues] = useState<string[]>(['Cancha 1', 'Cancha 2']);
  const [fixtureVisibleToDelegates, setFixtureVisibleToDelegates] = useState(false);
  const [fixtureVisibleToPublic, setFixtureVisibleToPublic] = useState(false);

  const [customFpRules, setCustomFpRules] = useState<{ id: string; name: string; points: number | '' }[]>([]);
  
  // Paso 4: Directorio de Delegaciones
  const [availableSchools, setAvailableSchools] = useState<any[]>([]);
  const [newSchoolName, setNewSchoolName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingForSchool, setUploadingForSchool] = useState<string | null>(null);
  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [editSchoolName, setEditSchoolName] = useState('');
  
  // Grilla Excel
  const [showGridModal, setShowGridModal] = useState(false);
  const [gridData, setGridData] = useState<string[]>(Array(10).fill(''));
  
  // Borrar Delegación
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });

  // Paso 5: Categorías y Asignación
  const [categoriesToCreate, setCategoriesToCreate] = useState<{ id: string; name: string; gender: string; duration: string; isExisting?: boolean }[]>([]);
  const [deletedCategoryIds, setDeletedCategoryIds] = useState<string[]>([]);
  const [tempCatName, setTempCatName] = useState('');
  const [tempGender, setTempGender] = useState('MASCULINO');
  const [tempDuration, setTempDuration] = useState('');
  const [teamsMap, setTeamsMap] = useState<Record<string, string[]>>({});
  const [selectedCatForTeams, setSelectedCatForTeams] = useState<string | null>(null); 

  useEffect(() => {
    if (slug) fetchClientData();
  }, [slug]);

  useEffect(() => {
    if (clientInfo?.id) {
      fetchInitialDataForWizard();
      if (editingTournamentId) loadTournamentToEdit(editingTournamentId);
    }
  }, [clientInfo, editingTournamentId]);

  async function fetchClientData() {
    const { data } = await supabase.from('clients').select('id, name').eq('slug', slug).single();
    if (data) setClientInfo(data);
  }

  async function fetchInitialDataForWizard() {
    const { data: sports } = await supabase.from('sports').select('*').order('name');
    if (sports) setAvailableSports(sports);

    if (clientInfo?.id) {
      fetchSchools(clientInfo.id);
    }
  }

  async function fetchSchools(id: string) {
    const { data, error } = await supabase.from('schools').select('*').eq('client_id', id).order('name');
    if (!error && data) setAvailableSchools(data);
  }

  async function loadTournamentToEdit(id: string) {
    const toastId = toast.loading('Cargando arquitectura del evento...');
    try {
      const { data: tournament } = await supabase.from('tournaments').select('*').eq('id', id).single();
      if (!tournament) throw new Error('Torneo no encontrado');

      setNewTournamentName(tournament.name);
      setExistingLogoUrl(tournament.logo_url);
      setTournamentFormat(tournament.tournament_format || 'LEAGUE');
      
      setFpEnabled(tournament.fair_play_enabled || false);
      setFpStartingPoints(tournament.fp_starting_points || 1000);
      setFpYellowDeduction(tournament.fp_yellow_deduction || 100);
      setFpRedDeduction(tournament.fp_red_deduction || 300);
      setFpNoShowDeduction(tournament.fp_no_show_deduction || 500); 
      setFpYellowFine(tournament.fine_yellow_amount || 0);
      setFpRedFine(tournament.fine_red_amount || 0);
      setScheduleTimeSlots(Array.isArray(tournament.schedule_time_slots) && tournament.schedule_time_slots.length > 0 ? tournament.schedule_time_slots : ['08:00', '10:00', '12:00']);
      setScheduleDates(Array.isArray(tournament.schedule_dates) && tournament.schedule_dates.length > 0 ? tournament.schedule_dates : ['']);
      setAvailableVenues(Array.isArray(tournament.available_venues) && tournament.available_venues.length > 0 ? tournament.available_venues : ['Cancha 1', 'Cancha 2']);
      setFixtureVisibleToDelegates(Boolean(tournament.fixture_visible_to_delegates));
      setFixtureVisibleToPublic(Boolean(tournament.fixture_visible_to_public));
      
      // CORRECCIÓN: Ajustado a fp_custom_rule en singular
      setCustomFpRules(tournament.fp_custom_rule || []); 

      const { data: cats } = await supabase.from('categories').select('*, sports(*)').eq('tournament_id', id);
      
      const loadedCategories = [];
      const loadedTeamsMap: Record<string, string[]> = {};

      if (cats && cats.length > 0) {
        setSelectedSport(cats[0].sports);
        for (const cat of cats) {
          loadedCategories.push({
            id: cat.id,
            name: cat.name,
            gender: cat.gender,
            duration: cat.match_duration || 'Sin definir',
            isExisting: true
          });
          const { data: teamsInCat } = await supabase.from('teams').select('school_id').eq('category_id', cat.id);
          loadedTeamsMap[cat.id] = teamsInCat ? teamsInCat.map(t => t.school_id) : [];
        }
      }
      setCategoriesToCreate(loadedCategories);
      setTeamsMap(loadedTeamsMap);
      setDeletedCategoryIds([]);
      setSelectedCatForTeams(loadedCategories[0]?.id || null);
      setWizardStep(3);
      toast.dismiss(toastId);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar la información del evento.', { id: toastId });
    }
  }

  const getSportIcon = (sportName: string, size: number = 32) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol')) return <FaFutbol size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall size={size} />;
    if (name.includes('beisbol') || name.includes('béisbol') || name.includes('softball')) return <FaBaseballBall size={size} />;
    if (name.includes('tenis de mesa')) return <FaTableTennis size={size} />;
    if (name.includes('tenis') || name.includes('padel')) return <GiTennisRacket size={size} />;
    if (name.includes('golf')) return <FaGolfBall size={size} />;
    return <Trophy size={size} />;
  };

  const addCustomFpRule = () => {
    setCustomFpRules([...customFpRules, { id: `rule_${Date.now()}`, name: '', points: '' }]);
  };
  const updateCustomRule = (id: string, field: 'name' | 'points', value: any) => {
    setCustomFpRules(customFpRules.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const removeCustomRule = (id: string) => {
    setCustomFpRules(customFpRules.filter(r => r.id !== id));
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim() || !clientInfo) return;

    setLoading(true);
    const result = isDemo ? createDemoSchools([newSchoolName]) : await createSchools(slug, [newSchoolName]);
    
    if (!result.success) {
      toast.error(result.error || 'No se pudo crear la institución');
    } else {
      toast.success('Institución añadida al Directorio');
      setNewSchoolName('');
      fetchSchools(clientInfo.id);
    }
    setLoading(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, schoolId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return toast.error('El archivo debe ser una imagen');

    setUploadingForSchool(schoolId);
    const toastId = toast.loading('Subiendo escudo institucional...');

    try {
      if (isDemo) {
        toast.success('Imagen conservada únicamente durante esta demostración', { id: toastId });
        return;
      }
      const result = await uploadSchoolLogo(slug, schoolId, file);
      if (!result.success) throw new Error(result.error);

      toast.success('Escudo actualizado', { id: toastId });
      fetchSchools(clientInfo!.id); 
    } catch (error: any) {
      toast.error('Fallo en la carga del archivo', { id: toastId });
    } finally {
      setUploadingForSchool(null);
    }
  };

  const handleUpdateSchoolName = async (schoolId: string) => {
    if (!editSchoolName.trim() || !clientInfo) return;
    setLoading(true);
    const result = isDemo ? updateDemoSchool(schoolId, editSchoolName) : await updateSchoolName(slug, schoolId, editSchoolName);
    
    if (!result.success) toast.error(result.error || 'No se pudo actualizar');
    else {
      toast.success('Nombre actualizado');
      setEditingSchoolId(null);
      fetchSchools(clientInfo.id);
    }
    setLoading(false);
  };

  const executeDeleteSchool = async () => {
    if (!showDeleteConfirm.id || !clientInfo) return;
    setLoading(true);
    const toastId = toast.loading('Eliminando institución...');
    const result = isDemo ? deleteDemoSchool(showDeleteConfirm.id) : await deleteSchool(slug, showDeleteConfirm.id);
    
    if (!result.success) {
      toast.error(result.error || 'No se pudo eliminar', { id: toastId });
    } else {
      toast.success('Institución eliminada', { id: toastId });
      setShowDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchSchools(clientInfo.id);
    }
    setLoading(false);
  };

  const handleGridPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const rows = pasteData.split(/\r?\n/).map(r => r.trim()).filter(r => r);
    if (rows.length === 0) return;

    let newData = [...gridData];
    while (rowIndex + rows.length > newData.length) newData.push('');
    for (let i = 0; i < rows.length; i++) newData[rowIndex + i] = rows[i];
    
    setGridData(newData);
    toast.success(`${rows.length} registros pegados`);
  };

  const processGridData = async () => {
    if (!clientInfo) return toast.error('Error de sesión.');
    
    const validEntries = gridData.map(n => n.trim()).filter(n => n.length > 0);
    if (validEntries.length === 0) return toast.error('La cuadrícula está vacía.');

    setLoading(true);
    const toastId = toast.loading('Procesando lista...');

    try {
      const result = isDemo ? createDemoSchools(validEntries) : await createSchools(slug, validEntries);
      if (!result.success) throw new Error(result.error);

      toast.success(`¡Éxito! ${result.data.inserted} instituciones creadas.`, { id: toastId });
      setShowGridModal(false);
      setGridData(Array(10).fill(''));
      fetchSchools(clientInfo.id);

    } catch (error: any) {
      toast.error(error.message || 'Error al procesar.', { id: toastId });
    }
    setLoading(false);
  };

  const handleAddCategory = () => {
    if (!tempCatName) return toast.error('Asigna un nombre a la categoría');
    const newCatId = `temp_${Date.now()}`; 
    setCategoriesToCreate([...categoriesToCreate, {
      id: newCatId, name: tempCatName.toUpperCase(), gender: tempGender, duration: tempDuration || 'Sin definir', isExisting: false
    }]);
    setTeamsMap(prev => ({ ...prev, [newCatId]: [] }));
    setTempCatName(''); 
    setTempDuration('');
  };

  const updateCategoryDraft = (id: string, field: 'name' | 'gender' | 'duration', value: string) => {
    setCategoriesToCreate((current) => current.map((category) => (
      category.id === id
        ? { ...category, [field]: field === 'name' ? value.toUpperCase() : value }
        : category
    )));
  };

  const removeCategory = async (id: string, isExisting?: boolean) => {
    if (isExisting && !await confirmDialog({
      title: 'Eliminar categoría',
      description: 'La categoría se eliminará del torneo únicamente si todavía no tiene un fixture creado.',
      confirmLabel: 'Eliminar',
    })) return;
    if (isExisting) setDeletedCategoryIds((current) => Array.from(new Set([...current, id])));
    setCategoriesToCreate(categoriesToCreate.filter(c => c.id !== id));
    const newTeamsMap = { ...teamsMap };
    delete newTeamsMap[id];
    setTeamsMap(newTeamsMap);
    if (selectedCatForTeams === id) setSelectedCatForTeams(null);
  };

  const toggleSchoolForCategory = (catId: string, schoolId: string) => {
    setTeamsMap(prev => {
      const currentSchools = prev[catId] || [];
      if (currentSchools.includes(schoolId)) {
        return { ...prev, [catId]: currentSchools.filter(id => id !== schoolId) };
      } else {
        return { ...prev, [catId]: [...currentSchools, schoolId] };
      }
    });
  };

  const executeWizardSubmit = async () => {
    if (!clientInfo?.id || !newTournamentName.trim() || !selectedSport) return;

    setIsSubmitting(true);
    const toastId = toast.loading(editingTournamentId ? 'Actualizando matriz...' : 'Desplegando torneo...');
    
    try {
      let finalLogoUrl = existingLogoUrl;
      if (logoFile && !isDemo) {
        const uploadResult = await uploadTournamentLogo(slug, logoFile);
        if (!uploadResult.success) throw new Error(uploadResult.error);
        finalLogoUrl = uploadResult.publicUrl;
      }

      const cleanCustomRules = customFpRules.filter(r => r.name.trim() !== '' && r.points !== '');

      const tournamentPayload = {
        name: newTournamentName.trim().toUpperCase(),
        logo_url: finalLogoUrl,
        tournament_format: tournamentFormat,
        fair_play_enabled: fpEnabled,
        fp_starting_points: Number(fpStartingPoints) || 0,
        fp_yellow_deduction: Number(fpYellowDeduction) || 0,
        fp_red_deduction: Number(fpRedDeduction) || 0,
        fp_no_show_deduction: Number(fpNoShowDeduction) || 0, 
        fp_custom_rule: cleanCustomRules, // CORRECCIÓN: Ajustado a singular para que coincida con DB
        fine_yellow_amount: Number(fpYellowFine) || 0,
        fine_red_amount: Number(fpRedFine) || 0,
        schedule_time_slots: Array.from(new Set(scheduleTimeSlots.filter(Boolean))).sort(),
        schedule_dates: scheduleDates.filter(Boolean).sort(),
        available_venues: availableVenues,
        fixture_visible_to_delegates: fixtureVisibleToDelegates,
        fixture_visible_to_public: fixtureVisibleToPublic,
      };

      const wizardInput = {
        editingTournamentId,
        tournament: tournamentPayload,
        sportId: selectedSport.id,
        categories: categoriesToCreate,
        deletedCategoryIds,
        teamsMap,
      };
      const result = isDemo ? saveDemoTournament(wizardInput) : await saveTournamentWizard(slug, wizardInput);
      if (!result.success) throw new Error(result.error);

      toast.success('¡Torneo estructurado correctamente!', { id: toastId });
      router.push(`/${slug}/admin`);

    } catch (error: any) {
      console.error(error);
      // NUEVO: Mensaje de error más descriptivo
      toast.error(`Error de Base de Datos: ${error.message || 'Ocurrió un error al guardar'}`, { id: toastId });
    }
    setIsSubmitting(false);
  };

  const isFootball = selectedSport?.name.includes('FUTBOL') || selectedSport?.name.includes('FÚTBOL');

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      
      {/* MODALES DEL PASO 4 */}
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
              <button onClick={() => setShowGridModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"><X size={20} /></button>
            </div>
            <div className="px-8 overflow-y-auto flex-1 scrollbar-hide py-4 border-y border-slate-100 bg-slate-50">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="grid grid-cols-[60px_1fr] bg-slate-100 border-b border-slate-200">
                  <div className="py-3 text-center text-[10px] font-black text-slate-400 uppercase border-r border-slate-200">Fila</div>
                  <div className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre de la Institución</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {gridData.map((rowValue, idx) => (
                    <div key={idx} className="grid grid-cols-[60px_1fr] group">
                      <div className="py-3 text-center text-xs font-bold text-slate-300 border-r border-slate-100 bg-slate-50 flex items-center justify-center">{idx + 1}</div>
                      <input 
                        type="text" value={rowValue}
                        onChange={(e) => { const newData = [...gridData]; newData[idx] = e.target.value; setGridData(newData); }}
                        onPaste={(e) => handleGridPaste(e, idx)}
                        placeholder={idx === 0 ? "Ej: Copia y pega tu columna aquí..." : ""}
                        className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:bg-blue-50 focus:text-blue-700 uppercase transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setGridData([...gridData, ...Array(10).fill('')])} className="w-full mt-4 py-3 bg-slate-200/50 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 border border-dashed border-slate-300">
                 <Plus size={14}/> Añadir 10 filas más
              </button>
            </div>
            <div className="p-8 pt-4 flex flex-wrap sm:flex-nowrap w-full gap-4 shrink-0 bg-white">
              <button onClick={() => setGridData(Array(10).fill(''))} className="w-full sm:w-auto py-4 px-6 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center gap-2"><Eraser size={16}/> Limpiar</button>
              <button onClick={processGridData} disabled={loading} className="w-full flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50">
                <Database size={16} /> {loading ? 'Procesando...' : 'Sincronizar Lista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner"><AlertTriangle size={40} /></div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Institución?</h3>
            <p className="text-slate-500 text-sm font-bold mb-2 break-words">"{showDeleteConfirm.name}"</p>
            <div className="flex w-full gap-4 mt-8">
              <button onClick={() => setShowDeleteConfirm({ isOpen: false, id: null, name: '' })} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 shadow-sm" disabled={loading}>Cancelar</button>
              <button onClick={executeDeleteSchool} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 shadow-lg" disabled={loading}>{loading ? '...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-8 flex flex-col">
        <div className="bg-white border border-slate-200 rounded-[2.5rem] w-full shadow-lg relative overflow-hidden flex flex-col flex-1">
          <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
          
          <div className="px-8 pt-8 pb-6 flex justify-between items-start shrink-0 border-b border-slate-100">
            <div>
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">
                {editingTournamentId ? 'Modificar Competición' : 'Arquitectura de Torneo'}
              </h3>
              <div className="flex items-center gap-2 mt-3">
                 {[1, 2, 3, 4, 5].map(step => (
                   <div key={step} className={`h-2 rounded-full flex-1 transition-all ${wizardStep >= step ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
                 ))}
              </div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">
                Paso {wizardStep} de 5: 
                {wizardStep === 1 && ' Disciplina Deportiva'}
                {wizardStep === 2 && ' Formato de Competición'}
                {wizardStep === 3 && ' Identidad y Reglas'}
                {wizardStep === 4 && ' Directorio de Delegaciones'}
                {wizardStep === 5 && ' Ramas y Categorías'}
              </p>
            </div>
            <button onClick={() => router.push(`/${slug}/admin`)} title="Volver al panel principal" aria-label="Volver al panel principal" className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="p-8 overflow-y-auto flex-1 scrollbar-hide bg-slate-50/50">
            
            {/* PASO 1: DEPORTE */}
            {wizardStep === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4">
                <h4 className="text-center text-xl font-black text-slate-800 uppercase tracking-tighter mb-8">¿Qué disciplina vas a configurar?</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {availableSports.map(sport => (
                    <button 
                      key={sport.id}
                      onClick={() => { setSelectedSport(sport); setWizardStep(2); }}
                      className={`flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all group ${selectedSport?.id === sport.id ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:shadow-lg'}`}
                    >
                      <div className={`mb-4 transition-transform group-hover:scale-110 ${selectedSport?.id === sport.id ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`}>
                        {getSportIcon(sport.name, 48)}
                      </div>
                      <span className="font-black uppercase tracking-widest text-[10px] text-center">{sport.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PASO 2: FORMATO */}
            {wizardStep === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4">
                <h4 className="text-center text-xl font-black text-slate-800 uppercase tracking-tighter mb-8">Selecciona el Formato del Torneo</h4>
                
                {isFootball ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <button onClick={() => setTournamentFormat('THREE_STAGE_35')} className={`text-left p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${tournamentFormat === 'THREE_STAGE_35' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg'}`}>
                      <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center"><Crown size={24}/></div>
                      <div><h5 className="font-black uppercase text-sm text-slate-900 mb-1">Máster 35+ · Tres fases</h5><p className="text-xs text-slate-500 font-medium">8 equipos: liga, dos grupos de cuatro a ida y vuelta, Final Oro y Final Plata.</p></div>
                    </button>
                    <button onClick={() => setTournamentFormat('LEAGUE')} className={`text-left p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${tournamentFormat === 'LEAGUE' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg'}`}>
                      <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center"><ListOrdered size={24}/></div>
                      <div><h5 className="font-black uppercase text-sm text-slate-900 mb-1">Liga Clásica</h5><p className="text-xs text-slate-500 font-medium">Todos contra Todos. El que suma más puntos al final es campeón directo.</p></div>
                    </button>
                    <button onClick={() => setTournamentFormat('CUADRANGULAR')} className={`text-left p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${tournamentFormat === 'CUADRANGULAR' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg'}`}>
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center"><Grid2x2 size={24}/></div>
                      <div><h5 className="font-black uppercase text-sm text-slate-900 mb-1">Cuadrangulares</h5><p className="text-xs text-slate-500 font-medium">Fase regular + Dos grupos de 4 equipos (A y B). Los líderes juegan la final.</p></div>
                    </button>
                    <button onClick={() => setTournamentFormat('KNOCKOUT')} className={`text-left p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${tournamentFormat === 'KNOCKOUT' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg'}`}>
                      <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center"><Swords size={24}/></div>
                      <div><h5 className="font-black uppercase text-sm text-slate-900 mb-1">Eliminación Directa</h5><p className="text-xs text-slate-500 font-medium">Puro Play-off (Octavos, Cuartos). El perdedor queda eliminado.</p></div>
                    </button>
                    <button onClick={() => setTournamentFormat('MIXED')} className={`text-left p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${tournamentFormat === 'MIXED' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg'}`}>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><GitMerge size={24}/></div>
                      <div><h5 className="font-black uppercase text-sm text-slate-900 mb-1">Formato Mixto</h5><p className="text-xs text-slate-500 font-medium">Múltiples grupos pequeños. Los mejores avanzan a eliminación directa.</p></div>
                    </button>
                    <button onClick={() => setTournamentFormat('LOYOLA')} className={`text-left p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${tournamentFormat === 'LOYOLA' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg'}`}>
                      <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center"><Crown size={24}/></div>
                      <div><h5 className="font-black uppercase text-sm text-slate-900 mb-1">Formato Loyola</h5><p className="text-xs text-slate-500 font-medium">Fase regular + Playoffs. Desempate primario por Fair Play. Empates a penales.</p></div>
                    </button>
                    <button onClick={() => setTournamentFormat('CUSTOM')} className={`text-left p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 ${tournamentFormat === 'CUSTOM' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg'}`}>
                      <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-600 flex items-center justify-center"><Settings size={24}/></div>
                      <div><h5 className="font-black uppercase text-sm text-slate-900 mb-1">Libre (Custom)</h5><p className="text-xs text-slate-500 font-medium">Constructor manual. Activa o desactiva grupos y llaves a medida.</p></div>
                    </button>
                  </div>
                ) : (
                  <div className="text-center max-w-lg mx-auto p-8 border-2 border-dashed border-slate-300 rounded-3xl bg-white">
                    <Trophy size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium text-sm">El formato para <span className="font-bold text-slate-800">{selectedSport?.name}</span> se adaptará automáticamente según el sistema internacional.</p>
                  </div>
                )}
              </div>
            )}

            {/* PASO 3: IDENTIDAD Y REGLAS */}
            {wizardStep === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 max-w-4xl mx-auto">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <label className="text-xs text-slate-500 uppercase font-black tracking-widest mb-3 block flex items-center gap-2"><Trophy size={16} className="text-blue-600"/> Nombre Oficial del Evento</label>
                  <input type="text" autoFocus required placeholder={`EJ: COPA ${clientInfo?.name?.split(' ')[0] || 'TORNEO'} 2026`} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-lg font-black text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all uppercase" value={newTournamentName} onChange={(e) => setNewTournamentName(e.target.value)} />
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-blue-800"><Clock size={18} /> Horarios disponibles</label>
                      <p className="mt-1 max-w-2xl text-[10px] font-bold uppercase leading-relaxed tracking-wider text-slate-500">Estas franjas se usarán para repartir los partidos de manera equilibrada. Después podrás reorganizar el fixture sin borrar resultados.</p>
                    </div>
                    <button type="button" onClick={() => setScheduleTimeSlots((current) => [...current, ''])} className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-blue-700"><Plus size={14} /> Agregar horario</button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {scheduleTimeSlots.map((time, index) => (
                      <div key={index} className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white p-2">
                        <input type="time" value={time} onChange={(event) => setScheduleTimeSlots((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-black text-slate-800 outline-none" />
                        <button type="button" onClick={() => setScheduleTimeSlots((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={`Eliminar horario ${index + 1}`}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  {scheduleTimeSlots.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-blue-200 bg-white p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Agrega al menos una franja horaria</p>}
                  <div className="mt-6 border-t border-blue-100 pt-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-blue-800"><CalendarDays size={18} /> Primer sábado del torneo</label>
                        <p className="mt-1 text-[10px] font-bold uppercase leading-relaxed tracking-wider text-slate-500">Las jornadas siguientes se calcularán automáticamente cada siete días.</p>
                      </div>
                    </div>
                    <div className="mt-5 max-w-sm rounded-xl border border-blue-100 bg-white p-2">
                      <input type="date" value={scheduleDates[0] || ''} onChange={(event) => setScheduleDates([event.target.value])} className="w-full bg-transparent px-3 py-2 text-sm font-black text-slate-800 outline-none" />
                    </div>
                    {!scheduleDates[0] && <p className="mt-4 rounded-xl border border-dashed border-blue-200 bg-white p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Selecciona el primer sábado de competencia</p>}
                  </div>
                  <div className="mt-6 grid gap-4 border-t border-blue-100 pt-6 md:grid-cols-3">
                    <div className="rounded-2xl border border-blue-100 bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-blue-800">Canchas disponibles</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Solo se asignarán las canchas seleccionadas.</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">{['Cancha 1', 'Cancha 2'].map((venue) => <label key={venue} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest ${availableVenues.includes(venue) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}><input type="checkbox" checked={availableVenues.includes(venue)} onChange={(event) => setAvailableVenues((current) => event.target.checked ? [...current, venue] : current.filter((item) => item !== venue))} className="h-4 w-4" />{venue}</label>)}</div>
                    </div>
                    <div className="rounded-2xl border border-indigo-100 bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-indigo-800">Fixture para delegados</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Puedes crearlo primero y publicarlo cuando esté confirmado.</p>
                      <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl bg-indigo-50 px-4 py-3"><span className="text-[10px] font-black uppercase tracking-widest text-indigo-700">{fixtureVisibleToDelegates ? 'Visible' : 'Oculto'}</span><input type="checkbox" checked={fixtureVisibleToDelegates} onChange={(event) => setFixtureVisibleToDelegates(event.target.checked)} className="h-5 w-5" /></label>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-800">Publicación pública</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Permite consultar programación, resultados y estadísticas públicamente.</p>
                      <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl bg-emerald-50 px-4 py-3"><span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{fixtureVisibleToPublic ? 'Publicado' : 'Privado'}</span><input type="checkbox" checked={fixtureVisibleToPublic} onChange={(event) => setFixtureVisibleToPublic(event.target.checked)} className="h-5 w-5" /></label>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <label className="text-xs text-slate-500 uppercase font-black tracking-widest mb-3 block flex items-center gap-2"><ImageIcon size={16} className="text-blue-600"/> Escudo o Logo (Opcional)</label>
                  <div className="relative">
                    <input type="file" accept="image/png, image/jpeg, image/webp" onChange={(e) => { const file = e.target.files?.[0] || null; if (file && file.size > 5 * 1024 * 1024) { e.target.value = ''; toast.error('El logo debe pesar máximo 5 MB.'); return; } setLogoFile(file); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className={`w-full border-2 border-dashed p-8 rounded-xl font-black uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-3 transition-all ${(logoFile || existingLogoUrl) ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-400 hover:bg-slate-100'}`}>
                      {(logoFile || existingLogoUrl) ? <CheckCircle2 size={32} className="text-emerald-500"/> : <UploadCloud size={32} className="text-slate-400" />}
                      <span className="truncate max-w-full px-4 text-center">{logoFile ? `NUEVO ARCHIVO: ${logoFile.name}` : existingLogoUrl ? 'LOGO ACTUAL GUARDADO (Haz clic para reemplazar)' : 'Arrastra un archivo o haz clic para subir · Máximo 5 MB'}</span>
                    </div>
                  </div>
                </div>

                {(isFootball || tournamentFormat === 'LOYOLA') && (
                  <div className={`bg-white p-6 rounded-2xl border transition-all shadow-sm ${fpEnabled ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col"><label className={`text-sm uppercase font-black tracking-widest flex items-center gap-2 ${fpEnabled ? 'text-red-600' : 'text-slate-800'}`}><Scale size={18} /> Tribunal Disciplinario y Fair Play</label><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestión de puntos, multas y bloqueos de jugadores</span></div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={fpEnabled} onChange={(e) => setFpEnabled(e.target.checked)} />
                        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-red-500 shadow-inner"></div>
                      </label>
                    </div>
                    {fpEnabled && (
                      <div className="mt-6 pt-6 border-t border-slate-100 animate-in fade-in slide-in-from-top-4">
                        
                        <div className="mb-6">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-2"><Trophy size={12}/> Puntos de Inicio (Base)</label>
                          <input type="number" min="0" value={fpStartingPoints} onChange={(e) => setFpStartingPoints(e.target.value ? Number(e.target.value) : '')} className="w-full md:w-1/3 bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-black text-slate-900 outline-none focus:border-red-400" />
                        </div>

                        <h5 className="text-xs font-black text-slate-700 uppercase mb-4 border-b border-slate-100 pb-2">Reglamento de Sanciones (Oficiales)</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-3 bg-amber-400 rounded-sm"></div> Puntos x Amarilla</label>
                            <input type="number" min="0" value={fpYellowDeduction} onChange={(e) => setFpYellowDeduction(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-400" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2"><DollarSign size={12}/> Multa Amarilla ($)</label>
                            <input type="number" min="0" value={fpYellowFine} onChange={(e) => setFpYellowFine(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-amber-400" />
                          </div>
                          <div className="hidden lg:block"></div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-3 bg-red-500 rounded-sm"></div> Puntos x Roja</label>
                            <input type="number" min="0" value={fpRedDeduction} onChange={(e) => setFpRedDeduction(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-red-400" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2"><DollarSign size={12}/> Multa Roja ($)</label>
                            <input type="number" min="0" value={fpRedFine} onChange={(e) => setFpRedFine(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-red-400" />
                          </div>
                          <div className="hidden lg:block"></div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><AlertTriangle size={12}/> W.O. (No Presentarse)</label>
                            <input type="number" min="0" value={fpNoShowDeduction} onChange={(e) => setFpNoShowDeduction(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-slate-400" />
                          </div>
                        </div>

                        {/* Custom Rules */}
                        <h5 className="text-xs font-black text-slate-700 uppercase mb-4 border-b border-slate-100 pb-2 flex justify-between items-center">
                          Sanciones Adicionales (Tribunal)
                          <button type="button" onClick={addCustomFpRule} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[9px] hover:bg-blue-100 transition-colors flex items-center gap-1"><Plus size={10}/> Agregar</button>
                        </h5>
                        
                        <div className="space-y-3">
                          {customFpRules.map((rule) => (
                             <div key={rule.id} className="flex items-center gap-3">
                               <input type="text" placeholder="Nombre de la infracción (Ej. Agresión)" value={rule.name} onChange={(e) => updateCustomRule(rule.id, 'name', e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400" />
                               <input type="number" placeholder="Pts a restar" value={rule.points} onChange={(e) => updateCustomRule(rule.id, 'points', e.target.value ? Number(e.target.value) : '')} className="w-24 md:w-32 bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400" />
                               <button type="button" onClick={() => removeCustomRule(rule.id)} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"><X size={14}/></button>
                             </div>
                          ))}
                          {customFpRules.length === 0 && (
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center py-4 border border-dashed border-slate-200 rounded-xl">No hay sanciones adicionales configuradas</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PASO 4: DIRECTORIO DE DELEGACIONES (EL ANTIGUO PANEL DE COLEGIOS) */}
            {wizardStep === 4 && (
              <div className="animate-in fade-in slide-in-from-right-4 max-w-5xl mx-auto flex flex-col h-auto min-h-[560px] lg:h-[600px]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200 shadow-sm mb-4 shrink-0">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Directorio de Delegaciones</h3>
                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Registra todas las instituciones que participarán</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <button onClick={() => setShowGridModal(true)} className="flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2.5 rounded-xl hover:bg-emerald-200 transition-colors text-[10px] font-black uppercase tracking-widest border border-emerald-200">
                      <TableProperties size={14} /> Carga Masiva
                    </button>
                    <form onSubmit={handleCreateSchool} className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <input type="text" placeholder="Nueva Delegación..." value={newSchoolName} onChange={(e) => setNewSchoolName(e.target.value)} className="bg-slate-50 border border-slate-200 p-2.5 px-4 rounded-xl font-bold text-xs outline-none text-slate-700 uppercase focus:border-blue-400 w-full sm:w-48" />
                      <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-md">Crear</button>
                    </form>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-[2rem] overflow-y-auto flex-1 shadow-sm scrollbar-hide">
                  {loading && availableSchools.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">Cargando directorio...</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {availableSchools.map(school => (
                        <div key={school.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 sm:gap-6 group">
                          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                            <div className="relative w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm group-hover:border-blue-300 transition-colors">
                              {school.logo_url ? <Image src={school.logo_url} alt={`Logo`} layout="fill" objectFit="contain" className="p-1"/> : <School className="text-slate-300" size={20} />}
                              <label className={`absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ${uploadingForSchool === school.id ? 'opacity-100' : ''}`}>
                                {uploadingForSchool === school.id ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div> : <Upload size={14} className="text-blue-600" />}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, school.id)} disabled={uploadingForSchool === school.id}/>
                              </label>
                            </div>
                            <div className="flex-1 flex items-center justify-between min-w-0">
                              {editingSchoolId === school.id ? (
                                <div className="flex items-center gap-2 w-full max-w-sm">
                                  <input type="text" value={editSchoolName} onChange={(e) => setEditSchoolName(e.target.value)} className="w-full bg-white border-2 border-blue-400 p-2 rounded-lg text-xs font-bold text-slate-900 outline-none uppercase" autoFocus/>
                                  <button onClick={() => handleUpdateSchoolName(school.id)} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-500 hover:text-white"><Check size={14} /></button>
                                  <button onClick={() => setEditingSchoolId(null)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 hover:text-slate-700"><X size={14} /></button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between w-full min-w-0 gap-2">
                                  <h4 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-tight break-words min-w-0">{school.name}</h4>
                                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button onClick={() => { setEditSchoolName(school.name); setEditingSchoolId(school.id); }} className="text-slate-400 hover:text-blue-500 p-2 rounded-lg hover:bg-blue-50"><Edit2 size={14} /></button>
                                    <button onClick={() => setShowDeleteConfirm({ isOpen: true, id: school.id, name: school.name })} className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50"><Trash2 size={14} /></button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {availableSchools.length === 0 && !loading && (
                        <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">El directorio está vacío. Agregue instituciones.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PASO 5: CATEGORÍAS Y ASIGNACIÓN DE EQUIPOS */}
            {wizardStep === 5 && (
              <div className="animate-in fade-in slide-in-from-right-4 flex flex-col lg:flex-row gap-4 sm:gap-6 max-w-6xl mx-auto h-auto min-h-[560px] lg:h-[600px]">
                
                {/* PANEL IZQUIERDO: CREAR CATEGORÍAS */}
                <div className="w-full lg:w-1/3 flex flex-col gap-4 bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 shadow-sm lg:h-full overflow-y-auto scrollbar-hide">
                  <h4 className="font-black uppercase text-sm text-blue-800 border-b border-slate-100 pb-3">1. Ramas y Categorías</h4>
                  <div className="flex flex-col gap-3 bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <input type="text" value={tempCatName} onChange={e => setTempCatName(e.target.value)} className="bg-white border border-blue-200 p-3 rounded-xl font-bold text-xs outline-none text-slate-700 uppercase" placeholder="Nombre (Ej: Cat. 2007)"/>
                    <AppSelect
                      value={tempGender}
                      onChange={setTempGender}
                      compact
                      options={[
                        { value: 'MASCULINO', label: 'Masculino' },
                        { value: 'FEMENINO', label: 'Femenino' },
                        { value: 'MIXTO', label: 'Mixto' },
                      ]}
                    />
                    <input type="text" value={tempDuration} onChange={e => setTempDuration(e.target.value)} className="bg-white border border-blue-200 p-3 rounded-xl font-bold text-xs outline-none text-slate-700 uppercase" placeholder="Duración (Ej: 40 min)" />
                    <button onClick={handleAddCategory} className="bg-blue-600 text-white p-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-md">
                      Añadir Categoría
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    {categoriesToCreate.map(cat => (
                      <button key={cat.id} onClick={() => setSelectedCatForTeams(cat.id)} className={`flex items-center justify-between p-3 rounded-xl transition-all text-left border ${selectedCatForTeams === cat.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'}`}>
                        <div className="flex flex-col overflow-hidden">
                           <p className="font-black text-xs uppercase truncate">{cat.name}</p>
                           <p className={`text-[9px] font-bold uppercase tracking-widest truncate ${selectedCatForTeams === cat.id ? 'text-blue-200' : 'text-slate-400'}`}>{cat.gender} • {teamsMap[cat.id]?.length || 0} Equipos</p>
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); removeCategory(cat.id, cat.isExisting); }} className={`p-1.5 rounded-md ${selectedCatForTeams === cat.id ? 'hover:bg-blue-500 text-blue-200' : 'hover:bg-red-100 text-slate-400 hover:text-red-500'}`}><X size={14}/></div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* PANEL DERECHO: ASIGNAR DELEGACIONES A LA CATEGORÍA */}
                <div className="flex-1 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex flex-col h-full overflow-hidden">
                  {!selectedCatForTeams ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50 bg-slate-50/50">
                      <School size={48} className="text-slate-300 mb-4"/>
                      <p className="text-slate-500 font-black uppercase text-sm tracking-widest">Selecciona una categoría</p>
                      <p className="text-slate-400 font-bold text-xs mt-2">Para asignar los equipos que participarán en ella</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-6 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
                        <div className="flex justify-between items-center gap-4">
                          <h4 className="text-slate-800 font-black uppercase tracking-tight text-sm">2. Configuración de Categoría</h4>
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">{teamsMap[selectedCatForTeams]?.length || 0} Seleccionados</span>
                        </div>
                        {(() => {
                          const activeCategory = categoriesToCreate.find((category) => category.id === selectedCatForTeams);
                          if (!activeCategory) return null;
                          return (
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px] gap-3">
                              <input
                                type="text"
                                value={activeCategory.name}
                                onChange={(event) => updateCategoryDraft(activeCategory.id, 'name', event.target.value)}
                                className="bg-white border border-slate-200 p-3 rounded-xl font-black text-xs outline-none text-slate-800 uppercase focus:border-blue-400"
                                placeholder="Nombre de categoría"
                              />
                              <AppSelect
                                value={activeCategory.gender}
                                onChange={(value) => updateCategoryDraft(activeCategory.id, 'gender', value)}
                                compact
                                options={[
                                  { value: 'MASCULINO', label: 'Masculino' },
                                  { value: 'FEMENINO', label: 'Femenino' },
                                  { value: 'MIXTO', label: 'Mixto' },
                                ]}
                              />
                              <input
                                type="text"
                                value={activeCategory.duration}
                                onChange={(event) => updateCategoryDraft(activeCategory.id, 'duration', event.target.value)}
                                className="bg-white border border-slate-200 p-3 rounded-xl font-black text-xs outline-none text-slate-800 uppercase focus:border-blue-400"
                                placeholder="Duración"
                              />
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide bg-slate-50/30">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Delegaciones inscritas en esta categoría</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {availableSchools.map(school => {
                            const isSelected = (teamsMap[selectedCatForTeams] || []).includes(school.id);
                            return (
                              <button key={school.id} onClick={() => toggleSchoolForCategory(selectedCatForTeams, school.id)} className={`flex items-center justify-between p-3 px-4 rounded-xl border transition-all text-left group ${isSelected ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'}`}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1 shrink-0">
                                    {school.logo_url ? <img src={school.logo_url} alt={`Logo de ${school.name}`} className="w-full h-full object-contain" /> : <School size={14} className="text-slate-300" />}
                                  </div>
                                  <span className={`font-black text-xs uppercase truncate pr-2 ${isSelected ? 'text-emerald-800' : 'text-slate-700'}`}>{school.name}</span>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 bg-slate-50 group-hover:border-blue-300'}`}>
                                  {isSelected && <CheckCircle2 size={12} className="text-white"/>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-slate-100 bg-white flex justify-between shrink-0 rounded-b-[2.5rem]">
            {wizardStep > 1 ? (
              <button onClick={() => setWizardStep(wizardStep - 1)} className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors flex items-center gap-2">
                <ChevronLeft size={16}/> Anterior
              </button>
            ) : <div></div>}

            {wizardStep < 5 ? (
              <button 
                onClick={() => {
                  if (wizardStep === 1 && !selectedSport) return toast.error('Selecciona una disciplina deportiva');
                  if (wizardStep === 3 && !newTournamentName.trim()) return toast.error('El nombre del evento es obligatorio');
                  if (wizardStep === 4 && availableSchools.length === 0) return toast.error('Debe registrar al menos una delegación en el directorio');
                  setWizardStep(wizardStep + 1);
                }} 
                className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-colors shadow-lg flex items-center gap-2"
              >
                Continuar <ChevronRight size={16}/>
              </button>
            ) : (
              <button 
                onClick={executeWizardSubmit} 
                disabled={isSubmitting || categoriesToCreate.length === 0}
                className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle2 size={16}/> {isSubmitting ? 'Sincronizando...' : (editingTournamentId ? 'Actualizar Evento' : 'Finalizar y Crear Evento')}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
