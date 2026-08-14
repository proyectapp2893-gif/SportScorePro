'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '../../../supabase';
import { ArrowLeft, Search, Users, School, ShieldCheck, AlertCircle, Download, FileSpreadsheet, Activity, X, BadgeCheck, IdCard, FileDown } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import AppSelect from '@/app/components/AppSelect';
import { getAdminPlayerCardPhotoUrl, getAdminTeamCardPhotoUrls } from './actions';

function ageOnDate(birthDate: string | null | undefined, referenceDate: string | null | undefined, birthYear?: number | null) {
  if (!birthDate) {
    const referenceYear = referenceDate ? new Date(`${referenceDate}T00:00:00`).getFullYear() : new Date().getFullYear();
    return birthYear && Number.isFinite(referenceYear) ? referenceYear - birthYear : null;
  }

  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const reference = referenceDate ? new Date(`${referenceDate}T00:00:00`) : new Date();
  let age = reference.getFullYear() - birth.getFullYear();
  const birthdayPending = reference.getMonth() < birth.getMonth()
    || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
  if (birthdayPending) age -= 1;
  return age;
}

export default function ControlDelegacionesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const [clientId, setClientId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(searchParams.get('tournament') || '');
  const [schools, setSchools] = useState<any[]>([]);
  const [filteredSchools, setFilteredSchools] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Estados para la Vista de Detalle
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const [schoolTeams, setSchoolTeams] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [cardLoadingId, setCardLoadingId] = useState<string | null>(null);
  const [pdfLoadingTeamId, setPdfLoadingTeamId] = useState<string | null>(null);
  const [playerCard, setPlayerCard] = useState<{ player: any; team: any; photoUrl: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; missingPhotos: number } | null>(null);

  useEffect(() => {
    if (slug) fetchClientScope();
  }, [slug]);

  useEffect(() => {
    if (clientId) fetchOverviewData();
  }, [clientId, selectedTournamentId]);

  useEffect(() => () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview?.url]);

  // Filtrado en tiempo real
  useEffect(() => {
    if (!searchTerm) {
      setFilteredSchools(schools);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredSchools(schools.filter(s => s.name.toLowerCase().includes(lower)));
    }
  }, [searchTerm, schools]);

  async function fetchClientScope() {
    setLoading(true);
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!client) {
      setLoading(false);
      return;
    }

    setClientId(client.id);
    const { data: tournamentData } = await supabase
      .from('tournaments')
      .select('id, name, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    setTournaments(tournamentData || []);
    if (!selectedTournamentId && tournamentData?.[0]?.id) {
      setSelectedTournamentId(tournamentData[0].id);
    }
  }

  async function fetchOverviewData() {
    if (!clientId) return;
    setLoading(true);
    const { data: schoolsData } = await supabase
      .from('schools')
      .select('*')
      .eq('client_id', clientId)
      .order('name');

    let teamsQuery = supabase
      .from('teams')
      .select('school_id, id, players(id), categories!inner(tournament_id)');

    if (selectedTournamentId) {
      teamsQuery = teamsQuery.eq('categories.tournament_id', selectedTournamentId);
    }

    const { data: teamsData } = await teamsQuery;

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
      const visibleSchools = selectedTournamentId ? processedSchools.filter((school) => school.totalTeams > 0) : processedSchools;
      const sortedSchools = visibleSchools.sort((a, b) => b.totalAthletes - a.totalAthletes);
      setSchools(sortedSchools);
      setFilteredSchools(sortedSchools);
    }
    setLoading(false);
  }

  async function handleSelectSchool(school: any) {
    setSelectedSchool(school);
    setLoadingDetails(true);

    let detailQuery = supabase.from('teams')
      .select(`
        id, name,
        categories!inner(name, gender, tournament_id, sports(name), tournaments(name, schedule_dates)),
        players (*)
      `)
      .eq('school_id', school.id);

    if (selectedTournamentId) {
      detailQuery = detailQuery.eq('categories.tournament_id', selectedTournamentId);
    }

    const { data: teamsData } = await detailQuery;

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

  async function openPlayerCard(player: any, team: any) {
    setCardLoadingId(player.id);
    const result = await getAdminPlayerCardPhotoUrl(slug, player.id);
    setCardLoadingId(null);
    if (!result.success) return toast.error(result.error);
    setPlayerCard({ player, team, photoUrl: result.data.url });
  }

  async function downloadTeamCardsPdf(team: any) {
    if (!team.players?.length) return toast.error('Este equipo no tiene jugadores inscritos.');
    setPdfLoadingTeamId(team.id);
    const toastId = toast.loading('Preparando carnés...');
    try {
      const photosResult = await getAdminTeamCardPhotoUrls(slug, team.id);
      if (!photosResult.success) throw new Error(photosResult.error);
      const photoUrls = new Map(photosResult.data.map((photo) => [photo.playerId, photo.url]));
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const imageCache = new Map<string, string>();
      const toDataUrl = async (url?: string) => {
        if (!url) return null;
        if (imageCache.has(url)) return imageCache.get(url) || null;
        try {
          const response = await fetch(url);
          if (!response.ok) return null;
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          imageCache.set(url, dataUrl);
          return dataUrl;
        } catch { return null; }
      };

      const [schoolLogo, playerPhotoEntries] = await Promise.all([
        toDataUrl(selectedSchool.logo_url),
        Promise.all(team.players.map(async (player: any) => [player.id, await toDataUrl(photoUrls.get(player.id))] as const)),
      ]);
      const playerPhotos = new Map<string, string | null>(playerPhotoEntries);
      const imageFormat = (dataUrl: string) => dataUrl.startsWith('data:image/png') ? 'PNG' : dataUrl.startsWith('data:image/webp') ? 'WEBP' : 'JPEG';
      const cardWidth = 94;
      const cardHeight = 87;
      const gapX = 6;
      const gapY = 6;
      const startX = 8;
      const startY = 9;
      let missingPhotos = 0;

      for (let index = 0; index < team.players.length; index += 1) {
        if (index > 0 && index % 6 === 0) pdf.addPage();
        const position = index % 6;
        const x = startX + (position % 2) * (cardWidth + gapX);
        const y = startY + Math.floor(position / 2) * (cardHeight + gapY);
        const player = team.players[index];
        const playerPhoto = playerPhotos.get(player.id) || null;
        if (!playerPhoto) missingPhotos += 1;

        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(215, 225, 238);
        pdf.roundedRect(x, y, cardWidth, cardHeight, 4, 4, 'FD');
        pdf.setFillColor(7, 15, 36);
        pdf.roundedRect(x, y, cardWidth, 31, 4, 4, 'F');
        pdf.setFillColor(7, 15, 36);
        pdf.rect(x, y + 20, cardWidth, 11, 'F');
        pdf.setFillColor(37, 99, 235);
        pdf.rect(x, y + 31, cardWidth, 1.6, 'F');

        if (playerPhoto) {
          try { pdf.addImage(playerPhoto, imageFormat(playerPhoto), x + 5, y + 8, 22, 27, undefined, 'FAST'); } catch { missingPhotos += 1; }
        } else {
          pdf.setFillColor(241, 245, 249); pdf.roundedRect(x + 5, y + 8, 22, 27, 2, 2, 'F');
          pdf.setTextColor(148, 163, 184); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.text('SIN FOTO', x + 16, y + 22, { align: 'center' });
        }

        if (schoolLogo) {
          try { pdf.addImage(schoolLogo, imageFormat(schoolLogo), x + cardWidth - 17, y + 5, 12, 12, undefined, 'FAST'); } catch { /* logo opcional */ }
        }
        pdf.setTextColor(96, 165, 250); pdf.setFontSize(5.5); pdf.setFont('helvetica', 'bold'); pdf.text('SPORTSCORE PRO · CARNÉ OFICIAL', x + 31, y + 9);
        pdf.setTextColor(255, 255, 255); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
        const playerName = pdf.splitTextToSize(String(player.name || '').toUpperCase(), 55).slice(0, 2);
        pdf.text(playerName, x + 31, y + 16);
        pdf.setTextColor(30, 64, 175); pdf.setFontSize(18); pdf.text(`#${player.shirt_number || '-'}`, x + 6, y + 45);
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(5.5); pdf.text('DORSAL', x + 6, y + 49);
        const age = ageOnDate(player.birth_date, team.categories?.tournaments?.schedule_dates?.[0], player.birth_year);
        pdf.setTextColor(8, 145, 178); pdf.setFontSize(18); pdf.text(String(age ?? '-'), x + 31, y + 45);
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(5.5); pdf.text('EDAD', x + 31, y + 49);
        pdf.setDrawColor(226, 232, 240); pdf.line(x + 5, y + 54, x + cardWidth - 5, y + 54);
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(5.2); pdf.text('EQUIPO', x + 6, y + 60); pdf.text('CATEGORÍA', x + 50, y + 60);
        pdf.setTextColor(15, 23, 42); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
        pdf.text(pdf.splitTextToSize(String(team.name || '').toUpperCase(), 38).slice(0, 1), x + 6, y + 65);
        pdf.text(pdf.splitTextToSize(String(team.categories?.name || '').toUpperCase(), 36).slice(0, 1), x + 50, y + 65);
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(5.2); pdf.text('VÍNCULO', x + 6, y + 72); pdf.text('TORNEO', x + 50, y + 72);
        pdf.setTextColor(15, 23, 42); pdf.setFontSize(6.5);
        pdf.text(pdf.splitTextToSize(String(player.vinculo || '-').toUpperCase(), 38).slice(0, 1), x + 6, y + 77);
        pdf.text(pdf.splitTextToSize(String(team.categories?.tournaments?.name || '-').toUpperCase(), 37).slice(0, 1), x + 50, y + 77);
        pdf.setTextColor(148, 163, 184); pdf.setFontSize(4.8); pdf.text(`ID ${String(player.identity_number || 'SIN REGISTRAR')}`, x + 6, y + 83);
      }

      const filename = `Carnes_${String(team.name).replace(/[^a-z0-9]+/gi, '_')}.pdf`;
      const url = URL.createObjectURL(pdf.output('blob'));
      setPdfPreview({ url, filename, missingPhotos });
      toast.success(missingPhotos ? `Vista previa lista. ${missingPhotos} jugador(es) aparecen sin foto.` : 'Vista previa lista: seis carnés por hoja.', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF.', { id: toastId });
    } finally {
      setPdfLoadingTeamId(null);
    }
  }

  function closePdfPreview() {
    setPdfPreview(null);
  }

  function confirmPdfDownload() {
    if (!pdfPreview) return;
    const link = document.createElement('a');
    link.href = pdfPreview.url;
    link.download = pdfPreview.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('PDF descargado');
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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest">{team.players.length} Inscritos</span>
                      <button type="button" disabled={pdfLoadingTeamId === team.id} onClick={() => downloadTeamCardsPdf(team)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-600 disabled:opacity-50"><FileDown size={15} /> {pdfLoadingTeamId === team.id ? 'Generando...' : 'Descargar carnés PDF'}</button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white border-b border-slate-100 text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">
                          <th className="p-4 pl-8 w-20 text-center">Dorsal</th>
                          <th className="p-4">Nombre del Atleta</th>
                          <th className="p-4 text-center pr-8">Año de Nacimiento</th>
                          <th className="p-4 text-center">Edad</th>
                          <th className="p-4 pr-8 text-center">Carné</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {team.players.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 pl-8 text-center font-black text-slate-400">{p.shirt_number || '-'}</td>
                            <td className="p-4 font-black text-slate-700 uppercase tracking-tight">{p.name}</td>
                            <td className="p-4 pr-8 text-center text-slate-500 font-bold">{p.birth_date ? String(p.birth_date).slice(0, 4) : p.birth_year || '-'}</td>
                            <td className="p-4 text-center"><span className="inline-flex min-w-10 items-center justify-center rounded-xl bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-700">{ageOnDate(p.birth_date, team.categories?.tournaments?.schedule_dates?.[0], p.birth_year) ?? '-'}</span></td>
                            <td className="p-4 pr-8 text-center">
                              <button
                                type="button"
                                disabled={cardLoadingId === p.id}
                                onClick={() => openPlayerCard(p, team)}
                                className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                              >
                                <IdCard size={15} /> {cardLoadingId === p.id ? 'Abriendo...' : 'Ver carné'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              ))}
            </div>
          )}

          {playerCard && (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={`Carné de ${playerCard.player.name}`}>
              <div className="w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
                <div className="relative overflow-hidden bg-slate-950 px-6 pb-8 pt-6 text-white">
                  {selectedSchool.logo_url && <img src={selectedSchool.logo_url} alt="" className="pointer-events-none absolute -right-12 -top-8 h-64 w-64 object-contain opacity-[0.07] grayscale" />}
                  <div className="relative flex items-start justify-between">
                    <div><p className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-400">SportScore Pro</p><h2 className="mt-1 text-xl font-black uppercase">Carné oficial</h2></div>
                    <button type="button" onClick={() => setPlayerCard(null)} className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Cerrar carné"><X size={17} /></button>
                  </div>
                  <div className="relative mt-6 flex items-end gap-5">
                    <div className="h-32 w-28 shrink-0 overflow-hidden rounded-[1.5rem] border-4 border-white bg-white shadow-xl"><img src={playerCard.photoUrl} alt={`Foto de ${playerCard.player.name}`} className="h-full w-full object-cover" /></div>
                    <div className="min-w-0 pb-1"><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Jugador registrado</p><h3 className="mt-1 break-words text-2xl font-black uppercase leading-none">{playerCard.player.name}</h3><div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-emerald-300"><BadgeCheck size={13} /> Identidad registrada</div></div>
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
                  <div className="absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400" />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-blue-100 bg-white p-4 text-center"><p className="text-3xl font-black text-blue-700">#{playerCard.player.shirt_number || '-'}</p><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Dorsal</p></div>
                    <div className="rounded-2xl border border-cyan-100 bg-white p-4 text-center"><p className="text-3xl font-black text-cyan-700">{ageOnDate(playerCard.player.birth_date, playerCard.team.categories?.tournaments?.schedule_dates?.[0], playerCard.player.birth_year) ?? '-'}</p><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Edad</p></div>
                    <div className="flex items-center justify-center rounded-2xl border border-indigo-100 bg-white p-3">{selectedSchool.logo_url ? <img src={selectedSchool.logo_url} alt={`Logo de ${selectedSchool.name}`} className="h-16 w-16 object-contain" /> : <School className="text-slate-300" size={42} />}</div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Equipo</p><p className="text-sm font-black uppercase text-slate-900">{playerCard.team.name}</p></div><ShieldCheck className="text-blue-600" size={22} /></div>
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3"><div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Categoría</p><p className="text-[10px] font-black uppercase">{playerCard.team.categories?.name}</p></div><div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Vínculo</p><p className="text-[10px] font-black uppercase">{playerCard.player.vinculo || '-'}</p></div></div>
                  </div>
                  <p className="mt-4 text-center text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Válido para {playerCard.team.categories?.tournaments?.name}</p>
                </div>
              </div>
            </div>
          )}

          {pdfPreview && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Vista previa de carnés" onClick={(event) => { if (event.target === event.currentTarget) closePdfPreview(); }}>
              <section className="flex h-[88vh] w-full max-w-4xl animate-in zoom-in-95 flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl sm:rounded-[2rem]">
                <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-slate-950 px-5 py-4 text-white sm:px-6">
                  <div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[0.25em] text-blue-400">Seis carnés por hoja</p><h2 className="truncate text-base font-black uppercase sm:text-xl">Vista previa del PDF</h2></div>
                  <button type="button" onClick={closePdfPreview} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Cerrar vista previa"><X size={19} /></button>
                </header>
                <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-4">
                  <iframe src={pdfPreview.url} title="Vista previa de carnés" className="h-full w-full rounded-xl border-0 bg-white" />
                </div>
                <footer className="flex flex-col gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{pdfPreview.filename}</p>{pdfPreview.missingPhotos > 0 && <p className="mt-1 text-[9px] font-bold uppercase text-amber-600">{pdfPreview.missingPhotos} jugador(es) aparecen sin foto</p>}</div>
                  <div className="flex gap-2"><button type="button" onClick={closePdfPreview} className="flex-1 rounded-xl bg-slate-100 px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-600 sm:flex-none">Cancelar</button><button type="button" onClick={confirmPdfDownload} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[9px] font-black uppercase tracking-widest text-white hover:bg-blue-700 sm:flex-none"><Download size={15} /> Descargar PDF</button></div>
                </footer>
              </section>
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
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Supervisión de inscripciones por institución y torneo</p>
          </div>
          <Link href={`/${slug}/admin`} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm shrink-0">
            <ArrowLeft size={16} /> Panel principal
          </Link>
        </div>

        {/* BUSCADOR */}
        <div className="flex flex-col lg:flex-row gap-3 mb-8 w-full max-w-4xl relative z-20">
          <AppSelect
            value={selectedTournamentId}
            onChange={(value) => {
              setSelectedTournamentId(value);
              setSelectedSchool(null);
              setSearchTerm('');
            }}
            className="w-full lg:w-[320px]"
            options={tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }))}
            placeholder="Selecciona torneo"
          />

          <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 flex-1">
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
