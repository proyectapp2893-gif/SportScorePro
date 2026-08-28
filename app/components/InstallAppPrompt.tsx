'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'sportscore:install-prompt-dismissed:v1';

export function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone || window.localStorage.getItem(DISMISSED_KEY) === '1') return;

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(ios);
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    if (ios) setVisible(true);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') dismiss();
    else setInstallEvent(null);
  };

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border border-white/15 bg-slate-950 p-4 text-white shadow-2xl shadow-slate-950/30" role="dialog" aria-label="Instalar SportScore Pro">
      <button type="button" onClick={dismiss} className="absolute right-3 top-3 rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="Cerrar invitación de instalación"><X size={18} /></button>
      <div className="flex items-center gap-3 pr-6">
        <img src="/apple-icon.png" alt="" width={48} height={48} className="rounded-xl" />
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">SportScore Pro</p><h2 className="mt-1 text-base font-black">Llévala como una app</h2></div>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-300">Accede más rápido al torneo, con pantalla completa y sin la barra del navegador.</p>
      {isIos ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-200"><Share size={16} className="shrink-0 text-blue-300" />Toca <strong>Compartir</strong> y luego <strong>Agregar a Inicio</strong>.</p>
      ) : (
        <button type="button" onClick={install} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black uppercase tracking-wider transition hover:bg-blue-500 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><Download size={16} />Instalar aplicación</button>
      )}
    </aside>
  );
}
