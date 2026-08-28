'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, ChevronDown, LayoutDashboard, Trophy } from 'lucide-react';
import { supabase } from '@/app/supabase';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import { loadDemoDatabase } from '@/app/lib/demo/database';
import { adminDashboardPath } from './operations/routes';
import { resolveTournamentSelection, tournamentStorageKey } from './operations/tournament-selection';

type TournamentOption = { id: string; name: string; is_active?: boolean };

export default function AdminTournamentContext() {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [institution, setInstitution] = useState('');
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('tournament') || '');
  const isDashboard = pathname === `/${slug}/admin`;

  useEffect(() => {
    if (isDashboard) return;
    const load = async () => {
      if (slug === DEMO_SLUG) {
        const db = loadDemoDatabase();
        setInstitution(db.clients[0]?.name || 'Demo');
        setTournaments(db.tournaments.map((item) => ({ id: String(item.id), name: String(item.name), is_active: Boolean(item.is_active) })));
        const candidate = resolveTournamentSelection(
          db.tournaments.map((item) => ({ id: String(item.id), isActive: Boolean(item.is_active) })),
          searchParams.get('tournament'),
          window.localStorage.getItem(tournamentStorageKey(slug)),
        );
        setSelectedId(candidate);
        if (candidate) window.localStorage.setItem(tournamentStorageKey(slug), candidate);
        return;
      }
      const { data: client } = await supabase.from('clients').select('id, name').eq('slug', slug).eq('is_active', true).maybeSingle();
      if (!client) return;
      const { data } = await supabase.from('tournaments').select('id, name, is_active').eq('client_id', client.id).order('created_at', { ascending: false });
      const options = data || [];
      setInstitution(client.name);
      setTournaments(options);
      const candidate = resolveTournamentSelection(
        options.map((item) => ({ id: item.id, isActive: item.is_active })),
        searchParams.get('tournament'),
        window.localStorage.getItem(tournamentStorageKey(slug)),
      );
      setSelectedId(candidate);
      if (candidate) window.localStorage.setItem(tournamentStorageKey(slug), candidate);
    };
    load();
  }, [isDashboard, searchParams, slug]);

  if (isDashboard || !tournaments.length) return null;
  const selected = tournaments.find((item) => item.id === selectedId);
  const changeTournament = (id: string) => {
    if (!tournaments.some((item) => item.id === id)) return;
    setSelectedId(id);
    window.localStorage.setItem(tournamentStorageKey(slug), id);
    router.push(adminDashboardPath(slug, id));
  };

  return <div className="sticky top-0 z-[90] border-b border-slate-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur-xl sm:px-6">
    <div className="mx-auto flex max-w-6xl items-center gap-3">
      <button type="button" onClick={() => router.push(adminDashboardPath(slug, selectedId))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white transition hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200" aria-label="Volver al Centro de Operaciones"><LayoutDashboard size={18} /></button>
      <div className="hidden min-w-0 items-center gap-2 border-r border-slate-200 pr-4 md:flex"><Building2 className="shrink-0 text-slate-400" size={16} /><span className="max-w-44 truncate text-[9px] font-black uppercase tracking-widest text-slate-500">{institution}</span></div>
      <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[.2em] text-blue-600"><Trophy size={12} /> Torneo en gestión</p><p className="truncate text-xs font-black uppercase text-slate-950 sm:text-sm">{selected?.name || 'Seleccionar torneo'}</p></div>
      {selected && <span className={`hidden rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-widest sm:inline-flex ${selected.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{selected.is_active ? 'En curso' : 'Finalizado'}</span>}
      <label className="relative shrink-0"><span className="sr-only">Cambiar torneo</span><select value={selectedId} onChange={(event) => changeTournament(event.target.value)} className="h-11 max-w-[150px] appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-[9px] font-black uppercase text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:max-w-[220px]">{tournaments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-3.5 text-slate-400" size={15} /></label>
    </div>
  </div>;
}
