'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { DEMO_SLUG } from './config';
import { resetDemoDatabase } from './database';

export default function DemoNavigation() {
  const pathname = usePathname();
  if (!pathname.startsWith(`/${DEMO_SLUG}/`)) return null;
  const links = [
    ['Administración', `/${DEMO_SLUG}/admin`],
    ['Portal delegados', `/${DEMO_SLUG}/delegado`],
    ['Resultados', `/${DEMO_SLUG}/resultados`],
  ];
  return <div className="sticky top-0 z-[500] flex min-h-12 items-center gap-2 overflow-x-auto border-b border-blue-400/30 bg-slate-950 px-3 py-2 text-white shadow-xl sm:px-6">
    <span className="mr-auto flex shrink-0 items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-300"><ShieldCheck size={15}/> Modo demostración · datos locales</span>
    {links.map(([label, href]) => <Link key={href} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${pathname.startsWith(href) ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>{label}</Link>)}
    <button type="button" onClick={() => { resetDemoDatabase(); window.location.href = `/${DEMO_SLUG}/admin`; }} className="flex shrink-0 items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-white/10"><RotateCcw size={13}/> Reiniciar</button>
  </div>;
}
