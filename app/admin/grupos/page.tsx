'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../supabase';
import { ArrowLeft, ArrowRight, Calendar, Trophy, Clock, Trash2, School, CalendarDays, AlertTriangle, GitMerge, AlertCircle, X, Pencil, Save } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FaFutbol, FaBasketballBall, FaVolleyballBall, FaBaseballBall } from 'react-icons/fa';

function FixtureContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlCategory = searchParams.get('cat'); 

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeRound, setActiveRound] = useState<number>(1);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);

  // Estados para Modales Nativos
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlayoffConfirm, setShowPlayoffConfirm] = useState(false);
  
  // Estados para Edición de Partido
  const [editingMatch, setEditingMatch] = useState<any>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editHomeScore, setEditHomeScore] = useState<number | ''>('');
  const [editAwayScore, setEditAwayScore] = useState<number | ''>('');
  const [editStatus, setEditStatus] = useState('');

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('categories').select('*, sports(name)').order('name');
      if (data) setCategories(data);
    }
    loadCategories();
  }, []);

  useEffect(() => {
    if (urlCategory && categories.length > 0) {
      const cat = categories.find(c => c.id === urlCategory);
      if (cat) {
        setSelectedCategory(urlCategory);
        setSelectedSport(cat.sports?.name);
      }
    }
  }, [urlCategory, categories]);

  useEffect(() => {
    if (selectedCategory) {
      loadCategoryData();
    } else {
      setTeams([]);
      setMatches([]);
      setAvailableRounds([]);
    }
  }, [selectedCategory]);

  async function loadCategoryData() {
    setLoading(true);
    const { data: teamsData } = await supabase.from('teams').select('*').eq('category_id', selectedCategory);
    setTeams(teamsData || []);

    const { data: matchesData } = await supabase.from('matches')
      .select(`
        id, status, home_score, away_score, home_sets, away_sets, scheduled_time,
        home_team:teams!home_team_id(id, name, schools(logo_url)), 
        away_team:teams!away_team_id(id, name, schools(logo_url)),
        matchdays!inner(id, category_id, round_number, scheduled_date)
      `)
      .eq('matchdays.category_id', selectedCategory)
      .order('scheduled_time', { ascending: true });
    
    if (matchesData) {
      setMatches(matchesData);
      const rounds = Array.from(new Set(matchesData.map((m: any) => m.matchdays.round_number))).sort((a: any, b: any) => a - b);
      setAvailableRounds(rounds as number[]);
      if (rounds.length > 0 && !(rounds as number[]).includes(activeRound)) {
        setActiveRound(rounds[0] as number);
      }
    }
    setLoading(false);
  }

  const generateFixture = async () => {
    if (teams.length < 2) return toast.error('Se necesitan al menos 2 equipos para generar el fixture');
    if (matches.length > 0) {
      toast.error('Ya existen partidos. Borra el fixture completo si deseas regenerar la fase de grupos.');
      return;
    }

    setLoading(true);
    
    const { data: matchday, error: mdError } = await supabase.from('matchdays').insert({
      category_id: selectedCategory,
      round_number: 1,
      is_open: true
    }).select().single();

    if (mdError || !matchday) {
      setLoading(false);
      return toast.error('Error al crear la jornada');
    }

    const newMatches = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        newMatches.push({
          matchday_id: matchday.id,
          home_team_id: teams[i].id,
          away_team_id: teams[j].id,
          status: 'SCHEDULED' 
        });
      }
    }

    const { error } = await supabase.from('matches').insert(newMatches);
    
    if (error) {
      toast.error('Error al generar los partidos');
    } else {
      toast.success(`Se generaron ${newMatches.length} partidos`);
      loadCategoryData();
    }
    setLoading(false);
  };

  const handlePlayoffClick = () => {
    if (availableRounds.includes(100)) {
      return toast.error('La Fase Final ya ha sido generada.');
    }
    setShowPlayoffConfirm(true);
  };

  const executeGeneratePlayoffs = async () => {
    setShowPlayoffConfirm(false);
    setLoading(true);
    const toastId = toast.loading('Calculando cruces...');

    const sortedTeams = [...teams].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const diffB = (b.goals_for || 0) - (b.goals_against || 0);
      const diffA = (a.goals_for || 0) - (a.goals_against || 0);
      if (diffB !== diffA) return diffB - diffA;
      return (b.goals_for || 0) - (a.goals_for || 0);
    });

    const { data: matchday, error: mdError } = await supabase.from('matchdays').insert({
      category_id: selectedCategory,
      round_number: 100, 
      is_open: true
    }).select().single();

    if (mdError || !matchday) {
      setLoading(false);
      return toast.error('Error al crear jornada de Fase Final', { id: toastId });
    }

    const activeSportName = selectedSport?.toUpperCase() || '';
    const isVolleyball = activeSportName.includes('VOLEIBOL');
    const isCuadrangular = sortedTeams.length === 4;
    const isPentagonal = sortedTeams.length === 5 && !isVolleyball;

    const newMatches = [];

    if (isVolleyball) {
      const groupA = sortedTeams.filter(t => t.group_name === 'A');
      const groupB = sortedTeams.filter(t => t.group_name === 'B');
      if (groupA.length >= 2 && groupB.length >= 2) {
        newMatches.push({ matchday_id: matchday.id, home_team_id: groupA[0].id, away_team_id: groupB[1].id, status: 'SCHEDULED' });
        newMatches.push({ matchday_id: matchday.id, home_team_id: groupB[0].id, away_team_id: groupA[1].id, status: 'SCHEDULED' });
      }
    } else if (isCuadrangular) {
      newMatches.push({ matchday_id: matchday.id, home_team_id: sortedTeams[0].id, away_team_id: sortedTeams[3].id, status: 'SCHEDULED' });
      newMatches.push({ matchday_id: matchday.id, home_team_id: sortedTeams[1].id, away_team_id: sortedTeams[2].id, status: 'SCHEDULED' });
    } else if (isPentagonal) {
      newMatches.push({ matchday_id: matchday.id, home_team_id: sortedTeams[0].id, away_team_id: sortedTeams[1].id, status: 'SCHEDULED' });
      newMatches.push({ matchday_id: matchday.id, home_team_id: sortedTeams[2].id, away_team_id: sortedTeams[3].id, status: 'SCHEDULED' });
    } else {
       if (sortedTeams.length >= 2) {
         newMatches.push({ matchday_id: matchday.id, home_team_id: sortedTeams[0].id, away_team_id: sortedTeams[1].id, status: 'SCHEDULED' });
       }
    }

    if (newMatches.length > 0) {
      await supabase.from('matches').insert(newMatches);
      toast.success('Fase Final lista para arbitrar', { id: toastId });
      loadCategoryData();
      setActiveRound(100); 
    } else {
      toast.error('No hay configuración de llaves para estos equipos', { id: toastId });
    }
    setLoading(false);
  };

  const handleDeleteClick = () => setShowDeleteConfirm(true);

  const confirmDeleteFixture = async () => {
    setShowDeleteConfirm(false);
    setLoading(true);
    const toastId = toast.loading('Eliminando fixture...');
    const { error } = await supabase.from('matchdays').delete().eq('category_id', selectedCategory);
    
    if (error) toast.error('Error al eliminar', { id: toastId });
    else {
      toast.success('Fixture eliminado', { id: toastId });
      loadCategoryData();
    }
    setLoading(false);
  };

  // --- FUNCIONES DE EDICIÓN MANUAL ---
  const openEditModal = (match: any) => {
    setEditingMatch(match);
    setEditDate(match.matchdays?.scheduled_date || '');
    setEditTime(match.scheduled_time ? match.scheduled_time.substring(0, 5) : '');
    setEditHomeScore(match.home_score !== null ? match.home_score : '');
    setEditAwayScore(match.away_score !== null ? match.away_score : '');
    setEditStatus(match.status || 'SCHEDULED');
  };

  const handleUpdateMatch = async () => {
    if (!editingMatch) return;
    setLoading(true);
    const toastId = toast.loading('Guardando cambios...');

    // 1. Actualizar el Partido (Hora, Marcador, Estado)
    const { error: matchError } = await supabase.from('matches')
      .update({
        scheduled_time: editTime || null,
        home_score: editHomeScore !== '' ? Number(editHomeScore) : null,
        away_score: editAwayScore !== '' ? Number(editAwayScore) : null,
        status: editStatus
      })
      .eq('id', editingMatch.id);

    // 2. Actualizar la Fecha de la Jornada (Si fue modificada)
    if (!matchError && editingMatch.matchdays?.id && editDate !== editingMatch.matchdays.scheduled_date) {
      await supabase.from('matchdays')
        .update({ scheduled_date: editDate || null })
        .eq('id', editingMatch.matchdays.id);
    }

    if (matchError) {
      toast.error('Error al actualizar el partido', { id: toastId });
    } else {
      toast.success('Partido actualizado correctamente', { id: toastId });
      setEditingMatch(null);
      loadCategoryData(); // Recargar datos frescos
    }
    setLoading(false);
  };

  const getSportIcon = (sportName: string, size: number = 24) => {
    const name = sportName?.toLowerCase() || '';
    if (name.includes('futbol') || name.includes('fútbol') || name.includes('soccer')) return <FaFutbol className="text-emerald-600" size={size} />;
    if (name.includes('baloncesto') || name.includes('basket')) return <FaBasketballBall className="text-orange-600" size={size} />;
    if (name.includes('voleibol') || name.includes('voley')) return <FaVolleyballBall className="text-blue-600" size={size} />;
    if (name.includes('softball') || name.includes('béisbol') || name.includes('baseball')) return <FaBaseballBall className="text-red-600" size={size} />;
    return <Trophy size={size} className="text-slate-400" />;
  };

  const getRoundName = (roundNumber: number) => {
    if (roundNumber >= 100) return 'Fase Final'; 
    return `Fecha ${roundNumber}`;
  };

  const matchesToShow = matches.filter(m => m.matchdays?.round_number === activeRound);
  const uniqueSports = Array.from(new Set(categories.map(c => c.sports?.name).filter(Boolean)));
  const hasFaseFinal = availableRounds.includes(100);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      
      {/* ========================================================= */}
      {/* MODAL NATIVO: EDICIÓN MANUAL DE PARTIDO (SÚPER ADMIN) */}
      {/* ========================================================= */}
      {editingMatch && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Editar Partido</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                  <AlertCircle size={12}/> Panel de anulación manual
                </p>
              </div>
              <button onClick={() => setEditingMatch(null)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-900 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* CABECERA DEL PARTIDO A EDITAR */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between mb-6 shadow-inner">
               <span className="font-black uppercase text-xs text-slate-700 truncate w-1/3 text-right">{editingMatch.home_team?.name}</span>
               <span className="text-slate-300 font-black italic">VS</span>
               <span className="font-black uppercase text-xs text-slate-700 truncate w-1/3 text-left">{editingMatch.away_team?.name}</span>
            </div>

            <div className="space-y-5">
              {/* FILA 1: FECHA Y HORA */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha (Afecta la Jornada)</label>
                  <input 
                    type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-bold text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hora</label>
                  <input 
                    type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-bold text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* FILA 2: ESTADO Y RESULTADOS */}
              <div className="grid grid-cols-3 gap-4 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">Score Local</label>
                  <input 
                    type="number" value={editHomeScore} onChange={e => setEditHomeScore(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-black text-center text-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="-"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Estado</label>
                  <select 
                    value={editStatus} onChange={e => setEditStatus(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-2 py-3 font-bold text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-center"
                  >
                    <option value="SCHEDULED">Programado</option>
                    <option value="LIVE">En Vivo</option>
                    <option value="FINISHED">Finalizado</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate text-right">Score Visit.</label>
                  <input 
                    type="number" value={editAwayScore} onChange={e => setEditAwayScore(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-4 py-3 font-black text-center text-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="-"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex w-full gap-4 mt-8">
              <button 
                onClick={() => setEditingMatch(null)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 hover:text-slate-900 transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={handleUpdateMatch} disabled={loading}
                className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save size={16} /> Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL NATIVO: CONFIRMACIÓN DE DESTRUCCIÓN */}
      {/* ========================================================= */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-red-200 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600"></div>
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Borrar Fixture?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              Esta acción eliminará todos los partidos programados y sus resultados actuales. No se puede deshacer.
            </p>
            
            <div className="flex w-full gap-4">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 hover:text-slate-900 transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeleteFixture}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> Eliminar Todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL NATIVO: CONFIRMACIÓN GENERAR FASE FINAL */}
      {/* ========================================================= */}
      {showPlayoffConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-indigo-200 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-6 border border-indigo-100">
              <GitMerge size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Generar Fase Final?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              El sistema leerá las <strong className="text-slate-900">posiciones actuales</strong> de la tabla para organizar los cruces finales. Asegúrate de que todos los partidos de la fase de grupos hayan finalizado correctamente.
            </p>
            
            <div className="flex w-full gap-4">
              <button 
                onClick={() => setShowPlayoffConfirm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={executeGeneratePlayoffs}
                className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
              >
                <Trophy size={16} /> Generar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-12 relative">
        
        {/* CABECERA Y BOTÓN DE RETROCESO INTELIGENTE */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Gestión de <span className="text-emerald-600">Torneo</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">CSJB Championship - Fixture Oficial</p>
          </div>
          
          {/* NAVEGACIÓN LÓGICA */}
          {selectedCategory ? (
            <button onClick={() => {
              setSelectedCategory(null);
              router.replace('/admin/grupos', { scroll: false });
            }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Volver a Categorías
            </button>
          ) : selectedSport ? (
            <button onClick={() => setSelectedSport(null)} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Volver a Deportes
            </button>
          ) : (
            <Link href="/admin" className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
              <ArrowLeft size={16} /> Volver al Búnker
            </Link>
          )}
        </div>

        {/* VISTA 1: SELECCIONAR DEPORTE */}
        {!selectedCategory && !selectedSport && (
           <div className="space-y-6">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-6">
               <Trophy className="text-emerald-600" size={24}/> Selecciona el Deporte
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {uniqueSports.map(sport => (
                 <button 
                   key={sport as string}
                   onClick={() => setSelectedSport(sport as string)}
                   className="group flex flex-col p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:border-emerald-300 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="mb-6 group-hover:scale-110 transition-transform origin-left">
                     {getSportIcon(sport as string, 48)}
                   </div>
                   <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{sport as string}</h3>
                   <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 mt-4 group-hover:text-emerald-600 transition-colors w-full justify-between">
                     Ver Categorías <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </p>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 2: SELECCIONAR CATEGORÍA */}
        {!selectedCategory && selectedSport && (
           <div className="space-y-6">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-4 mb-6">
               {getSportIcon(selectedSport, 28)} Categorías de {selectedSport}
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {categories.filter(c => c.sports?.name === selectedSport).map(c => (
                 <button 
                   key={c.id}
                   onClick={() => {
                     setSelectedCategory(c.id);
                     router.replace(`/admin/grupos?cat=${c.id}`, { scroll: false });
                   }}
                   className="group flex flex-col p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-emerald-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden"
                 >
                   <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1 mt-2">{c.name}</h3>
                   <p className="text-emerald-600 font-black text-[10px] uppercase tracking-widest">{c.gender}</p>
                   <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">Duración: {c.match_duration || 'Estándar'}</p>
                   
                   <div className="mt-8 flex items-center text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-emerald-600 w-full justify-between">
                     Cargar Fixture Oficial <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                 </button>
               ))}
             </div>
           </div>
        )}

        {/* VISTA 3: EL FIXTURE */}
        {selectedCategory && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-slate-200 p-6 rounded-2xl shadow-sm gap-4">
              <div className="flex items-center gap-4">
                 {getSportIcon(categories.find(c => c.id === selectedCategory)?.sports?.name)}
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    {categories.find(c => c.id === selectedCategory)?.name || 'Cargando...'}
                  </h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Equipos Inscritos: {teams.length}</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                {matches.length > 0 && (
                  <>
                    {!hasFaseFinal && (
                      <button 
                        onClick={handlePlayoffClick}
                        disabled={loading}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-200 px-6 py-3 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm font-black uppercase text-xs tracking-widest"
                      >
                        <GitMerge size={16} /> Generar Fase Final
                      </button>
                    )}
                    <button 
                      onClick={handleDeleteClick}
                      disabled={loading}
                      className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-6 py-3 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm font-black uppercase text-xs tracking-widest"
                    >
                      <Trash2 size={16} /> Borrar Fixture
                    </button>
                  </>
                )}
                {teams.length > 0 && matches.length === 0 && (
                  <button 
                    onClick={generateFixture}
                    disabled={loading}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-500 transition-all shadow-md font-black uppercase text-xs tracking-widest"
                  >
                    <Calendar size={16} /> Generar Automático
                  </button>
                )}
              </div>
            </div>

            {matches.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                
                <div className="flex overflow-x-auto bg-slate-50 px-4 pt-4 border-b border-slate-200 gap-2 scrollbar-hide">
                  {availableRounds.map((round) => (
                    <button
                      key={round}
                      onClick={() => setActiveRound(round)}
                      className={`px-8 py-4 rounded-t-2xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex items-center gap-2
                        ${activeRound === round 
                          ? (round === 100 ? 'bg-white text-indigo-600 border-t-2 border-x border-slate-200 shadow-sm z-10 -mb-[1px]' : 'bg-white text-emerald-600 border-t-2 border-x border-slate-200 shadow-sm z-10 -mb-[1px]') 
                          : 'bg-slate-100 text-slate-500 hover:bg-white hover:text-slate-700 border-t border-transparent'}
                      `}
                    >
                      {round === 100 && <GitMerge size={12}/>}
                      {getRoundName(round)}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-slate-100">
                  {matchesToShow.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest bg-slate-50/50">No hay partidos en esta fecha</div>
                  ) : (
                    matchesToShow.map((match) => (
                      <div key={match.id} className="p-10 hover:bg-slate-50/80 transition-colors relative group">
                        
                        {/* BOTÓN MÁGICO DE EDICIÓN - SOLO ADMIN */}
                        <button
                          onClick={() => openEditModal(match)}
                          className="absolute top-6 right-6 p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 rounded-xl shadow-sm transition-all z-10"
                          title="Editar Partido Manualmente"
                        >
                          <Pencil size={18} />
                        </button>

                        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white border border-slate-200 px-4 py-1.5 rounded-full shadow-sm">
                          <CalendarDays size={12} className="text-blue-500" />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            {match.matchdays?.scheduled_date ? new Date(match.matchdays.scheduled_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : 'Sin fecha'} 
                            {' '}|{' '}
                            {match.scheduled_time ? match.scheduled_time.substring(0, 5) : 'Por definir'}
                          </span>
                        </div>

                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8 mt-4">
                          
                          {/* EQUIPO A (LOCAL) */}
                          <div className="flex items-center justify-end gap-6">
                            <div className="text-right flex flex-col">
                               <span className="font-black text-slate-900 uppercase tracking-tight text-xl">{match.home_team?.name || 'Equipo Eliminado'}</span>
                               <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Local</span>
                            </div>
                            <div className="w-20 h-20 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-2 shrink-0 shadow-sm overflow-hidden group-hover:border-emerald-300 transition-colors">
                              {match.home_team?.schools?.logo_url ? (
                                <img src={match.home_team.schools.logo_url} alt="Local" className="w-full h-full object-contain" />
                              ) : (
                                <School size={32} className="text-slate-300" />
                              )}
                            </div>
                          </div>

                          {/* MARCADOR CENTRAL */}
                          <div className="flex flex-col items-center justify-center w-32 px-4">
                             <div className="flex flex-col items-center">
                               {match.status === 'FINISHED' ? (
                                  <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-slate-200 shadow-inner flex items-center justify-center min-w-[100px]">
                                    <span className="font-black text-slate-900 text-3xl">{match.home_score !== null ? match.home_score : '-'}</span>
                                    <span className="text-slate-300 mx-3 text-2xl font-black">-</span>
                                    <span className="font-black text-slate-900 text-3xl">{match.away_score !== null ? match.away_score : '-'}</span>
                                  </div>
                               ) : match.status === 'LIVE' ? (
                                  <div className="bg-emerald-50 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-200 shadow-sm">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-emerald-600 font-black text-[10px] uppercase tracking-widest">En Vivo</span>
                                  </div>
                               ) : (
                                 <div className="bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-2 border border-slate-200">
                                   <Clock size={14} className="text-slate-400" />
                                   <span className="text-slate-500 font-black text-xs uppercase tracking-widest">Vs</span>
                                 </div>
                               )}
                             </div>
                          </div>

                          {/* EQUIPO B (VISITANTE) */}
                          <div className="flex items-center justify-start gap-6">
                            <div className="w-20 h-20 bg-white rounded-2xl border border-slate-200 flex items-center justify-center p-2 shrink-0 shadow-sm overflow-hidden group-hover:border-emerald-300 transition-colors">
                              {match.away_team?.schools?.logo_url ? (
                                <img src={match.away_team.schools.logo_url} alt="Visitante" className="w-full h-full object-contain" />
                              ) : (
                                <School size={32} className="text-slate-300" />
                              )}
                            </div>
                            <div className="text-left flex flex-col">
                               <span className="font-black text-slate-900 uppercase tracking-tight text-xl">{match.away_team?.name || 'Equipo Eliminado'}</span>
                               <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Visitante</span>
                            </div>
                          </div>

                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function GruposPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-emerald-600 font-black tracking-widest uppercase animate-pulse">Cargando Módulo de Fixtures...</p>
      </div>
    }>
      <FixtureContent />
    </Suspense>
  );
}