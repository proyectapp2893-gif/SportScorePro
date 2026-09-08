'use client';

import { useEffect, useRef, useState } from 'react';
import { Save, Upload, X, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { openRosterPlayerDocument, updateRosterPlayer, uploadRosterPlayerDocument } from './actions';

type Player = { id: string; name: string; identity_number?: string; shirt_number?: number; birth_date?: string; birth_year?: number; vinculo?: string; relationship_detail?: string };
type Document = { id: string; player_id: string; document_type: string; original_filename?: string; status: string };
const documentTypes = [['FACE_PHOTO', 'Foto del jugador'], ['IDENTITY_FRONT', 'Documento de identidad · frente'], ['IDENTITY_BACK', 'Documento de identidad · reverso']] as const;

export default function EditPlayerModal({ slug, player, documents, onClose, onRefresh }: {
  slug: string; player: Player; documents: Document[]; onClose: () => void; onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: player.name || '', identityNumber: player.identity_number || '', shirtNumber: String(player.shirt_number ?? ''), birthDate: player.birth_date || '', birthYear: String(player.birth_year ?? ''), vinculo: player.vinculo || '', relationshipDetail: player.relationship_detail || '' });
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [preview, setPreview] = useState<{ url: string; pdf: boolean } | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const field = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await updateRosterPlayer(slug, player.id, { ...form, shirtNumber: form.shirtNumber ? Number(form.shirtNumber) : null, birthYear: form.birthYear ? Number(form.birthYear) : null });
      if (!result.success) { toast.error(result.error); return; }
      await onRefresh(); toast.success('Datos del jugador actualizados');
    } catch { toast.error('No se pudieron guardar los datos. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }

  async function upload(type: string) {
    const file = files[type]; if (!file) return;
    if (!file.size || file.size > 5 * 1024 * 1024) { toast.error('El archivo debe pesar máximo 5 MB y no estar vacío.'); return; }
    setBusy(true);
    try {
      const result = await uploadRosterPlayerDocument(slug, player.id, type, file);
      if (!result.success) { toast.error(result.error); return; }
      setFiles(current => ({ ...current, [type]: undefined }));
      setPreview(null); await onRefresh(); toast.success('Archivo guardado. Pendiente de revisión.');
    } catch { toast.error('No se pudo subir el archivo. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }

  async function view(document: Document) {
    setBusy(true);
    try {
      const result = await openRosterPlayerDocument(slug, document.id);
      if (!result.success) { toast.error(result.error); return; }
      setPreview({ url: result.data.url, pdf: Boolean(document.original_filename?.toLowerCase().endsWith('.pdf')) });
    } catch { toast.error('No se pudo abrir el archivo.'); }
    finally { setBusy(false); }
  }

  const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900';
  return <dialog ref={dialog} aria-labelledby="edit-player-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,760px)] overflow-y-auto rounded-3xl bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 sm:p-7">
    <div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="edit-player-title" className="text-xl font-black">Editar jugador</h2><p className="text-sm text-slate-500">{player.name}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar editor" className="rounded-xl p-2 hover:bg-slate-100 disabled:opacity-40"><X /></button></div>
    <form onSubmit={save}>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
        <label className="text-xs font-bold sm:col-span-2">Nombre completo<input autoFocus required value={form.name} onChange={event => field('name', event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold">Número de identificación<input inputMode="numeric" value={form.identityNumber} onChange={event => field('identityNumber', event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold">Dorsal<input type="number" min="1" max="999" step="1" value={form.shirtNumber} onChange={event => field('shirtNumber', event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold">Fecha de nacimiento<input type="date" value={form.birthDate} onChange={event => { field('birthDate', event.target.value); if (event.target.value) field('birthYear', event.target.value.slice(0, 4)); }} className={inputClass} /></label>
        <label className="text-xs font-bold">Año de nacimiento<input type="number" min="1900" max={new Date().getFullYear()} disabled={Boolean(form.birthDate)} value={form.birthYear} onChange={event => field('birthYear', event.target.value)} className={inputClass} /><span className="mt-1 block font-normal text-slate-500">Se calcula con la fecha; puedes indicar solo el año si no conoces la fecha completa.</span></label>
        <label className="text-xs font-bold">Vínculo<input list="admin-player-relationships" value={form.vinculo} onChange={event => field('vinculo', event.target.value)} className={inputClass} /><datalist id="admin-player-relationships">{['ALUMNO', 'PADRE DE FAMILIA', 'EX-ALUMNO', 'COLABORADOR'].map(value => <option key={value} value={value} />)}</datalist></label>
        <label className="text-xs font-bold">Detalle del vínculo<input value={form.relationshipDetail} onChange={event => field('relationshipDetail', event.target.value)} placeholder="Estudiante, año de promoción u otro detalle" className={inputClass} /></label>
        <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-sm font-bold text-white sm:col-span-2"><Save size={17} />Guardar datos</button>
      </fieldset>
    </form>
    <div className="mt-7 border-t border-slate-200 pt-5"><h3 className="font-black">Foto y documentos</h3><p className="mt-1 text-xs text-slate-500">Cada archivo se guarda con su botón. Máximo 5 MB. Los archivos nuevos quedan pendientes de revisión.</p>
      {documentTypes.map(([type, label]) => {
        const current = documents.find(document => document.player_id === player.id && document.document_type === type);
        return <div key={type} className="mt-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3"><label htmlFor={`file-${type}`} className="text-sm font-bold">{label}</label>{current && <button type="button" disabled={busy} onClick={() => view(current)} className="flex items-center gap-1 text-xs font-bold text-blue-600"><Eye size={16} />Ver actual</button>}</div>
          <p className="mt-1 break-all text-xs text-slate-500">{current ? current.original_filename : 'Sin archivo'}</p>
          <input key={`${type}-${current?.id}-${current?.original_filename}-${files[type] ? 'selected' : 'empty'}`} id={`file-${type}`} type="file" disabled={busy} accept={type === 'FACE_PHOTO' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} onChange={event => setFiles(values => ({ ...values, [type]: event.target.files?.[0] }))} className="mt-3 w-full text-xs" />
          {files[type] && <p className="mt-2 break-all text-xs">Seleccionado: {files[type]?.name}</p>}
          <button type="button" disabled={busy || !files[type]} onClick={() => upload(type)} className="mt-3 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"><Upload size={15} />{current ? 'Reemplazar archivo' : 'Subir archivo'}</button>
        </div>;
      })}
      {preview && <div className="mt-4 rounded-xl border border-slate-200 p-3"><button type="button" onClick={() => setPreview(null)} className="mb-2 text-xs font-bold text-blue-600">Cerrar vista del archivo</button>{preview.pdf ? <iframe src={preview.url} title="Documento del jugador" className="h-96 w-full" /> : <img src={preview.url} alt="Archivo del jugador" className="max-h-96 w-full object-contain" />}</div>}
    </div>
    <button type="button" disabled={busy} onClick={onClose} className="mt-5 w-full rounded-xl border border-slate-200 p-3 text-sm font-bold">Cerrar</button>
  </dialog>;
}
