'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Download, FileDown, Files, House, School } from 'lucide-react';
import toast from 'react-hot-toast';
import { loadMatchSheets } from './actions';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import { loadDemoDatabase } from '@/app/lib/demo/database';

function phaseForRound(round: number) {
  if (round === 100 || round >= 201) return 'Fase 3 · Finales';
  if (round >= 101) return 'Fase 2';
  return 'Fase 1';
}

async function drawMatchSheet(pdf: any, match: any, category: any, addPage: boolean) {
  if (addPage) pdf.addPage('a4', 'landscape');
  pdf.setFillColor(7, 15, 36); pdf.rect(0, 0, 297, 28, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.text('PLANILLA MANUAL DE PARTIDO', 12, 11);
  pdf.setFontSize(8); pdf.text(`${String(category?.tournaments?.name || '').toUpperCase()} · ${String(category?.name || '').toUpperCase()}`, 12, 20);
  pdf.setTextColor(71, 85, 105); pdf.setFontSize(7);
  pdf.text(`${match.matchdays?.scheduled_date || 'FECHA PENDIENTE'} · ${match.scheduled_time?.slice(0, 5) || '--:--'} · ${String(match.venue || 'CANCHA PENDIENTE').toUpperCase()} · JORNADA ${match.matchdays?.round_number || '-'}`, 285, 20, { align: 'right' });
  const drawRoster = (team: any, startY: number) => {
    const roster = [...(team?.players || [])].sort((a, b) => Number(a.shirt_number || 999) - Number(b.shirt_number || 999));
    const x = 12; const tableWidth = 273; const widths = [10, 18, 85, 40, 40, 40, 40]; const headers = ['#', 'Dorsal', 'Jugador inscrito', 'Goles / Min.', 'Amarillas / Min.', 'Rojas / Min.', 'Observaciones'];
    const rows = Math.max(roster.length, 16); const rowHeight = Math.min(4.1, 65 / rows); let y = startY;
    pdf.setFillColor(219, 234, 254); pdf.rect(x, y, tableWidth, 7, 'F'); pdf.setTextColor(29, 78, 216); pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.text(`${String(team?.name || 'EQUIPO').toUpperCase()} · ${roster.length} JUGADORES`, x + 3, y + 4.8); y += 7;
    pdf.setFillColor(226, 232, 240); pdf.rect(x, y, tableWidth, 7, 'F'); let cx = x;
    headers.forEach((header, index) => { pdf.setTextColor(51, 65, 85); pdf.setFontSize(5.5); pdf.text(header, cx + 1.5, y + 4.7); cx += widths[index]; if (index < widths.length - 1) pdf.line(cx, y, cx, y + 7); }); y += 7;
    for (let index = 0; index < rows; index += 1) {
      const player = roster[index];
      if (index % 2 === 1) { pdf.setFillColor(248, 250, 252); pdf.rect(x, y, tableWidth, rowHeight, 'F'); }
      pdf.setDrawColor(203, 213, 225); pdf.rect(x, y, tableWidth, rowHeight);
      const values = player ? [String(index + 1), String(player.shirt_number || '-'), String(player.name || '').toUpperCase(), '', '', '', ''] : ['', '', '', '', '', '', ''];
      let vx = x; values.forEach((value, valueIndex) => { pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', valueIndex === 2 ? 'bold' : 'normal'); pdf.setFontSize(Math.min(6, rowHeight + 1)); if (value) pdf.text(pdf.splitTextToSize(value, widths[valueIndex] - 3).slice(0, 1), vx + 1.5, y + Math.min(3, rowHeight - 0.7)); vx += widths[valueIndex]; if (valueIndex < widths.length - 1) pdf.line(vx, y, vx, y + rowHeight); }); y += rowHeight;
    }
  };
  drawRoster(match.home_team, 32); drawRoster(match.away_team, 116);
  pdf.setFont('helvetica', 'bold'); pdf.setTextColor(51, 65, 85); pdf.setFontSize(7); pdf.text('MARCADOR FINAL: LOCAL ______  VISITANTE ______     ÁRBITRO: __________________________     FIRMA MESA: __________________________', 12, 202);
}

export default function MatchSheetsPage() {
  const params = useParams(); const searchParams = useSearchParams(); const slug = params.slug as string; const categoryId = searchParams.get('cat') || '';
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [phase, setPhase] = useState('Fase 1');
  useEffect(() => {
    if (!categoryId) { setLoading(false); return; }
    if (slug === DEMO_SLUG) {
      const db = loadDemoDatabase(); const category = db.categories.find((item) => item.id === categoryId);
      const matches = db.matches.filter((match) => match.matchdays?.category_id === categoryId && match.status !== 'BYE').map((match) => ({ ...match, home_team: { ...match.home_team, players: db.players.filter((player) => player.team_id === match.home_team_id) }, away_team: { ...match.away_team, players: db.players.filter((player) => player.team_id === match.away_team_id) } }));
      setData({ category, matches }); setLoading(false); return;
    }
    loadMatchSheets(slug, categoryId).then((result) => { if (!result.success) toast.error(result.error); else setData(result.data); setLoading(false); });
  }, [slug, categoryId]);
  const phases = useMemo(() => Array.from(new Set<string>((data?.matches || []).map((match: any) => phaseForRound(Number(match.matchdays?.round_number || 0))))), [data]);
  const phaseMatches = (data?.matches || []).filter((match: any) => phaseForRound(Number(match.matchdays?.round_number || 0)) === phase);
  useEffect(() => { if (phases.length > 0 && !phases.includes(phase)) setPhase(phases[0]); }, [phases, phase]);
  const download = async (matches: any[], filename: string) => { if (!matches.length) return toast.error('No hay partidos en esta fase.'); const { jsPDF } = await import('jspdf'); const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); for (let index = 0; index < matches.length; index += 1) await drawMatchSheet(pdf, matches[index], data.category, index > 0); pdf.save(filename); };
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-8"><div className="mx-auto max-w-7xl"><header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Documentación oficial</p><h1 className="text-3xl font-black uppercase tracking-tight sm:text-5xl">Planillas de partido</h1><p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">{data?.category?.name || 'Selecciona una categoría'}</p></div><div className="flex gap-2"><Link href={`/${slug}/admin/mesa${categoryId ? `?cat=${categoryId}` : ''}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600"><ArrowLeft size={15}/> Mesa</Link><Link href={`/${slug}/admin`} className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white"><House size={15}/> Panel</Link></div></header>
  {loading ? <p className="py-20 text-center text-xs font-black uppercase tracking-widest text-blue-600">Cargando planillas...</p> : !categoryId ? <div className="rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center text-sm font-black uppercase text-amber-700">Abre este módulo desde una categoría del panel principal.</div> : <><section className="mb-6 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 overflow-x-auto">{phases.map((item) => <button key={item} onClick={() => setPhase(item)} className={`shrink-0 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-widest ${phase === item ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{item}</button>)}</div><button onClick={() => download(phaseMatches, `planillas-${phase.toLowerCase().replaceAll(' ', '-')}.pdf`)} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white"><Files size={16}/> Descargar fase completa</button></section>
  <div className="space-y-6">{Object.entries(phaseMatches.reduce((groups: Record<string, any[]>, match: any) => { const key = `Jornada ${match.matchdays?.round_number || '-'}`; (groups[key] ||= []).push(match); return groups; }, {})).map(([round, matches]) => <section key={round} className="overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white"><h2 className="text-sm font-black uppercase tracking-widest">{round}</h2><CalendarDays size={17}/></div><div className="divide-y divide-slate-100">{(matches as any[]).map((match) => <article key={match.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50"><School className="text-slate-300"/></div><div className="min-w-0"><p className="font-black uppercase text-slate-900">{match.home_team?.name} <span className="text-slate-300">vs</span> {match.away_team?.name}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">{match.matchdays?.scheduled_date || 'Fecha pendiente'} · {match.scheduled_time?.slice(0,5) || '--:--'} · {match.venue || 'Cancha pendiente'} · {(match.home_team?.players?.length || 0) + (match.away_team?.players?.length || 0)} jugadores</p></div></div><button onClick={() => download([match], `planilla-${match.home_team?.name}-${match.away_team?.name}.pdf`)} className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-blue-700"><FileDown size={15}/> Descargar planilla</button></article>)}</div></section>)}</div></>}
  </div></main>;
}
