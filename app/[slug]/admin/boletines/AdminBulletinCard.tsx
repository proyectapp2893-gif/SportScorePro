'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import TournamentBulletinCard from '@/app/components/TournamentBulletinCard';
import { confirmDialog } from '@/app/components/AppDialog';
import { confirmBulletin, loadBulletinEditor } from './actions';

export default function AdminBulletinCard({ slug, tournamentId, asOfDate }: { slug: string; tournamentId: string; asOfDate?: string | null }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadBulletinEditor>>>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const refresh = useCallback(async () => {
    setBusy(true);
    const loaded = await loadBulletinEditor(slug, tournamentId, asOfDate);
    setData(loaded);
    setBusy(false);
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
    setTab('history');
  }

  if (!data) return <div className="flex justify-center py-16 text-indigo-600"><LoaderCircle className="animate-spin" /></div>;
  const activeTab = asOfDate ? 'history' : tab;
  return <section className="mt-6">
    <div className="mb-5 flex rounded-2xl border border-slate-200 bg-white p-1 sm:w-fit">
      <button disabled={Boolean(asOfDate)} onClick={() => setTab('new')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase ${activeTab === 'new' ? 'bg-indigo-600 text-white' : 'text-slate-500'} disabled:cursor-not-allowed disabled:opacity-40`}><Plus size={15} /> Nuevo boletín</button>
      <button onClick={() => setTab('history')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase ${activeTab === 'history' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><History size={15} /> Historial ({data.published.length})</button>
    </div>
    {activeTab === 'new' ? <>
      {data.preview && data.nextNumber !== null ? <>
        <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">Borrador automático · Fecha {data.nextNumber}</p><p className="mt-1 text-xs font-semibold text-indigo-700">Se construyó con los partidos y eventos finalizados de esta fecha. Solo se publicará cuando lo confirmes.</p></div>
        <TournamentBulletinCard snapshot={data.preview} number={data.nextNumber} preview onConfirm={confirm} busy={busy} />
      </> : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-bold text-slate-400">No hay fechas finalizadas pendientes por convertir en boletín.</div>}
      <button disabled={busy} onClick={() => refresh()} className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-indigo-700 shadow-2xl ring-2 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"><RefreshCw size={18} className={busy ? 'animate-spin' : ''} /> Actualizar datos</button>
    </> : <div className="space-y-4">
      {data.published.map((item) => <TournamentBulletinCard key={item.id} snapshot={item.snapshot} number={item.bulletin_number} confirmedAt={item.confirmed_at} />)}
      {!data.published.length && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-bold text-slate-400">Aún no hay boletines confirmados.</div>}
    </div>}
  </section>;
}
