'use client';

import { CalendarClock, RotateCcw } from 'lucide-react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { AS_OF_DATE_PARAM, normalizeAsOfDate } from '@/app/lib/date-filter';

export default function AsOfDateFilter({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const pathname = usePathname();
  const routeParams = useParams<{ slug?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDate = normalizeAsOfDate(searchParams.get(AS_OF_DATE_PARAM));
  const storageKey = routeParams.slug ? `sportscore-as-of-date-${routeParams.slug}` : '';
  const isOperationalRoute = pathname.includes('/admin/mesa') || pathname.includes('/planillero') || (!alwaysShow && pathname.includes('/admin/boletines')) || pathname.startsWith('/tv');

  useEffect(() => {
    if (!storageKey) return;
    const storedDate = normalizeAsOfDate(window.localStorage.getItem(storageKey));
    if (selectedDate) {
      window.localStorage.setItem(storageKey, selectedDate);
    } else if (!searchParams.has(AS_OF_DATE_PARAM) && storedDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set(AS_OF_DATE_PARAM, storedDate);
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [pathname, router, searchParams, selectedDate, storageKey]);

  function changeDate(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const date = normalizeAsOfDate(value);
    if (storageKey) {
      if (date) window.localStorage.setItem(storageKey, date);
      else window.localStorage.removeItem(storageKey);
    }
    if (date) params.set(AS_OF_DATE_PARAM, date);
    else params.delete(AS_OF_DATE_PARAM);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function clearDate() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(AS_OF_DATE_PARAM);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  if (isOperationalRoute) return null;
  return <div className="sticky top-0 z-[480] border-b border-blue-900/60 bg-slate-900 px-3 py-2 text-white shadow-lg sm:px-6">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 sm:gap-3">
      <CalendarClock size={16} className="text-cyan-300" />
      <span className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Ver información hasta</span>
      <input aria-label="Filtrar información hasta una fecha" type="date" value={selectedDate || ''} onChange={(event) => changeDate(event.target.value)} className="h-8 rounded-lg border border-white/15 bg-white/10 px-2 text-[10px] font-bold text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
      {selectedDate ? <>
        <span className="text-[9px] font-bold uppercase text-slate-400">Solo jornadas registradas hasta esa fecha</span>
        <button type="button" onClick={clearDate} className="ml-auto flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10"><RotateCcw size={12} /> Actual</button>
      </> : <span className="text-[9px] font-bold uppercase text-slate-500">Vista actual</span>}
    </div>
  </div>;
}
