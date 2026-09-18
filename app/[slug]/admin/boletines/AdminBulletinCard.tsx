'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import TournamentBulletinCard from '@/app/components/TournamentBulletinCard';
import { confirmDialog } from '@/app/components/AppDialog';
import { confirmBulletin, loadBulletinEditor } from './actions';

export default function AdminBulletinCard({ slug, tournamentId, asOfDate }: { slug: string; tournamentId: string; asOfDate?: string | null }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadBulletinEditor>>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const loaded = await loadBulletinEditor(slug, tournamentId, asOfDate);
      if (!loaded) throw new Error('No se pudo validar la sesión administrativa.');
      setData(loaded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la información de los boletines.');
    } finally {
      setBusy(false);
    }
  }, [asOfDate, slug, tournamentId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function confirm() {
    if (asOfDate) { toast.error('Quita el filtro de fecha para publicar un boletín.'); return; }
    if (!data?.preview || data.nextNumber === null) { toast.error('No hay una fecha finalizada pendiente por publicar.'); return; }
    if (!await confirmDialog({ title: `Confirmar boletín de la Fecha ${data.nextNumber}`, description: 'Se guardará el resumen automático de esta fecha y no podrá editarse ni eliminarse después.', confirmLabel: 'Confirmar y publicar' })) return;
    setBusy(true);
    const result = await confirmBulletin(slug, tournamentId, data.nextNumber);
    if (!result.success) { setBusy(false); toast.error(result.error); return; }
    toast.success('Boletín oficial confirmado.');
    setData(await loadBulletinEditor(slug, tournamentId));
    setBusy(false);
  }

  if (error) return <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"><p className="text-sm font-black uppercase text-red-700">No se pudieron cargar los boletines</p><p className="mt-2 text-xs font-semibold text-red-600">{error}</p><button onClick={refresh} className="mt-5 rounded-xl bg-red-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white">Reintentar</button></div>;
  if (!data) return <div className="flex justify-center py-16 text-indigo-600"><LoaderCircle className="animate-spin" /></div>;
  return <section className="mt-6">
    <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">Cronología de boletines</p><p className="mt-1 text-xs font-semibold text-indigo-700">Cada bloque conserva la información acumulada hasta su fecha. Los borradores pendientes se muestran sin publicar.</p></div>
    {data.entries.length ? <div className="space-y-5">{data.entries.map((item) => <div key={item.id} className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2 px-1"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.preview ? `Borrador · Fecha ${item.bulletin_number}` : `Publicado · Fecha ${item.bulletin_number}`}</p>{item.preview && !item.canConfirm && <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Pendiente de confirmar fecha anterior</span>}</div><TournamentBulletinCard snapshot={item.snapshot} number={item.bulletin_number} confirmedAt={item.confirmed_at || undefined} preview={item.preview} onConfirm={item.canConfirm && !asOfDate ? confirm : undefined} busy={busy} initialOpen={item.bulletin_number === data.nextNumber} /></div>)}</div> : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-bold text-slate-400">No hay fechas finalizadas para mostrar.</div>}
    <button disabled={busy} onClick={() => refresh()} className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-indigo-700 shadow-2xl ring-2 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"><RefreshCw size={18} className={busy ? 'animate-spin' : ''} /> Actualizar datos</button>
  </section>;
}
