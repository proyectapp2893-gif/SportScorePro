'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, X } from 'lucide-react';
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
  const [selected, setSelected] = useState<Proof | null>(null);
  const [url, setUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    if (!selected) return;
    let active = true;
    dialog.current?.showModal(); setUrl(''); setFileError('');
    getFinePaymentProofUrl(slug, selected.id).then(result => {
      if (!active) return;
      if (result.success) setUrl(result.data.url); else setFileError(result.error);
    }).catch(() => { if (active) setFileError('No se pudo abrir el comprobante.'); });
    return () => { active = false; };
  }, [slug, selected]);

  return <section className="border-b border-slate-200 bg-emerald-50/40 p-4 md:p-6" aria-labelledby="approved-proofs-title">
    <div className="mb-4 flex items-center gap-3"><CheckCircle2 className="shrink-0 text-emerald-600" /><div><h2 id="approved-proofs-title" className="text-xl font-black text-slate-900">Comprobantes aprobados</h2><p className="text-xs text-slate-500">Historial del torneo seleccionado, del más reciente al más antiguo.</p></div></div>
    {loading ? <p role="status" className="py-4 text-sm text-slate-500">Cargando historial…</p> : error ? <div role="alert"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 rounded-xl border px-4 py-2 text-sm font-bold">Reintentar</button></div> : proofs.length === 0 ? <p className="rounded-2xl border border-dashed border-emerald-200 p-4 text-sm text-slate-500">No hay comprobantes aprobados en esta página.</p> : <div className="grid gap-3 md:grid-cols-2">{proofs.map(proof => <article key={proof.id} className="rounded-2xl border border-emerald-100 bg-white p-4">
      <p className="text-sm font-black uppercase">{proof.teams?.name || 'Equipo sin nombre'}</p>
      <p className="mt-1 text-sm text-slate-600">#{proof.players?.shirt_number ?? '—'} {proof.players?.name || 'Jugador sin nombre'}</p>
      <p className="mt-2 break-all text-xs text-slate-500">{proof.original_filename}</p>
      <p className="mt-2 text-xs text-slate-600">Enviado: {date(proof.submitted_at)}</p>
      <p className="mt-1 text-xs font-bold text-emerald-700">Aprobado: {date(proof.reviewed_at)}</p>
      <button type="button" onClick={() => setSelected(proof)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Eye size={16} />Ver comprobante</button>
    </article>)}</div>}
    <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Anterior</button><span className="text-xs text-slate-500">Página {page + 1}</span><button type="button" disabled={loading || Boolean(error) || !hasMore} onClick={() => setPage(value => value + 1)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Siguiente</button></div>
    {selected && <dialog ref={dialog} onCancel={() => setSelected(null)} aria-labelledby="approved-proof-file" className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,900px)] overflow-auto rounded-2xl bg-white p-5 backdrop:bg-slate-950/60"><div className="mb-4 flex items-center justify-between gap-3"><h3 id="approved-proof-file" className="break-all font-bold">{selected.original_filename}</h3><button type="button" onClick={() => setSelected(null)} aria-label="Cerrar comprobante"><X /></button></div>{fileError ? <p role="alert" className="text-red-700">{fileError}</p> : !url ? <p role="status">Abriendo comprobante…</p> : selected.mime_type === 'application/pdf' ? <iframe src={url} title="Comprobante aprobado" className="h-[65vh] w-full" /> : <img src={url} alt="Comprobante de pago aprobado" className="max-h-[65vh] w-full object-contain" />}</dialog>}
  </section>;
}
