import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import AdminBulletinCard from './AdminBulletinCard';

export const dynamic = 'force-dynamic';

export default async function BulletinsPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{tournament?:string}>}){
  const {slug}=await params;const {tournament:tournamentId}=await searchParams;
  if(!(await hasAdminSession(slug))||!tournamentId)redirect(`/${slug}/admin`);
  const clientId=await getClientIdBySlug(slug);const db=createServerSupabaseAdminClient();
  const {data:tournament}=await db.from('tournaments').select('id,name').eq('id',tournamentId).eq('client_id',clientId||'').maybeSingle();
  if(!tournament)redirect(`/${slug}/admin`);
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6"><div className="mx-auto max-w-6xl"><Link href={`/${slug}/admin?tournament=${tournament.id}`} className="mb-6 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500"><ArrowLeft size={16}/> Volver al panel</Link><header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8"><p className="text-[9px] font-black uppercase tracking-[.22em] text-violet-300">Publicaciones oficiales</p><h1 className="mt-1 text-3xl font-black uppercase">Boletines del torneo</h1><p className="mt-2 text-sm font-semibold text-slate-400">{tournament.name}</p></header><AdminBulletinCard slug={slug} tournamentId={tournament.id}/></div></main>;
}
