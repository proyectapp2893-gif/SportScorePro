'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import { Trophy, LogOut, ArrowRight, LayoutDashboard, Users, CalendarDays, Plus, School, MonitorPlay, BarChart3, GitMerge, Settings, Trash2, FileText, X, Download, Activity, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminHub() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<any[]>([]);
  
  // Estados para el Reporte PDF
  const [reportData, setReportData] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Estados para modales nativos
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });

  useEffect(() => {
    fetchTournaments();
  }, []);

  async function fetchTournaments() {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    if (data) setTournaments(data);
  }

  const handleLogout = () => {
    sessionStorage.removeItem('loyola_admin_auth');
    router.push('/');
  };

  // Creación de torneo adaptada al modal
  const executeCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTournamentName.trim()) return;

    const toastId = toast.loading('Creando evento...');
    const { error } = await supabase.from('tournaments').insert([{ name: newTournamentName.trim().toUpperCase() }]);
    
    if (error) {
      toast.error('Error al crear el torneo', { id: toastId });
    } else {
      toast.success('Torneo creado exitosamente', { id: toastId });
      setNewTournamentName('');
      setShowCreateModal(false);
      fetchTournaments();
    }
  };

  // Prepara el borrado
  const initiateDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setShowDeleteConfirm({ isOpen: true, id, name });
  };

  // Ejecuta el borrado
  const executeDeleteTournament = async () => {
    if (!showDeleteConfirm.id) return;

    const toastId = toast.loading('Eliminando torneo...');
    const { error } = await supabase.from('tournaments').delete().eq('id', showDeleteConfirm.id);
    
    if (error) {
      toast.error('Error. Verifica si hay categorías asociadas y elimínalas primero.', { id: toastId });
    } else {
      toast.success('Torneo eliminado correctamente', { id: toastId });
      setShowDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchTournaments();
    }
  };

  // ============================================================================
  // MAGIA DEL REPORTE PDF OFICIAL
  // ============================================================================
  const generateTournamentReport = async (e: React.MouseEvent, tournament: any) => {
    e.stopPropagation();
    setIsGeneratingReport(true);
    const toastId = toast.loading(`Recopilando datos de ${tournament.name}...`);

    try {
      const { data: categories } = await supabase
        .from('categories')
        .select('*, sports(name, scoring_system)')
        .eq('tournament_id', tournament.id);

      if (!categories || categories.length === 0) {
        toast.error('El torneo no tiene categorías registradas para hacer un reporte.', { id: toastId });
        setIsGeneratingReport(false);
        return;
      }

      const reportCategories = [];

      for (const cat of categories) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*, schools(name)')
          .eq('category_id', cat.id);
        
        let sortedTeams: any[] = [];
        if (teamsData) {
          sortedTeams = teamsData.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const diffB = (b.goals_for || 0) - (b.goals_against || 0);
            const diffA = (a.goals_for || 0) - (a.goals_against || 0);
            if (diffB !== diffA) return diffB - diffA;
            return (b.goals_for || 0) - (a.goals_for || 0);
          });
        }

        const { data: playersData } = await supabase
          .from('players')
          .select(`id, name, shirt_number, teams!inner(id, name, category_id, schools(name)), match_events(event_type)`)
          .eq('teams.category_id', cat.id);
        
        let topScorers: any[] = [];
        if (playersData) {
          const scorers = playersData.map(player => {
            let totalScore = 0;
            player.match_events.forEach((event: any) => {
              if (event.event_type === 'GOAL' || event.event_type === 'BASKET_1') totalScore += 1;
              else if (event.event_type === 'BASKET_2') totalScore += 2;
              else if (event.event_type === 'BASKET_3') totalScore += 3;
            });
            return { ...player, totalScore };
          }).filter(p => p.totalScore > 0);
          topScorers = scorers.sort((a, b) => b.totalScore - a.totalScore).slice(0, 5); 
        }

        const { data: matchesData } = await supabase
          .from('matches')
          .select(`
            home_score, away_score, status,
            home_team:teams!home_team_id(name),
            away_team:teams!away_team_id(name),
            matchdays!inner(category_id, round_number)
          `)
          .eq('matchdays.category_id', cat.id)
          .eq('status', 'FINISHED')
          .order('matchdays(round_number)', { ascending: true });

        reportCategories.push({
          info: cat,
          standings: sortedTeams,
          scorers: topScorers,
          results: matchesData || []
        });
      }

      setReportData({
        tournament,
        date: new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        categories: reportCategories
      });

      toast.success('Reporte generado. Listo para imprimir.', { id: toastId });
      setShowReportModal(true);

      setTimeout(() => {
        window.print();
      }, 1000);

    } catch (error) {
      console.error(error);
      toast.error('Error al generar el reporte.', { id: toastId });
    }
    setIsGeneratingReport(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white print:p-0 relative">
      
      {/* ========================================================= */}
      {/* MODAL NATIVO: CREAR TORNEO */}
      {/* ========================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-blue-400 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Nuevo Evento</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={executeCreateTournament}>
              <div className="mb-6">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mb-2 block">Nombre Oficial</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  placeholder="EJ: COPA SAN JOSÉ 2026" 
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white transition-colors uppercase"
                  value={newTournamentName}
                  onChange={(e) => setNewTournamentName(e.target.value)}
                />
              </div>
              <button 
                type="submit" 
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 transition-colors shadow-lg shadow-blue-200"
              >
                Crear Competición
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL NATIVO: CONFIRMACIÓN DE BORRADO */}
      {/* ========================================================= */}
      {showDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-6 border border-red-100 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¿Eliminar Torneo?</h3>
            <p className="text-slate-500 text-sm font-bold mb-2 break-words">"{showDeleteConfirm.name}"</p>
            <p className="text-slate-400 text-xs font-medium mb-8 leading-relaxed">
              Esta acción es permanente. Se intentarán borrar todas las categorías, partidos y estadísticas de este evento.
            </p>
            
            <div className="flex w-full gap-4">
              <button 
                onClick={() => setShowDeleteConfirm({ isOpen: false, id: null, name: '' })}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={executeDeleteTournament}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ESTILOS GLOBALES DE IMPRESIÓN (PDF) */}
      {/* ========================================================= */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print, .no-print * { display: none !important; }
          .print-break-inside-avoid { break-inside: avoid; }
          .print-break-before { break-before: page; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}} />

      {/* ========================================================= */}
      {/* VISTA DEL REPORTE (MODAL A PANTALLA COMPLETA / PDF) */}
      {/* ========================================================= */}
      {showReportModal && reportData && (
        <div className="fixed inset-0 z-[9999] bg-white overflow-y-auto print:relative print:block print:z-auto print:overflow-visible print:bg-transparent">
          
          <div className="no-print sticky top-0 bg-slate-900 text-white p-4 flex items-center justify-between shadow-xl z-50">
            <div className="flex items-center gap-3">
              <FileText className="text-blue-400" />
              <h2 className="font-black uppercase tracking-widest text-sm">Vista Previa del Reporte</h2>
            </div>
            <div className="flex gap-4">
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-colors shadow-lg shadow-blue-500/20">
                <Download size={14} /> Guardar PDF
              </button>
              <button onClick={() => setShowReportModal(false)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-colors">
                <X size={14} /> Cerrar
              </button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto p-12 print:max-w-full print:p-0 print:m-0 bg-white">
            
            <div className="text-center mb-16 border-b-4 border-slate-900 pb-8">
              <div className="w-24 h-24 mx-auto mb-6 bg-slate-100 rounded-full flex items-center justify-center border-2 border-slate-300">
                <Trophy size={40} className="text-slate-400" />
              </div>
              <h1 className="text-sm font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Reporte Estadístico Oficial</h1>
              <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-6">{reportData.tournament.name}</h2>
              <p className="text-slate-500 font-medium">Generado el: {reportData.date}</p>
            </div>

            {reportData.categories.map((catData: any, index: number) => {
              const isBasketball = catData.info.sports?.name?.toUpperCase().includes('BALONCESTO');
              const isVolleyball = catData.info.sports?.name?.toUpperCase().includes('VOLEIBOL');
              const colFor = isBasketball ? 'PF' : (isVolleyball ? 'SF' : 'GF');
              const colAgainst = isBasketball ? 'PC' : (isVolleyball ? 'SC' : 'GC');

              return (
                <div key={index} className="mb-16 print-break-inside-avoid">
                  
                  <div className="bg-slate-100 p-6 rounded-2xl mb-8 border border-slate-200 flex items-center gap-4">
                    <div className="bg-slate-900 text-white p-3 rounded-xl"><Activity size={24} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{catData.info.sports?.name}</h3>
                      <p className="text-slate-600 font-bold text-xs uppercase tracking-widest">{catData.info.name} - {catData.info.gender}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-8">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">Clasificación General</h4>
                        {catData.standings.length === 0 ? (
                          <p className="text-slate-500 text-xs italic">No hay equipos registrados.</p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 uppercase">
                                <th className="p-3 border border-slate-200">#</th>
                                <th className="p-3 border border-slate-200">Equipo</th>
                                <th className="p-3 border border-slate-200 text-center">PJ</th>
                                <th className="p-3 border border-slate-200 text-center">PG</th>
                                <th className="p-3 border border-slate-200 text-center">PP</th>
                                <th className="p-3 border border-slate-200 text-center">{colFor}</th>
                                <th className="p-3 border border-slate-200 text-center">{colAgainst}</th>
                                <th className="p-3 border border-slate-200 text-center font-black">PTS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catData.standings.map((team: any, i: number) => (
                                <tr key={team.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  <td className="p-3 border border-slate-200 font-black text-center">{i + 1}</td>
                                  <td className="p-3 border border-slate-200 font-bold uppercase">{team.name}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.played || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.won || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.lost || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.goals_for || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center">{team.goals_against || 0}</td>
                                  <td className="p-3 border border-slate-200 text-center font-black">{team.points || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {!isVolleyball && (
                        <div>
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">Líderes de Anotación (Top 5)</h4>
                          {catData.scorers.length === 0 ? (
                            <p className="text-slate-500 text-xs italic">No hay registros de anotación.</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              {catData.scorers.map((scorer: any, i: number) => (
                                <div key={scorer.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                  <div className="flex flex-col">
                                    <span className="font-black text-slate-800 text-xs uppercase truncate max-w-[150px]">{i + 1}. {scorer.name}</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{scorer.teams?.name}</span>
                                  </div>
                                  <span className="font-black text-lg text-slate-900">{scorer.totalScore}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-1">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 border-b-2 border-slate-200 pb-2">Historial de Partidos</h4>
                      {catData.results.length === 0 ? (
                        <p className="text-slate-500 text-xs italic">Aún no hay partidos finalizados.</p>
                      ) : (
                        <div className="space-y-3">
                          {catData.results.map((match: any, i: number) => (
                            <div key={i} className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs">
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">
                                {match.matchdays?.round_number >= 100 ? 'FASE FINAL' : `FECHA ${match.matchdays?.round_number}`}
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="font-bold text-slate-700 uppercase truncate flex-1 text-right">{match.home_team?.name}</span>
                                <span className="font-black bg-slate-800 text-white px-2 py-1 rounded shadow-inner whitespace-nowrap">
                                  {match.home_score} - {match.away_score}
                                </span>
                                <span className="font-bold text-slate-700 uppercase truncate flex-1 text-left">{match.away_team?.name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}

            <div className="mt-16 pt-8 border-t-2 border-slate-200 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              <p>Documento generado automáticamente por CSJB Championship System</p>
              <p>Las estadísticas mostradas representan los datos avalados por la Mesa de Control Oficial.</p>
            </div>

          </div>
        </div>
      )}


      {/* ========================================================= */}
      {/* VISTA ESTÁNDAR DEL BÚNKER (Se oculta al imprimir) */}
      {/* ========================================================= */}
      <div className={`max-w-6xl mx-auto px-6 py-12 no-print ${showReportModal ? 'hidden' : 'block'}`}>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-16 gap-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-blue-600 rounded-3xl text-white shadow-lg shadow-blue-200">
              <LayoutDashboard size={40} />
            </div>
            <div>
              <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none">Búnker <span className="text-blue-600">CSJB</span></h1>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-[0.3em] mt-2">Gestor de Torneos Central</p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="px-8 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-sm"
          >
            <LogOut size={18} /> Salir del Sistema
          </button>
        </div>

        <div className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-1 bg-blue-600 rounded-full"></div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-widest">Centro de Operaciones</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <button onClick={() => router.push('/admin/colegios')} className="group flex flex-col items-start p-10 bg-white border border-slate-200 rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-amber-50 rounded-2xl text-amber-600 mb-6 group-hover:scale-110 transition-transform border border-amber-100"><School size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Directorio de Colegios</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Gestión completa de instituciones: registro de nombres oficiales y carga de escudos en alta resolución para las transmisiones.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-amber-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Entrar al Directorio <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => router.push('/admin/inscripcion')} className="group flex flex-col items-start p-10 bg-white border border-slate-200 rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 mb-6 group-hover:scale-110 transition-transform border border-blue-100"><Users size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Central de Inscripción</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Administra la base de datos de atletas. Permite la carga masiva mediante plantillas Excel y control de dorsales por equipo.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-blue-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Gestionar Nóminas <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => router.push('/admin/grupos')} className="group flex flex-col items-start p-10 bg-white border border-slate-200 rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600 mb-6 group-hover:scale-110 transition-transform border border-emerald-100"><CalendarDays size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Fixture y Resultados</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Generador automático de calendarios. Define grupos, horarios de competencia y visualiza resultados en tiempo real.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-emerald-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Ver Calendarios <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => router.push('/admin/mesa')} className="group flex flex-col items-start p-10 bg-white border border-slate-200 rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-purple-50 rounded-2xl text-purple-600 mb-6 group-hover:scale-110 transition-transform border border-purple-100"><MonitorPlay size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Mesa de Control</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Interfaz táctil para árbitros. Suma puntos, registra goleadores y faltas en vivo directamente desde la cancha.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-purple-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Abrir Marcador En Vivo <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => router.push('/admin/estadisticas')} className="group flex flex-col items-start p-10 bg-white border border-slate-200 rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-fuchsia-50 rounded-2xl text-fuchsia-600 mb-6 group-hover:scale-110 transition-transform border border-fuchsia-100"><BarChart3 size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Centro de Estadísticas</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Tablas de posiciones automatizadas, ranking de goleadores, valla menos vencida y líderes por disciplina.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-fuchsia-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Clasificaciones <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>

            <button onClick={() => router.push('/admin/fase-final')} className="group flex flex-col items-start p-10 bg-white border border-slate-200 rounded-[3rem] hover:border-blue-400 hover:shadow-2xl transition-all text-left shadow-sm relative overflow-hidden h-full">
              <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 mb-6 group-hover:scale-110 transition-transform border border-indigo-100"><GitMerge size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Fase Final (Llaves)</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">Visualización dinámica de la ramificación del torneo, cruces de semifinales y el cuadro hacia la gran final.</p>
              <div className="mt-auto flex items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest w-full justify-between pt-4 border-t border-slate-50">Cuadro de Eliminatorias <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></div>
            </button>
            
          </div>
        </div>

        <div className="flex items-center justify-between mb-8 print:mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-1 bg-blue-600 rounded-full print:hidden"></div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-widest print:text-3xl print:text-blue-700">Eventos Registrados</h2>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            disabled={isGeneratingReport}
            className="no-print flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl hover:bg-blue-600 transition-all text-xs font-black uppercase tracking-widest shadow-md shadow-slate-200 disabled:opacity-50"
          >
            <Plus size={18} /> Nuevo Evento
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:grid-cols-1 print:gap-4">
          {tournaments.map(t => (
            <div 
              key={t.id}
              onClick={() => {
                if (!isGeneratingReport) router.push(`/admin/torneo/${t.id}`);
              }}
              className="print-break-inside-avoid group flex flex-col p-10 bg-white border border-slate-200 rounded-[3rem] hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden cursor-pointer print:rounded-xl print:shadow-none print:border-2 print:p-6"
            >
              <div className={`absolute top-0 left-0 w-full h-2 ${t.is_active ? 'bg-emerald-500' : 'bg-slate-300'} print:h-1`}></div>
              
              <div className="no-print absolute top-6 right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                   onClick={(e) => generateTournamentReport(e, t)}
                   disabled={isGeneratingReport}
                   className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-50"
                   title="Descargar Reporte PDF"
                 >
                   <FileText size={18} />
                 </button>
                 <button 
                   onClick={(e) => initiateDelete(e, t.id, t.name)}
                   disabled={isGeneratingReport}
                   className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                   title="Eliminar Torneo"
                 >
                   <Trash2 size={18} />
                 </button>
              </div>

              <div className="flex justify-between items-start mb-4 pr-24 print:pr-0">
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{t.name}</h3>
              </div>
              
              <div className="mb-4">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm inline-block ${t.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'} print:shadow-none print:border-none`}>
                  {t.is_active ? '● Torneo Activo' : 'Torneo Finalizado'}
                </span>
                <p className="hidden print:block text-slate-500 text-xs mt-2 font-medium">
                  Identificador de Sistema: {t.id} <br/>
                  Fecha de Creación: {new Date(t.created_at).toLocaleDateString('es-ES')}
                </p>
              </div>

              <div className="no-print flex items-center justify-between w-full mt-8 pt-6 border-t border-slate-50">
                <div className="flex items-center gap-2 text-slate-400">
                  <Settings size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Configuración de Evento</span>
                </div>
                <div className="flex items-center text-xs font-black text-blue-600 uppercase tracking-widest group-hover:underline">
                  Abrir Panel <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
          {tournaments.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-300 rounded-[3rem] bg-white print:border-none">
               <p className="text-slate-400 font-black uppercase tracking-widest text-sm">No tienes eventos creados</p>
               <p className="text-slate-400 font-medium text-xs mt-2 no-print">Haz clic en "Nuevo Evento" para comenzar.</p>
            </div>
          )}
        </div>
        
      </div>
    </main>
  );
}