'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, FileText, X } from 'lucide-react';
import TournamentBulletinCard from '@/app/components/TournamentBulletinCard';

export default function DelegateBulletinsCard({ bulletins }: { bulletins: any[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(bulletins[0]?.id || '');
  const selected = bulletins.find((bulletin) => bulletin.id === selectedId) || bulletins[0];
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [open]);
  if (!selected) return null;

  return <>
    <button type="button" onClick={() => setOpen(true)} className="group flex min-h-52 w-full items-center gap-5 rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-lg">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><FileText size={30} /></span>
      <span className="min-w-0 flex-1"><span className="text-[9px] font-black uppercase tracking-[.22em] text-indigo-600">{bulletins.length} {bulletins.length === 1 ? 'publicación oficial' : 'publicaciones oficiales'}</span><span className="mt-1 block text-xl font-black uppercase text-slate-900">Boletín del torneo</span><span className="mt-2 block text-xs font-semibold text-slate-500">Consulta resultados, posiciones, disciplina y deudas.</span></span>
      <ArrowRight className="shrink-0 text-indigo-400 transition group-hover:translate-x-1" />
    </button>

    {open && createPortal(<div className="fixed inset-0 z-[9999] flex items-stretch justify-center overflow-hidden bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="delegate-bulletins-title" className="flex h-[100dvh] min-h-0 w-full max-w-6xl flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-[92dvh] sm:rounded-3xl">
        <header className="flex shrink-0 items-center justify-between gap-3 bg-slate-950 px-4 py-3 text-white sm:px-5 sm:py-4"><div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[.2em] text-indigo-300 sm:text-[9px]">Historial oficial</p><h2 id="delegate-bulletins-title" className="truncate text-base font-black uppercase sm:text-xl">Boletín del torneo</h2></div><button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-xl bg-white/10 p-2.5 hover:bg-white/20 sm:p-3" aria-label="Cerrar boletines"><X size={20} /></button></header>
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2.5 sm:p-4">{bulletins.map((bulletin) => <button key={bulletin.id} onClick={() => setSelectedId(bulletin.id)} className={`shrink-0 rounded-xl px-3 py-2 text-[8px] font-black uppercase tracking-wider sm:px-4 sm:py-2.5 sm:text-[9px] ${selected.id === bulletin.id ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}>Boletín {bulletin.bulletin_number}</button>)}</div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2.5 sm:p-6"><TournamentBulletinCard key={selected.id} snapshot={selected.snapshot} number={selected.bulletin_number} confirmedAt={selected.confirmed_at} /></div>
      </section>
    </div>, document.body)}
  </>;
}
