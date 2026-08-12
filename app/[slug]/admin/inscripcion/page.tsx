'use client';

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../supabase';
import { UserPlus, Trash2, ArrowLeft, Download, Upload, Users, Edit2, Check, X, RefreshCcw, AlertTriangle, ArrowRight, Trophy, ShieldCheck, FileSpreadsheet, School, Grid, Eraser, Database, Plus, Eye, FileCheck2 } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { addRosterPlayers, deleteRosterPlayer, deleteRosterTeam, getOrCreateRosterTeam, loadRosterPlayerDocuments, openRosterPlayerDocument, reviewRosterPlayerDocument, updateRosterTeamName } from './actions';
import { promptDialog } from '@/app/components/AppDialog';

export default function InscripcionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const urlCategory = searchParams.get('cat');

  // Datos base
  const [schools, setSchools] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  
  // Conteo de jugadores por colegio para la vista de Banners
  const [teamStats, setTeamStats] = useState<Record<string, number>>({});
  
  // Flujo de navegación
  const [selectedTournament, setSelectedTournament] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  
  // Datos específicos del equipo
  const [currentTeam, setCurrentTeam] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [playerDocuments, setPlayerDocuments] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: '', shirt_number: '', birth_year: '', vinculo: '' });
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [editTeamName, setEditTeamName] = useState('');

  const [showDeleteTeamModal, setShowDeleteTeamModal] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{id: string, name: string} | null>(null);

  // Estados para Carga Masiva Pro
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteRows, setPasteRows] = useState(
    Array.from({ length: 10 }, () => ({ name: '', birth_year: '', vinculo: '', shirt_number: '' }))
  );

  // 1. Carga inicial de datos del Tenant (Inquilino)
  useEffect(() => {
    async function loadTenantData() {
      if (!slug) return;
      
      const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
      
      if (client) {
        setClientId(client.id);
        const { data: s } = await supabase.from('schools').select('*').eq('client_id', client.id).order('name');
        const { data: t } = await supabase.from('tournaments').select('id, name, logo_url, created_at').eq('client_id', client.id).order('created_at', { ascending: false });
        const { data: c } = await supabase
          .from('categories')
          .select('*, tournaments!inner(id, name, logo_url, client_id), sports(name)')
          .eq('tournaments.client_id', client.id)
          .order('name');

        if (s) setSchools(s);
        if (t) setTournaments(t);
        if (c) setCategories(c);
      }
    }
    loadTenantData();
  }, [slug]);

  // 2. Revisar URL por si vienen de otra página con una categoría pre-seleccionada
  useEffect(() => {
    if (urlCategory && categories.length > 0) {
      const cat = categories.find(c => c.id === urlCategory);
      if (cat) {
        setSelectedTournament(cat.tournaments?.id || null);
        setSelectedCategory(urlCategory);
        setSelectedSport(cat.sports?.name);
      }
    }
  }, [urlCategory, categories]);

  // 3. Cargar las estadísticas (cantidad de jugadores) cuando se selecciona una categoría
  useEffect(() => {
    if (selectedCategory) {
      fetchTeamStats(selectedCategory);
    }
  }, [selectedCategory]);

  async function fetchTeamStats(categoryId: string) {
    const { data } = await supabase.from('teams').select('school_id, players(id)').eq('category_id', categoryId);
    if (data) {
      const stats: Record<string, number> = {};
      data.forEach((t: any) => {
         stats[t.school_id] = t.players ? t.players.length : 0;
      });
      setTeamStats(stats);
    }
  }

  // 4. Cargar jugadores cuando se entra al Roster de un colegio específico
  useEffect(() => {
    if (selectedSchool && selectedCategory) {
      fetchPlayers();
    } else {
      setCurrentTeam(null);
      setPlayers([]);
    }
  }, [selectedSchool, selectedCategory]);

  async function fetchPlayers() {
    const { data: team } = await supabase.from('teams').select('*').eq('school_id', selectedSchool).eq('category_id', selectedCategory).single();
    if (team) {
      setCurrentTeam(team);
      const { data: p } = await supabase.from('players').select('*').eq('team_id', team.id).order('name');
      setPlayers(p || []);
      const documentsResult = await loadRosterPlayerDocuments(slug, team.id);
      setPlayerDocuments(documentsResult.success ? documentsResult.data : []);
    } else {
      setCurrentTeam(null);
      setPlayers([]);
    }
  }

  const openDocument = async (documentId: string) => {
    const result = await openRosterPlayerDocument(slug, documentId);
    if (!result.success) return toast.error(result.error);
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  const reviewDocument = async (documentId: string, status: 'APPROVED' | 'REJECTED') => {
    const reason = status === 'REJECTED' ? await promptDialog({ title: 'Rechazar documento', description: 'Indica al delegado qué debe corregir.', placeholder: 'Motivo del rechazo', minLength: 3, confirmLabel: 'Rechazar', tone: 'danger' }) : undefined;
    if (status === 'REJECTED' && !reason) return;
    const result = await reviewRosterPlayerDocument(slug, documentId, status, reason || undefined);
    if (!result.success) toast.error(result.error); else { toast.success(status === 'APPROVED' ? 'Documento aprobado' : 'Documento rechazado'); fetchPlayers(); }
  };

  async function getOrCreateTeam() {
    let { data: team } = await supabase.from('teams').select('*').eq('school_id', selectedSchool).eq('category_id', selectedCategory).single();
    
    if (!team) {
      const schoolName = schools.find(s => s.id === selectedSchool)?.name;
      const result = await getOrCreateRosterTeam(slug, selectedCategory!, selectedSchool!, schoolName || '');
      if (!result.success) { toast.error(result.error); return null; }
      team = result.data;
    }
    setCurrentTeam(team);
    return team;
  }

  const handleUpdateTeamName = async () => {
    if (!editTeamName.trim() || !currentTeam) return;
    setLoading(true);
    const result = await updateRosterTeamName(slug, currentTeam.id, editTeamName);
    if (!result.success) {
      toast.error(result.error || 'No se pudo renombrar la delegación');
    } else {
      toast.success('Cambios guardados en el registro');
      setCurrentTeam({ ...currentTeam, name: editTeamName.toUpperCase() });
      setIsEditingTeam(false);
    }
    setLoading(false);
  };

  const executeDeleteTeam = async () => {
    if (!currentTeam) return;
    setLoading(true);
    setShowDeleteTeamModal(false);
    const toastId = toast.loading('Removiendo delegación del sistema...');
    
    const result = await deleteRosterTeam(slug, currentTeam.id);
    
    if (!result.success) {
      toast.error(result.error || 'Error al remover delegación', { id: toastId });
    } else {
      toast.success('Nómina eliminada permanentemente', { id: toastId });
      setSelectedSchool(null);
      setCurrentTeam(null);
      setPlayers([]);
      if (selectedCategory) fetchTeamStats(selectedCategory); 
    }
    setLoading(false);
  };

  const executeDeletePlayer = async () => {
    if (!playerToDelete) return;
    setLoading(true);
    const result = await deleteRosterPlayer(slug, playerToDelete.id);
    if (!result.success) {
      toast.error(result.error || 'Error al procesar la baja');
    } else {
      toast.success('Atleta removido del Roster');
      fetchPlayers();
    }
    setPlayerToDelete(null);
    setLoading(false);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { "NOMBRE COMPLETO": "PEREZ JUAN", "ANO DE NACIMIENTO": 2011, "VINCULO CON EL COLEGIO": "ALUMNO", "NUMERO DE DORSAL": 10 },
      { "NOMBRE COMPLETO": "DOMINGUEZ LUIS", "ANO DE NACIMIENTO": "26-06-2010", "VINCULO CON EL COLEGIO": "PADRE DE FAMILIA", "NUMERO DE DORSAL": 7 }
    ]);
    
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INSCRIPCION");
    XLSX.writeFile(wb, `Plantilla_${slug.toUpperCase()}_Nomina.xlsx`);
    toast.success('Plantilla generada y lista');
  };

  const extractYearFromExcelValue = (value: any): number => {
    if (!value) return 0;
    if (typeof value === 'number' && value > 1900 && value < 2100) return value;
    const strVal = String(value).trim();
    if (/^\d{4}$/.test(strVal)) return parseInt(strVal);
    const yearMatch = strVal.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) return parseInt(yearMatch[1]);
    return 0; 
  };

  /* ---- LOGICA CARGA MASIVA PRO ---- */
  const handlePasteData = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    
    // Separar por filas
    const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
    let newRows = [...pasteRows];
    
    rows.forEach((row, i) => {
      // Separar por tabulaciones (formato de celda de excel)
      const cols = row.split('\t');
      const rowData = {
        name: cols[0]?.trim() || '',
        birth_year: cols[1]?.trim() || '',
        vinculo: cols[2]?.trim() || '',
        shirt_number: cols[3]?.trim() || ''
      };
      
      if (i < newRows.length) {
        newRows[i] = rowData;
      } else {
        newRows.push(rowData);
      }
    });
    
    // Garantizar que visualmente siempre se vean al menos 10 filas
    while (newRows.length < 10) {
      newRows.push({ name: '', birth_year: '', vinculo: '', shirt_number: '' });
    }
    
    setPasteRows(newRows);
  };

  const handleCellChange = (index: number, field: string, value: string) => {
    const newRows = [...pasteRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setPasteRows(newRows);
  };

  const handleSyncPasteData = async () => {
    const validRows = pasteRows.filter(r => r.name.trim() !== '');
    if (validRows.length === 0) return toast.error('La tabla está vacía o no tiene registros válidos.');
    
    setLoading(true);
    const toastId = toast.loading('Sincronizando nómina masiva...');

    try {
      const team = await getOrCreateTeam();
      if (!team) throw new Error("Error de sincronización con la delegación");

      const formattedPlayers = validRows.map(row => ({
        name: String(row.name).toUpperCase().trim(),
        shirtNumber: parseInt(row.shirt_number) || null,
        birthYear: extractYearFromExcelValue(row.birth_year),
        vinculo: String(row.vinculo).toUpperCase().trim()
      }));

      const result = await addRosterPlayers(slug, team.id, formattedPlayers);
      if (!result.success) throw new Error(result.error);
      
      toast.success(`Carga exitosa: ${result.data.inserted} atletas inscritos`, { id: toastId });
      fetchPlayers();
      setShowPasteModal(false);
      setPasteRows(Array.from({ length: 10 }, () => ({ name: '', birth_year: '', vinculo: '', shirt_number: '' })));
    } catch (err: any) {
      console.error(err);
      toast.error('Error al procesar los datos ingresados.', { id: toastId });
    }
    setLoading(false);
  };

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSchool || !selectedCategory) return toast.error('Complete la selección de delegación');
    setLoading(true);
    
    const team = await getOrCreateTeam();
    if (!team) { setLoading(false); return; }

    const yearToSave = extractYearFromExcelValue(newPlayer.birth_year);

    const result = await addRosterPlayers(slug, team.id, [{
      name: newPlayer.name.trim().toUpperCase(),
      shirtNumber: parseInt(newPlayer.shirt_number),
      birthYear: yearToSave,
      vinculo: newPlayer.vinculo.trim().toUpperCase(),
    }]);

    if (result.success) {
      toast.success('Atleta registrado en el HUB');
      setNewPlayer({ name: '', shirt_number: '', birth_year: '', vinculo: '' });
      fetchPlayers();
    } else {
      toast.error(result.error || 'Error al registrar atleta');
    }
    setLoading(false);
  }

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol')) return <FaFutbol className="text-emerald-500" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-500" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-yellow-500" size={size} />;
    if (name.includes('softbol') || name.includes('béisbol')) return <FaBaseballBall className="text-red-500" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  const tournamentCategories = selectedTournament
    ? categories.filter(c => c.tournaments?.id === selectedTournament)
    : [];
  const uniqueSports = Array.from(new Set(tournamentCategories.map(c => c.sports?.name).filter(Boolean)));
  const selectedTournamentData = tournaments.find(t => t.id === selectedTournament);
  const selectedCategorySchools = selectedCategory
    ? schools.filter(school => Object.prototype.hasOwnProperty.call(teamStats, school.id))
    : [];

  const handleBackNavigation = () => {
    if (selectedSchool) {
      setSelectedSchool(null);
      if (selectedCategory) fetchTeamStats(selectedCategory);
    } else if (selectedCategory) {
      setSelectedCategory(null);
      router.replace(`/${slug}/admin/inscripcion`, { scroll: false });
    } else if (selectedSport) {
      setSelectedSport(null);
    } else if (selectedTournament) {
      setSelectedTournament(null);
    } else {
      router.push(`/${slug}/admin`);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      
      {/* MODALES SOFISTICADOS */}
      {showDeleteTeamModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Remover Delegación</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              Esta acción desvinculará a <strong>"{currentTeam?.name}"</strong> y eliminará a todos sus integrantes del sistema. Es irreversible.
            </p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowDeleteTeamModal(false)} disabled={loading} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm">Cancelar</button>
              <button onClick={executeDeleteTeam} disabled={loading} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200">{loading ? 'Procesando...' : 'Confirmar Baja'}</button>
            </div>
          </div>
        </div>
      )}

      {playerToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-6 border border-amber-100 shadow-inner">
              <RefreshCcw size={40} className="opacity-50" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Baja de Atleta</h3>
            <p className="text-slate-800 font-black text-lg mb-2">{playerToDelete.name}</p>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">¿Confirmas la remoción de este deportista del Roster oficial?</p>
            <div className="flex w-full gap-4">
              <button onClick={() => setPlayerToDelete(null)} disabled={loading} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm">Mantener</button>
              <button onClick={executeDeletePlayer} disabled={loading} className="flex-1 py-4 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CARGA MASIVA PRO --- */}
      {showPasteModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* Cabecera Carga Masiva */}
            <div className="flex items-center justify-between p-6 md:p-8 border-b border-slate-100 bg-white">
              <div>
                <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">
                  Carga Masiva <span className="text-emerald-500">Pro</span>
                </h2>
                <p className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  <Grid size={14} className="text-emerald-500" /> Copia y pega directamente desde tu Excel
                </p>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Cuerpo Tabla Paste */}
            <div className="flex-1 overflow-auto p-6 md:p-8 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase font-black tracking-[0.15em]">
                      <th className="p-4 w-16 text-center border-r border-slate-100">Fila</th>
                      <th className="p-4 border-r border-slate-100">Nombre Completo</th>
                      <th className="p-4 border-r border-slate-100">Año Nac.</th>
                      <th className="p-4 border-r border-slate-100">Vínculo</th>
                      <th className="p-4">Dorsal</th>
                    </tr>
                  </thead>
                  {/* Se intercepta el evento onPaste directamente en el cuerpo de la tabla */}
                  <tbody onPaste={handlePasteData}>
                    {pasteRows.map((row, index) => (
                      <tr key={index} className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/20 transition-colors">
                        <td className="p-3 text-center text-xs font-bold text-slate-300 border-r border-slate-100 bg-slate-50/30">
                          {index + 1}
                        </td>
                        <td className="p-0 border-r border-slate-100 relative">
                          <input 
                            type="text" 
                            value={row.name} 
                            onChange={(e) => handleCellChange(index, 'name', e.target.value)} 
                            placeholder={index === 0 ? "EJ: COPIA Y PEGA TUS COLUMNAS AQUÍ..." : ""} 
                            className="w-full p-4 text-xs font-bold text-slate-700 outline-none focus:bg-emerald-50 focus:text-emerald-900 transition-colors bg-transparent placeholder:text-slate-300 placeholder:font-medium" 
                          />
                        </td>
                        <td className="p-0 border-r border-slate-100">
                          <input 
                            type="text" 
                            value={row.birth_year} 
                            onChange={(e) => handleCellChange(index, 'birth_year', e.target.value)} 
                            className="w-full p-4 text-xs font-bold text-slate-700 outline-none focus:bg-emerald-50 transition-colors bg-transparent" 
                          />
                        </td>
                        <td className="p-0 border-r border-slate-100">
                          <input 
                            type="text" 
                            value={row.vinculo} 
                            onChange={(e) => handleCellChange(index, 'vinculo', e.target.value)} 
                            className="w-full p-4 text-xs font-bold text-slate-700 outline-none focus:bg-emerald-50 transition-colors bg-transparent" 
                          />
                        </td>
                        <td className="p-0">
                          <input 
                            type="text" 
                            value={row.shirt_number} 
                            onChange={(e) => handleCellChange(index, 'shirt_number', e.target.value)} 
                            className="w-full p-4 text-xs font-bold text-slate-700 outline-none focus:bg-emerald-50 transition-colors bg-transparent" 
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <button 
                onClick={() => setPasteRows([...pasteRows, ...Array.from({ length: 10 }, () => ({ name: '', birth_year: '', vinculo: '', shirt_number: '' }))])} 
                className="w-full mt-6 p-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-white hover:border-slate-300 hover:text-slate-600 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Añadir 10 filas más
              </button>
            </div>

            {/* Footer Carga Masiva */}
            <div className="p-6 md:p-8 border-t border-slate-100 bg-white flex flex-col sm:flex-row justify-between gap-4">
              <button 
                onClick={() => setPasteRows(Array.from({ length: 10 }, () => ({ name: '', birth_year: '', vinculo: '', shirt_number: '' })))} 
                className="px-8 py-4 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 hover:text-slate-700 transition-colors flex items-center justify-center gap-2"
              >
                <Eraser size={16} /> Limpiar Todo
              </button>
              <button 
                onClick={handleSyncPasteData} 
                disabled={loading} 
                className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-50"
              >
                <Database size={16} /> {loading ? 'Sincronizando...' : 'Sincronizar Lista con el HUB'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 relative">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 sm:mb-12 gap-5 sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Gestión de <span className="text-blue-600">Rosters</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Nóminas oficiales</p>
          </div>
          
          <button onClick={handleBackNavigation} className="w-full sm:w-fit p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> 
            {selectedSchool ? 'Volver a Delegaciones' : selectedCategory ? 'Volver a Categorías' : selectedSport ? 'Volver a Deportes' : selectedTournament ? 'Volver a Torneos' : 'Volver al inicio'}
          </button>
        </div>

        {/* VISTA 1: TORNEO */}
        {!selectedTournament && !selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {tournaments.map(tournament => (
                 <button
                   key={tournament.id}
                   onClick={() => setSelectedTournament(tournament.id)}
                   className="group flex flex-col p-5 sm:p-8 bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden h-full"
                 >
                   <div className="mb-6 w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
                     {tournament.logo_url ? <img src={tournament.logo_url} className="w-full h-full object-contain p-2" /> : <Trophy className="text-blue-500" size={34} />}
                   </div>
                   <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2 break-words">{tournament.name}</h3>
                   <div className="mt-auto flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors w-full justify-between pt-4">
                     Ver Deportes <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 2: DEPORTE */}
        {selectedTournament && !selectedCategory && !selectedSport && (
           <div className="space-y-6 animate-in fade-in">
             <div className="flex items-center gap-3 mb-2">
               <div className="w-10 h-1 bg-blue-600 rounded-full"></div>
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">{selectedTournamentData?.name}</h2>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-5 sm:p-8 bg-white border border-slate-200 rounded-[2rem] sm:rounded-[2.5rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden h-full"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2 break-words">{sport as string}</h3>
                   <div className="mt-auto flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors w-full justify-between pt-4">
                     Ver Categorías <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: CATEGORÍA */}
        {selectedTournament && !selectedCategory && selectedSport && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {tournamentCategories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => {
                     setSelectedCategory(c.id);
                     router.replace(`/${slug}/admin/inscripcion?cat=${c.id}`, { scroll: false });
                   }}
                   className="group flex flex-col p-5 sm:p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2 break-words">{c.name}</h3>
                   <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 w-full justify-between">
                     Seleccionar Delegaciones <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 4: GRID DE DELEGACIONES */}
        {selectedCategory && !selectedSchool && (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8">
             <div className="flex items-center gap-3 mb-8">
               <div className="w-10 h-1 bg-blue-600 rounded-full"></div>
               <h2 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-widest">Delegaciones Inscritas</h2>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
               {selectedCategorySchools.map(school => {
                 const playerCount = teamStats[school.id] || 0;
                 const hasPlayers = playerCount > 0;

                 return (
                   <button 
                     key={school.id}
                     onClick={() => setSelectedSchool(school.id)}
                     className="group bg-white border border-slate-200 rounded-[2rem] p-5 sm:p-6 hover:border-blue-400 hover:shadow-xl transition-all flex flex-col items-center text-center relative overflow-hidden shadow-sm"
                   >
                     <div className="w-24 h-24 bg-slate-50 border border-slate-100 rounded-3xl p-3 mb-4 flex items-center justify-center overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
                       {school.logo_url ? <img src={school.logo_url} className="w-full h-full object-contain" /> : <School className="text-slate-300 w-10 h-10"/>}
                     </div>
                     <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tighter mb-4 leading-tight w-full break-words px-2">{school.name}</h3>
                     
                     <div className={`mt-auto px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest w-full border ${hasPlayers ? 'bg-emerald-50 text-emerald-600 border-emerald-200 group-hover:bg-emerald-500 group-hover:text-white transition-colors' : 'bg-slate-50 text-slate-500 border-slate-200 group-hover:bg-slate-800 group-hover:text-white transition-colors'}`}>
                       {hasPlayers ? `${playerCount} Inscritos` : '0 Registros'}
                     </div>
                   </button>
                 )
               })}
               {selectedCategorySchools.length === 0 && (
                 <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-300 rounded-[2rem] bg-white">
                   <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Este torneo no tiene delegaciones en esta categoría</p>
                 </div>
               )}
             </div>
           </div>
        )}

        {/* VISTA 5: CONFIGURACIÓN DEL ROSTER */}
        {selectedCategory && selectedSchool && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
              
              <div className="space-y-6">
                
                {/* 🚨 NUEVO DISEÑO: PREVISUALIZACIÓN EXCEL 🚨 */}
                <div className="bg-white border border-emerald-200 p-5 sm:p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm relative overflow-hidden group hover:border-emerald-400 transition-colors">
                  <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                  
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><FileSpreadsheet size={24}/></div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Carga Masiva</h3>
                      <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mt-1">Sincronización Directa</p>
                    </div>
                  </div>

                  {/* MINI-TABLA VISUAL DE REFERENCIA */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-[8px] sm:text-[9px] font-mono shadow-inner">
                    <div className="grid grid-cols-4 bg-emerald-50 text-emerald-800 font-bold border-b border-slate-200">
                      <div className="p-2 border-r border-slate-200 truncate" title="APELLIDO Y NOMBRE">NOMBRE COMP.</div>
                      <div className="p-2 border-r border-slate-200 truncate" title="AÑO NACIMIENTO">AÑO NAC.</div>
                      <div className="p-2 border-r border-slate-200 truncate" title="VINCULO CON COLEGIO">VÍNCULO</div>
                      <div className="p-2 text-center" title="DORSAL">#</div>
                    </div>
                    <div className="grid grid-cols-4 bg-white text-slate-600 border-b border-slate-100">
                      <div className="p-2 border-r border-slate-100 truncate">PEREZ JUAN</div>
                      <div className="p-2 border-r border-slate-100">2011</div>
                      <div className="p-2 border-r border-slate-100 truncate">ALUMNO</div>
                      <div className="p-2 text-center text-blue-600 font-bold">10</div>
                    </div>
                    <div className="grid grid-cols-4 bg-slate-50 text-slate-400">
                      <div className="p-2 border-r border-slate-100 truncate">...</div>
                      <div className="p-2 border-r border-slate-100">...</div>
                      <div className="p-2 border-r border-slate-100 truncate">...</div>
                      <div className="p-2 text-center">...</div>
                    </div>
                  </div>

                  <div className="relative z-10 space-y-3">
                    <button onClick={downloadTemplate} className="w-full flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 p-3.5 rounded-xl hover:bg-slate-100 transition-all text-[10px] font-black uppercase tracking-widest">
                      <Download size={14}/> Descargar Plantilla
                    </button>
                    {/* BOTON CARGA MASIVA PRO QUE ABRE EL NUEVO MODAL */}
                    <button onClick={() => setShowPasteModal(true)} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white p-3.5 rounded-xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-200 text-[10px] font-black uppercase tracking-widest">
                      <Grid size={14}/> Carga Masiva Pro
                    </button>
                  </div>
                </div>

                {/* ALTA MANUAL */}
                <div className="bg-white border border-slate-200 p-5 sm:p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm">
                  <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2"><UserPlus size={16} className="text-blue-600"/> Alta Manual de Atleta</h3>
                  <form onSubmit={handleAddPlayer} className="space-y-4">
                    <input type="text" placeholder="APELLIDO Y NOMBRE" required className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white uppercase transition-colors" value={newPlayer.name} onChange={e => setNewPlayer({...newPlayer, name: e.target.value})} />
                    <input type="text" placeholder="VÍNCULO (EJ. ALUMNO, PADRE)" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white uppercase transition-colors" value={newPlayer.vinculo} onChange={e => setNewPlayer({...newPlayer, vinculo: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                      <input type="number" placeholder="DORSAL #" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white transition-colors" value={newPlayer.shirt_number} onChange={e => setNewPlayer({...newPlayer, shirt_number: e.target.value})} />
                      <input type="text" placeholder="AÑO NAC." className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white transition-colors" value={newPlayer.birth_year} onChange={e => setNewPlayer({...newPlayer, birth_year: e.target.value})} />
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black p-4 rounded-xl hover:bg-blue-600 transition-all uppercase text-[10px] tracking-widest mt-2 shadow-md">
                      {loading ? 'Sincronizando...' : 'Registrar en Roster'}
                    </button>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="bg-white border border-slate-200 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-sm min-h-[520px] md:min-h-[600px] flex flex-col">
                  {currentTeam && (
                    <div className="bg-slate-50 border-b border-slate-100 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {isEditingTeam ? (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                          <input type="text" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} className="flex-1 bg-white border border-blue-400 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none uppercase shadow-sm min-w-0" autoFocus />
                          <button onClick={handleUpdateTeamName} disabled={loading} className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-500 hover:text-white transition-colors"><Check size={18} /></button>
                          <button onClick={() => setIsEditingTeam(false)} className="p-3 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-200 hover:text-slate-700 transition-colors"><X size={18} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 p-2 flex items-center justify-center shrink-0">
                            {schools.find(s => s.id === selectedSchool)?.logo_url 
                              ? <img src={schools.find(s => s.id === selectedSchool)?.logo_url} className="w-full h-full object-contain" /> 
                              : getSportIcon(selectedSport || '')}
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 break-words">
                              {currentTeam.name}
                              <button onClick={() => { setEditTeamName(currentTeam.name); setIsEditingTeam(true); }} className="text-slate-400 hover:text-blue-600 transition-colors p-1 rounded-lg">
                                <Edit2 size={14} />
                              </button>
                            </h2>
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{players.length} Atletas Registrados</p>
                          </div>
                        </div>
                      )}
                      <button onClick={() => setShowDeleteTeamModal(true)} disabled={loading} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all text-[10px] font-black uppercase tracking-widest shrink-0 shadow-sm">
                        Remover Delegación
                      </button>
                    </div>
                  )}

                  <div className="overflow-x-auto flex-1 bg-white">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">
                          <th className="p-6 w-20 text-center">Dorsal</th>
                          <th className="p-6">Nombre del Atleta</th>
                          <th className="p-6">Vínculo</th>
                          <th className="p-6 text-center">Año Nac.</th>
                          <th className="p-6 text-center">Identidad 35+</th>
                          <th className="p-6 text-right w-20">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {players.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="p-6 text-center font-black text-blue-600 text-lg">{p.shirt_number || '-'}</td>
                            <td className="p-6 font-black text-slate-800 uppercase tracking-tight whitespace-normal break-words">{p.name}</td>
                            <td className="p-6 text-slate-500 font-bold uppercase text-[10px]">{p.vinculo || '-'}</td>
                            <td className="p-6 text-center text-slate-400 font-bold text-sm">{p.birth_year || '-'}</td>
                            <td className="p-6">
                              <div className="flex justify-center gap-2">
                                {playerDocuments.filter((document) => document.player_id === p.id).map((document) => (
                                  <div key={document.id} className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
                                    <button type="button" onClick={() => openDocument(document.id)} title={document.document_type === 'IDENTITY_FRONT' ? 'Ver frontal' : 'Ver posterior'} className={`rounded-lg p-2 ${document.status === 'APPROVED' ? 'text-emerald-600' : document.status === 'REJECTED' ? 'text-red-500' : 'text-amber-500'}`}><Eye size={15} /></button>
                                    {document.status !== 'APPROVED' && <button type="button" onClick={() => reviewDocument(document.id, 'APPROVED')} title="Aprobar" className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"><Check size={15} /></button>}
                                    {document.status !== 'REJECTED' && <button type="button" onClick={() => reviewDocument(document.id, 'REJECTED')} title="Rechazar" className="rounded-lg p-2 text-red-500 hover:bg-red-50"><X size={15} /></button>}
                                  </div>
                                ))}
                                {playerDocuments.every((document) => document.player_id !== p.id) && <span className="text-[9px] font-black uppercase text-slate-300">Sin documentos</span>}
                              </div>
                            </td>
                            <td className="p-6 text-right">
                              <button onClick={() => setPlayerToDelete({ id: p.id, name: p.name })} className="p-3 text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 rounded-lg hover:bg-red-50">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {players.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-10 sm:p-20 text-center">
                               <div className="flex flex-col items-center justify-center grayscale opacity-40">
                                 <Users size={48} className="text-slate-300 mb-4" />
                                 <p className="text-slate-500 font-black uppercase text-xs tracking-widest">Roster sin registros</p>
                                 <p className="text-slate-400 text-[10px] font-bold mt-2">Agregue atletas manualmente o suba un Excel</p>
                               </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <ShieldCheck size={12} className="text-blue-600/50"/> Roster Protegido • SportScore
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
