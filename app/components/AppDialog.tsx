'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, X } from 'lucide-react';

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
};

type PromptOptions = ConfirmOptions & {
  placeholder?: string;
  inputType?: 'text' | 'password';
  minLength?: number;
  initialValue?: string;
};

type DialogRequest =
  | ({ kind: 'confirm' } & ConfirmOptions & { resolve: (value: boolean) => void })
  | ({ kind: 'prompt' } & PromptOptions & { resolve: (value: string | null) => void });

let enqueueDialog: ((request: DialogRequest) => void) | null = null;
const waitingRequests: DialogRequest[] = [];

function enqueue(request: DialogRequest) {
  if (enqueueDialog) enqueueDialog(request);
  else waitingRequests.push(request);
}

export function confirmDialog(options: ConfirmOptions) {
  return new Promise<boolean>((resolve) => enqueue({ kind: 'confirm', tone: 'danger', ...options, resolve }));
}

export function promptDialog(options: PromptOptions) {
  return new Promise<string | null>((resolve) => enqueue({ kind: 'prompt', tone: 'primary', inputType: 'text', ...options, resolve }));
}

export function AppDialogHost() {
  const [requests, setRequests] = useState<DialogRequest[]>(() => waitingRequests.splice(0));
  const [inputValue, setInputValue] = useState('');
  const current = requests[0];

  useEffect(() => {
    enqueueDialog = (request) => setRequests((queued) => [...queued, request]);
    return () => { enqueueDialog = null; };
  }, []);

  useEffect(() => {
    if (!current) return;
    setInputValue(current.kind === 'prompt' ? current.initialValue || '' : '');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (current.kind === 'confirm') current.resolve(false);
        else current.resolve(null);
        setInputValue('');
        setRequests((queued) => queued.slice(1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current]);

  if (!current) return null;

  const close = () => {
    if (current.kind === 'confirm') current.resolve(false);
    else current.resolve(null);
    setInputValue('');
    setRequests((queued) => queued.slice(1));
  };

  const submit = () => {
    if (current.kind === 'prompt') {
      if (inputValue.trim().length < (current.minLength || 0)) return;
      current.resolve(inputValue.trim());
    } else {
      current.resolve(true);
    }
    setInputValue('');
    setRequests((queued) => queued.slice(1));
  };

  const isDanger = current.tone === 'danger';
  const promptInvalid = current.kind === 'prompt' && inputValue.trim().length < (current.minLength || 0);

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[2rem] sm:p-8">
        <div className={`absolute inset-x-0 top-0 h-1.5 ${isDanger ? 'bg-red-600' : 'bg-blue-600'}`} />
        <button type="button" onClick={close} aria-label="Cerrar" className="absolute right-5 top-5 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
          <X size={18} />
        </button>

        <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${isDanger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
          {current.kind === 'prompt' ? <KeyRound size={26} /> : <AlertTriangle size={26} />}
        </div>
        <h2 id="app-dialog-title" className="pr-10 text-2xl font-black uppercase tracking-tight text-slate-900">{current.title}</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{current.description}</p>

        {current.kind === 'prompt' && (
          <div className="mt-5">
            <input
              autoFocus
              type={current.inputType}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !promptInvalid) submit(); }}
              placeholder={current.placeholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
            {current.minLength && inputValue.length > 0 && promptInvalid ? (
              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-red-500">Mínimo {current.minLength} caracteres</p>
            ) : null}
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={close} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200">
            {current.cancelLabel || 'Cancelar'}
          </button>
          <button type="button" disabled={promptInvalid} onClick={submit} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40 ${isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {current.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
}
