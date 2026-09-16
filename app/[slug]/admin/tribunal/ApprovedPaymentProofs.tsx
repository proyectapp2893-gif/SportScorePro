'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Eye } from 'lucide-react';
import { getApprovedFinePaymentProofs, getFinePaymentProofUrl } from './actions';

type Proof = Extract<Awaited<ReturnType<typeof getApprovedFinePaymentProofs>>, { success: true }>['data'][number];
const date = (value: string | null) => value ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'Sin fecha registrada';

export default function ApprovedPaymentProofs({ slug, tournamentId }: { slug: string; tournamentId: string }) {
  const [page, setPage] = useState(0);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getApprovedFinePaymentProofs(slug, tournamentId, page).then(result => {
      if (!active) return;
      if (!result.success) { setError(result.error); return; }
      setProofs(result.data); setHasMore(result.hasMore);
    }).catch(() => { if (active) setError('No se pudo cargar el historial. Intenta nuevamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, tournamentId, page, retry]);

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
    {expanded && (loading ? <p role="status" className="py-4 text-sm text-slate-500">Cargando historial…</p> : error ? <div role="alert"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 rounded-xl border px-4 py-2 text-sm font-bold">Reintentar</button></div> : proofs.length === 0 ? <p className="rounded-2xl border border-dashed border-emerald-200 p-4 text-sm text-slate-500">No hay comprobantes aprobados en esta página.</p> : <div className="grid gap-3 md:grid-cols-2">{proofs.map(proof => <article key={proof.id} className="rounded-2xl border border-emerald-100 bg-white p-4">
      <p className="text-sm font-black uppercase">{proof.teams?.name || 'Equipo sin nombre'}</p>
      <p className="mt-1 text-sm text-slate-600">#{proof.players?.shirt_number ?? '—'} {proof.players?.name || 'Jugador sin nombre'}</p>
      <p className="mt-2 break-all text-xs text-slate-500">{proof.original_filename}</p>
      <p className="mt-2 text-xs text-slate-600">Enviado: {date(proof.submitted_at)}</p>
      <p className="mt-1 text-xs font-bold text-emerald-700">Aprobado: {date(proof.reviewed_at)}</p>
      <button type="button" onClick={() => openProof(proof)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Eye size={16} />{selectedId === proof.id ? 'Ocultar comprobante' : 'Ver comprobante'}</button>
      {selectedId === proof.id && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">{fileErrors[proof.id] ? <p role="alert" className="text-sm text-red-700">{fileErrors[proof.id]}</p> : !urls[proof.id] ? <p role="status" className="text-sm text-slate-500">Abriendo comprobante…</p> : proof.mime_type === 'application/pdf' ? <iframe src={urls[proof.id]} title={`Comprobante aprobado de ${proof.teams?.name || 'equipo'}`} className="h-96 w-full rounded-lg border-0" /> : <img src={urls[proof.id]} alt={`Comprobante aprobado de ${proof.teams?.name || 'equipo'}`} className="max-h-96 w-full rounded-lg object-contain" />}</div>}
    </article>)}</div>)}
    {expanded && <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Anterior</button><span className="text-xs text-slate-500">Página {page + 1}</span><button type="button" disabled={loading || Boolean(error) || !hasMore} onClick={() => setPage(value => value + 1)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Siguiente</button></div>}
  </section>;
}
