'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import TournamentBulletinCard from '@/app/components/TournamentBulletinCard';
import { confirmDialog } from '@/app/components/AppDialog';
import { confirmBulletin, loadBulletinEditor } from './actions';

export default function AdminBulletinCard({ slug, tournamentId, asOfDate }: { slug: string; tournamentId: string; asOfDate?: string | null }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadBulletinEditor>>>(null);
  const [bulletinNumber, setBulletinNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const refresh = useCallback(async (requestedNumber?: number) => {
    setBusy(true);
    const loaded = await loadBulletinEditor(slug, tournamentId, requestedNumber, asOfDate);
    setData(loaded);
    if (loaded && requestedNumber === undefined) setBulletinNumber(String(loaded.nextNumber));
    setBusy(false);
  }, [asOfDate, slug, tournamentId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function confirm() {
    const number = Number(bulletinNumber);
    if (asOfDate) { toast.error('Quita el filtro de fecha para publicar un boletín.'); return; }
    if (!data || !Number.isSafeInteger(number) || number < 1) { toast.error('Escribe un número de boletín válido.'); return; }
    if (!await confirmDialog({ title: `Confirmar boletín No. ${number}`, description: 'Se guardará exactamente esta información y no podrá editarse ni eliminarse después.', confirmLabel: 'Confirmar y bloquear' })) return;
    setBusy(true);
    const result = await confirmBulletin(slug, tournamentId, number);
    if (!result.success) { setBusy(false); toast.error(result.error); return; }
    toast.success('Boletín oficial confirmado.');
    setData(await loadBulletinEditor(slug, tournamentId));
    setBusy(false);
    setTab('history');
  }

  if (!data) return <div className="flex justify-center py-16 text-indigo-600"><LoaderCircle className="animate-spin" /></div>;
  const selectedNumber = Number(bulletinNumber);
  const previewNumber = Number.isSafeInteger(selectedNumber) && selectedNumber > 0 ? selectedNumber : data.nextNumber;
  const activeTab = asOfDate ? 'history' : tab;
  return <section className="mt-6">
    <div className="mb-5 flex rounded-2xl border border-slate-200 bg-white p-1 sm:w-fit">
      <button disabled={Boolean(asOfDate)} onClick={() => setTab('new')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase ${activeTab === 'new' ? 'bg-indigo-600 text-white' : 'text-slate-500'} disabled:cursor-not-allowed disabled:opacity-40`}><Plus size={15} /> Nuevo boletín</button>
      <button onClick={() => setTab('history')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase ${activeTab === 'history' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><History size={15} /> Historial ({data.published.length})</button>
    </div>
    {activeTab === 'new' ? <>
      <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
        <label htmlFor="bulletin-number" className="block text-[10px] font-black uppercase tracking-widest text-indigo-800">Número oficial del boletín</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input id="bulletin-number" type="number" min={data.nextNumber} step={1} value={bulletinNumber} onChange={(event) => setBulletinNumber(event.target.value)} onBlur={() => { if (Number.isSafeInteger(selectedNumber) && selectedNumber >= data.nextNumber && selectedNumber !== data.previewNumber) refresh(selectedNumber); }} className="w-28 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-center text-lg font-black text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-400" />
          <p className="text-xs font-semibold text-indigo-700">Si omitiste un número, puedes saltarlo. El mínimo permitido ahora es el No. {data.nextNumber}.</p>
        </div>
      </div>
      <TournamentBulletinCard snapshot={data.preview} number={previewNumber} preview={!asOfDate} onConfirm={asOfDate ? undefined : confirm} busy={busy} />
      <button disabled={busy} onClick={() => refresh()} className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-indigo-700 shadow-2xl ring-2 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"><RefreshCw size={18} className={busy ? 'animate-spin' : ''} /> Actualizar datos</button>
    </> : <div className="space-y-4">
      {data.published.map((item) => <TournamentBulletinCard key={item.id} snapshot={item.snapshot} number={item.bulletin_number} confirmedAt={item.confirmed_at} />)}
      {!data.published.length && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-bold text-slate-400">Aún no hay boletines confirmados.</div>}
    </div>}
  </section>;
}
