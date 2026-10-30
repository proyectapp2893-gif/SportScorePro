'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  detail?: string;
  id?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: 'blue' | 'cyan' | 'emerald' | 'amber' | 'slate';
};

export default function DelegateModule({ title, subtitle, detail, id, children, defaultOpen = false, tone = 'blue' }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = id ? `${id}-content` : undefined;
  return <section id={id} className={`delegate-accordion delegate-accordion-${tone} min-w-0 scroll-mt-28`}>
    <button id={id ? `${id}-toggle` : undefined} type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-controls={contentId} className="delegate-accordion-summary flex min-h-20 w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left sm:px-6">
      <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">{subtitle || 'Portal del delegado'}</span><span className="mt-1 block text-base font-black uppercase leading-tight text-slate-950 sm:text-lg">{title}</span>{detail && <span className="mt-1 block text-[11px] font-semibold text-slate-500">{detail}</span>}</span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}><ChevronDown size={19} /></span>
    </button>
    {isOpen && <div id={contentId} className="delegate-accordion-content min-w-0 border-t border-slate-200/70 p-3 sm:p-5">{children}</div>}
  </section>;
}
