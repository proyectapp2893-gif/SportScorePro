'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { ArrowLeft, Search, Users, School, ShieldCheck, AlertCircle, Download, FileSpreadsheet, Activity, X } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

export default function ControlDelegacionesPage() {
  const [schools, setSchools] = useState<any[]>([]);
  const [filteredSchools, setFilteredSchools] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Estados para la Vista de Detalle
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const [schoolTeams, setSchoolTeams] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchOverviewData();
  }, []);

  // Filtrado en tiempo real
  useEffect(() => {
    if (!searchTerm) {
      setFilteredSchools(schools);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredSchools(schools.filter(s => s.name.toLowerCase().includes(lower)));
    }
  }, [searchTerm, schools]);

  async function fetchOverviewData() {
    setLoading(true);
    // 1. Traemos todos los colegios
    const { data: schoolsData } = await supabase.from('schools').select('*').order('name');
    // 2. Traemos todos los equipos y sus jugadores (solo IDs para contar rápido)
    const { data: teamsData } = await supabase.from('teams').select('school_id, id, players(id)');

    if (schoolsData && teamsData) {
      const processedSchools = schoolsData.map(school => {
        const sTeams = teamsData.filter(t => t.school_id === school.id);
        const totalAthletes = sTeams.reduce((sum, team) => sum + (team.players?.length || 0), 0);
        
        return {
          ...school,
          totalTeams: sTeams.length,
          totalAthletes
        };
      });

      // Ordenar: Primero los que tienen inscritos, luego los vacíos
      const sortedSchools = processedSchools.sort((a, b) => b.totalAthletes - a.totalAthletes);
      setSchools(sortedSchools);
      setFilteredSchools(sortedSchools);
    }
    setLoading(false);
  }

  async function handleSelectSchool(school: any) {
    setSelectedSchool(school);
    setLoadingDetails(true);

    const { data: teamsData } = await supabase.from('teams')
      .select(`
        id, name,
        categories (name, gender, sports(name)),
        players (*)
      `)
      .eq('school_id', school.id);

    if (teamsData) {
      // Filtramos solo los equipos que realmente tengan jugadores inscritos
      const activeTeams = teamsData.filter(t => t.players && t.players.length > 0);
      
      // Ordenamos alfabéticamente por deporte y luego por categoría
      activeTeams.sort((a: any, b: any) => {
        const sportA = a.categories?.sports?.name || '';
        const sportB = b.categories?.sports?.name || '';
        if (sportA !== sportB) return sportA.localeCompare(sportB);
        return (a.categories?.name || '').localeCompare(b.categories?.name || '');
      });

      // Ordenar jugadores dentro de cada equipo por dorsal
      activeTeams.forEach(team => {
        team.players.sort((pa: any, pb: any) => (pa.shirt_number || 0) - (pb.shirt_number || 0));
      });

      setSchoolTeams(activeTeams);
    }
    setLoadingDetails(false);
  }

  const exportSchoolRoster = () => {
    if (!selectedSchool || schoolTeams.length === 0) return toast.error('No hay datos para exportar');

    const exportData: any[] = [];

    schoolTeams.forEach(team => {
      const sportName = team.categories?.sports?.name?.toUpperCase() || 'DEPORTE';
      const categoryName = `${team.categories?.name?.toUpperCase()} ${team.categories?.gender?.toUpperCase()}`;

      team.players.forEach((player: any) => {
        exportData.push({
          'DELEGACIÓN': selectedSchool.name,
          'DEPORTE': sportName,
          'CATEGORÍA': categoryName,
          'DORSAL': player.shirt_number || '-',
          'NOMBRE DEL ATLETA': player.name,
          'AÑO NAC.': player.birth_year || '-'
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nómina Oficial");
    XLSX.writeFile(wb, `Nomina_${selectedSchool.name.replace(/\s+/g, '_')}.xlsx`);
    toast.success('Reporte exportado con éxito');
  };

  // ==============================================================================
  // VISTA 2: DETALLE DE LA DELEGACIÓN
  // ==============================================================================
  if (selectedSchool) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
        <div className="max-w-6xl mx-auto px-4 py-12 relative z-10">
          
          <button onClick={() => setSelectedSchool(null)} className="mb-8 p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
            <ArrowLeft size={16} /> Volver al Resumen
          </button>

          {/* CABECERA DEL EXPEDIENTE */}
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-white rounded-[2rem] border border-slate-200 flex items-center justify-center p-4 shadow-md">
                {selectedSchool.logo_url ? <img src={selectedSchool.logo_url} className="w-full h-full object-contain" /> : <School size={40} className="text-slate-300"/>}
              </div>
              <div>
                <p className="text-blue-600 font-black text-[10px] uppercase tracking-[0.2em] mb-1">Expediente Oficial</p>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-tighter">{selectedSchool.name}</h2>
                <div className="flex items-center gap-4 mt-3">
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Activity size={12}/> {selectedSchool.totalTeams} Categorías
                  </span>
                  <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Users size={12}/> {selectedSchool.totalAthletes} Atletas
                  </span>
                </div>
              </div>
            </div>

            <button onClick={exportSchoolRoster} className="w-full md:w-auto px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-200">
              <FileSpreadsheet size={18} /> Exportar Excel
            </button>
          </div>

          {/* LISTADO DE NÓMINAS POR CATEGORÍA */}
          {loadingDetails ? (
            <div className="py-20 flex flex-col items-center justify-center text-blue-500">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-black uppercase tracking-widest text-xs">Cargando Expediente...</p>
            </div>
          ) : schoolTeams.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-[2.5rem] py-24 flex flex-col items-center justify-center text-slate-400">
              <AlertCircle size={64} className="mb-4 opacity-20 text-slate-300" />
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest mb-2">Delegación Inactiva</h3>
              <p className="text-sm font-medium">Esta institución no ha registrado atletas en ninguna categoría.</p>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              {schoolTeams.map(team => (
                <div key={team.id} className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  
                  <div className="bg-slate-50 border-b border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest mb-1">{team.categories?.sports?.name}</p>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{team.categories?.name} <span className="text-slate-400 font-medium">({team.categories?.gender})</span></h3>
                    </div>
                    <span className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest">
                      {team.players.length} Inscritos
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white border-b border-slate-100 text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">
                          <th className="p-4 pl-8 w-20 text-center">Dorsal</th>
                          <th className="p-4">Nombre del Atleta</th>
                          <th className="p-4 text-center pr-8">Año de Nacimiento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {team.players.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 pl-8 text-center font-black text-slate-400">{p.shirt_number || '-'}</td>
                            <td className="p-4 font-black text-slate-700 uppercase tracking-tight">{p.name}</td>
                            <td className="p-4 pr-8 text-center text-slate-500 font-bold">{p.birth_year || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ==============================================================================
  // VISTA 1: RESUMEN DE DELEGACIONES (OJO DE DIOS)
  // ==============================================================================
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans relative">
      <div className="max-w-7xl mx-auto px-4 py-12 relative z-10">
        
        {/* CABECERA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Control de <span className="text-blue-600">Delegaciones</span></h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Supervisión global de inscripciones por institución</p>
          </div>
          <Link href="/admin" className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm shrink-0">
            <ArrowLeft size={16} /> Volver al Búnker
          </Link>
        </div>

        {/* BUSCADOR */}
        <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8 w-full max-w-xl relative z-20">
          <div className="pl-4 text-slate-400"><Search size={20} /></div>
          <input 
            type="text" 
            placeholder="Buscar delegación por nombre..." 
            className="w-full bg-transparent p-3 outline-none font-bold text-sm text-slate-700 uppercase placeholder:text-slate-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="p-2 mr-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
               <X size={16}/>
            </button>
          )}
        </div>

        {/* CUADRÍCULA DE COLEGIOS */}
        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center text-blue-500">
             <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="font-black uppercase tracking-widest text-xs">Analizando Base de Datos...</p>
          </div>
        ) : filteredSchools.length === 0 ? (
          <div className="py-24 text-center text-slate-500">
            <School size={48} className="mx-auto mb-4 opacity-30" />
            <p className="font-black uppercase tracking-widest text-sm">No se encontraron delegaciones</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-8">
            {filteredSchools.map(school => {
              const hasPlayers = school.totalAthletes > 0;
              
              return (
                <button 
                  key={school.id}
                  onClick={() => handleSelectSchool(school)}
                  className="group bg-white border border-slate-200 rounded-[2rem] p-6 hover:border-blue-400 hover:shadow-xl transition-all text-left shadow-sm relative overflow-hidden flex flex-col h-full"
                >
                  {/* SEMÁFORO DE ESTADO */}
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100 transition-colors">
                    <div className={`h-full w-full ${hasPlayers ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}></div>
                  </div>

                  <div className="flex justify-between items-start mb-6 mt-2">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center p-2 group-hover:scale-110 transition-transform origin-top-left">
                      {school.logo_url ? <img src={school.logo_url} className="w-full h-full object-contain" /> : <School size={24} className="text-slate-300"/>}
                    </div>
                    
                    {hasPlayers ? (
                       <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1 shadow-sm">
                         <ShieldCheck size={10}/> Activa
                       </span>
                    ) : (
                       <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-1 shadow-sm animate-pulse">
                         <AlertCircle size={10}/> Pendiente
                       </span>
                    )}
                  </div>

                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter mb-4 line-clamp-2 leading-tight flex-1">{school.name}</h3>

                  <div className="flex items-center gap-4 border-t border-slate-100 pt-4 mt-auto">
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Categorías</p>
                      <p className="text-xl font-black text-slate-700">{school.totalTeams}</p>
                    </div>
                    <div className="w-px h-8 bg-slate-100"></div>
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Atletas</p>
                      <p className={`text-xl font-black ${hasPlayers ? 'text-blue-600' : 'text-red-500'}`}>{school.totalAthletes}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}