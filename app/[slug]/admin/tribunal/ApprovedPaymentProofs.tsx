'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Eye } from 'lucide-react';
import { getApprovedFinePaymentProofs, getApprovedProofTeams, getFinePaymentProofUrl } from './actions';

type Proof = Extract<Awaited<ReturnType<typeof getApprovedFinePaymentProofs>>, { success: true }>['data'][number];
type Team = { id: string; name: string };
const date = (value: string | null) => value ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'Sin fecha registrada';

export default function ApprovedPaymentProofs({ slug, tournamentId }: { slug: string; tournamentId: string }) {
  const [page, setPage] = useState(0);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [zoomByProof, setZoomByProof] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    getApprovedProofTeams(slug, tournamentId).then(result => {
      if (!active) return;
      if (!result.success) { setTeamsError(result.error); return; }
      setTeams(result.data);
    }).catch(() => { if (active) setTeamsError('No se pudieron cargar los equipos del torneo.'); });
    return () => { active = false; };
  }, [slug, tournamentId]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getApprovedFinePaymentProofs(slug, tournamentId, page, { teamId, fromDate, toDate }).then(result => {
      if (!active) return;
      if (!result.success) { setError(result.error); return; }
      setProofs(result.data); setHasMore(result.hasMore);
    }).catch(() => { if (active) setError('No se pudo cargar el historial. Intenta nuevamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, tournamentId, page, retry, teamId, fromDate, toDate]);

  const clearFilters = () => {
    setTeamId('');
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  const openProof = async (proof: Proof) => {
    if (selectedId === proof.id) { setSelectedId(null); return; }
    setSelectedId(proof.id);
    if (urls[proof.id] || fileErrors[proof.id]) return;
    const result = await getFinePaymentProofUrl(slug, proof.id);
    if (result.success) setUrls(current => ({ ...current, [proof.id]: result.data.url }));
    else setFileErrors(current => ({ ...current, [proof.id]: result.error }));
  };

  return <section className="border-b border-slate-200 bg-emerald-50/40 p-4 md:p-6" aria-labelledby="approved-proofs-title">
    <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mb-4 flex w-full items-center gap-3 text-left"><CheckCircle2 className="shrink-0 text-emerald-600" /><span className="flex-1"><span id="approved-proofs-title" className="block text-xl font-black text-slate-900">Comprobantes aprobados</span><span className="block text-xs text-slate-500">Historial del torneo seleccionado, del más reciente al más antiguo.</span></span><ChevronDown className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
    {expanded && <div className="mb-5 grid gap-3 rounded-2xl border border-emerald-100 bg-white p-4 md:grid-cols-[minmax(180px,1fr)_repeat(2,minmax(150px,0.7fr))_auto] md:items-end">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Equipo<select value={teamId} onChange={event => { setTeamId(event.target.value); setPage(0); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800"><option value="">Todos los equipos</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Aprobado desde<input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setPage(0); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800" /></label>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Aprobado hasta<input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setPage(0); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800" /></label>
      <button type="button" onClick={clearFilters} disabled={!teamId && !fromDate && !toDate} className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-40">Limpiar</button>
      {teamsError && <p role="alert" className="text-xs text-red-700 md:col-span-full">{teamsError}</p>}
      {fromDate && toDate && fromDate > toDate && <p role="alert" className="text-xs text-red-700 md:col-span-full">La fecha inicial no puede ser posterior a la fecha final.</p>}
    </div>}
    {expanded && (loading ? <p role="status" className="py-4 text-sm text-slate-500">Cargando historial…</p> : error ? <div role="alert"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 rounded-xl border px-4 py-2 text-sm font-bold">Reintentar</button></div> : proofs.length === 0 ? <p className="rounded-2xl border border-dashed border-emerald-200 p-4 text-sm text-slate-500">No hay comprobantes aprobados para estos filtros.</p> : <div className="grid gap-3 md:grid-cols-2">{proofs.map(proof => <article key={proof.id} className="rounded-2xl border border-emerald-100 bg-white p-4">
      <p className="text-sm font-black uppercase">{proof.teams?.name || 'Equipo sin nombre'}</p>
      <p className="mt-1 text-sm text-slate-600">{proof.proof_scope === 'TEAM' ? 'Comprobante global del equipo' : `#${proof.players?.shirt_number ?? '—'} ${proof.players?.name || 'Jugador sin nombre'}`}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Enviado por: {proof.sender_name} · {proof.sender_role}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-violet-600">{proof.coverage_type === 'PARTIAL' ? 'Pago global parcial' : 'Pago aplicado completo'} · {proof.approved_amount ? new Intl.NumberFormat('es-CO').format(Number(proof.approved_amount)) : '—'} COP · {proof.fine_payment_proof_allocations?.length || 0} sanción(es) cubierta(s)</p>
      <p className="mt-2 break-all text-xs text-slate-500">{proof.original_filename}</p>
      <p className="mt-2 text-xs text-slate-600">Enviado: {date(proof.submitted_at)}</p>
      <p className="mt-1 text-xs font-bold text-emerald-700">Aprobado: {date(proof.reviewed_at)}</p>
      <button type="button" onClick={() => openProof(proof)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Eye size={16} />{selectedId === proof.id ? 'Ocultar comprobante' : 'Ver comprobante'}</button>
      {selectedId === proof.id && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">{fileErrors[proof.id] ? <p role="alert" className="text-sm text-red-700">{fileErrors[proof.id]}</p> : !urls[proof.id] ? <p role="status" className="text-sm text-slate-500">Abriendo comprobante…</p> : proof.mime_type === 'application/pdf' ? <><div className="mb-2 flex items-center justify-end gap-2"><span className="mr-auto text-[10px] font-bold uppercase tracking-widest text-slate-500">Zoom PDF · {zoomByProof[proof.id] || 100}%</span><button type="button" aria-label="Reducir zoom" onClick={() => setZoomByProof(current => ({ ...current, [proof.id]: Math.max(50, (current[proof.id] || 100) - 10) }))} className="rounded-lg border bg-white px-3 py-1 text-sm font-black">−</button><button type="button" onClick={() => setZoomByProof(current => ({ ...current, [proof.id]: 100 }))} className="rounded-lg border bg-white px-3 py-1 text-xs font-bold">100%</button><button type="button" aria-label="Aumentar zoom" onClick={() => setZoomByProof(current => ({ ...current, [proof.id]: Math.min(200, (current[proof.id] || 100) + 10) }))} className="rounded-lg border bg-white px-3 py-1 text-sm font-black">+</button></div><iframe src={`${urls[proof.id]}#zoom=${zoomByProof[proof.id] || 100}`} title={`Comprobante aprobado de ${proof.teams?.name || 'equipo'}`} className="h-96 w-full rounded-lg border-0" /></> : <img src={urls[proof.id]} alt={`Comprobante aprobado de ${proof.teams?.name || 'equipo'}`} className="max-h-96 w-full rounded-lg object-contain" />}</div>}
    </article>)}</div>)}
    {expanded && <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Anterior</button><span className="text-xs text-slate-500">Página {page + 1}</span><button type="button" disabled={loading || Boolean(error) || !hasMore} onClick={() => setPage(value => value + 1)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Siguiente</button></div>}
  </section>;
}
