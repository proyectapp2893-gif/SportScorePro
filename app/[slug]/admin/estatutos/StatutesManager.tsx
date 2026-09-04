'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, Download, FileText, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/app/components/AppDialog';
import { deleteTournamentStatutes, getAdminStatutesUrl, uploadTournamentStatutes } from './actions';

type StatutesDocument = { original_filename: string; file_size: number; uploaded_at: string };

export default function StatutesManager({ slug, tournament, document }: { slug: string; tournament: { id: string; name: string }; document: StatutesDocument | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    const result = await uploadTournamentStatutes(slug, tournament.id, file);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(document ? 'Estatutos reemplazados.' : 'Estatutos publicados.');
    router.refresh();
  }

  async function openDocument() {
    setBusy(true);
    const result = await getAdminStatutesUrl(slug, tournament.id);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  async function remove() {
    if (!await confirmDialog({ title: 'Retirar estatutos', description: 'El PDF dejará de estar disponible para todos los delegados de este torneo.', confirmLabel: 'Retirar PDF' })) return;
    setBusy(true);
    const result = await deleteTournamentStatutes(slug, tournament.id);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success('Documento retirado.');
    router.refresh();
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-4xl">
      <button onClick={() => router.push(`/${slug}/admin?tournament=${tournament.id}`)} className="mb-6 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-blue-600"><ArrowLeft size={16} /> Volver al panel</button>
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <header className="bg-slate-950 p-6 text-white sm:p-8"><p className="text-[10px] font-black uppercase tracking-[.24em] text-blue-400">Preparación del torneo</p><h1 className="mt-1 text-3xl font-black uppercase tracking-tight">Estatutos del torneo</h1><p className="mt-2 text-sm font-semibold text-slate-400">{tournament.name}</p></header>
        <div className="p-6 sm:p-8">
          {document ? <div className="flex flex-col gap-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm"><FileText size={28} /></span>
            <div className="min-w-0 flex-1"><p className="truncate font-black uppercase text-slate-900">{document.original_filename}</p><p className="mt-1 text-xs font-bold text-slate-500">{(document.file_size / 1024 / 1024).toFixed(2)} MB · Publicado {new Date(document.uploaded_at).toLocaleString('es-CO')}</p></div>
            <div className="flex gap-2"><button disabled={busy} onClick={openDocument} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black uppercase text-blue-700 shadow-sm disabled:opacity-50"><Download size={16} /> Abrir</button><button disabled={busy} onClick={remove} aria-label="Retirar PDF" className="rounded-xl bg-red-100 p-3 text-red-600 disabled:opacity-50"><Trash2 size={17} /></button></div>
          </div> : <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center"><FileText className="mx-auto text-slate-300" size={44} /><p className="mt-4 font-black uppercase text-slate-700">Aún no hay estatutos publicados</p><p className="mt-2 text-sm font-semibold text-slate-500">Carga el PDF oficial para habilitarlo en el portal de delegados.</p></div>}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { upload(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          <button disabled={busy} onClick={() => inputRef.current?.click()} className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Upload size={18} />} {document ? 'Reemplazar PDF' : 'Cargar PDF'} · máximo 5 MB</button>
        </div>
      </section>
    </div>
  </main>;
}
