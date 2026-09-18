'use server';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { buildBulletinSnapshot, getAvailableBulletinRounds, getNextUnpublishedRound, hydrateDynamicBulletinFields, stampSuspensionOrigins } from '@/app/lib/tournaments/bulletin';
import { revalidatePath } from 'next/cache';
import { nextDate } from '@/app/lib/date-filter';

async function owned(slug:string,tournamentId:string){if(!(await hasAdminSession(slug)))return null;const clientId=await getClientIdBySlug(slug);const db=createServerSupabaseAdminClient();const {data}=await db.from('tournaments').select('id').eq('id',tournamentId).eq('client_id',clientId||'').maybeSingle();return data?db:null}
export async function loadBulletinEditor(slug:string,tournamentId:string,asOfDate?:string|null){
  const db=await owned(slug,tournamentId); if(!db)return null;
  let bulletinsQuery=db.from('tournament_bulletins').select('id,bulletin_number,confirmed_at,snapshot').eq('tournament_id',tournamentId).order('bulletin_number',{ascending:false});
  if(asOfDate)bulletinsQuery=bulletinsQuery.lt('confirmed_at',`${nextDate(asOfDate)}T00:00:00-05:00`);
  const [{data:published},availableRounds,liveSnapshot]=await Promise.all([bulletinsQuery,getAvailableBulletinRounds(db,tournamentId,asOfDate),buildBulletinSnapshot(db,tournamentId,asOfDate)]);
  const bulletins=published||[],publishedNumbers=bulletins.map((item:any)=>Number(item.bulletin_number));
  const nextNumber=getNextUnpublishedRound(availableRounds,publishedNumbers);
  const entries:any[]=[];
  let previousSnapshot:any=undefined;
  for(const round of availableRounds){
    const publishedBulletin=bulletins.find((item:any)=>Number(item.bulletin_number)===round);
    if(publishedBulletin){
      const snapshot=hydrateDynamicBulletinFields(publishedBulletin.snapshot,liveSnapshot,round);
      entries.push({...publishedBulletin,bulletin_number:round,snapshot,preview:false,canConfirm:false});
      previousSnapshot=publishedBulletin.snapshot;
      continue;
    }
    const rawSnapshot=await buildBulletinSnapshot(db,tournamentId,asOfDate,round);
    const snapshot=hydrateDynamicBulletinFields(stampSuspensionOrigins(rawSnapshot,round,previousSnapshot),rawSnapshot,round);
    entries.push({id:`draft-${round}`,bulletin_number:round,confirmed_at:null,snapshot,preview:true,canConfirm:round===nextNumber});
    previousSnapshot=snapshot;
  }
  return {entries,published:entries.filter((item:any)=>!item.preview),preview:entries.find((item:any)=>item.bulletin_number===nextNumber)?.snapshot||null,nextNumber,availableRounds};
}
export async function confirmBulletin(slug:string,tournamentId:string,expectedNumber:number){const db=await owned(slug,tournamentId);if(!db)return{success:false as const,error:'Sesión no válida.'};const {data:published}=await db.from('tournament_bulletins').select('bulletin_number,snapshot').eq('tournament_id',tournamentId).order('bulletin_number',{ascending:false});const bulletins=published||[],availableRounds=await getAvailableBulletinRounds(db,tournamentId),nextNumber=getNextUnpublishedRound(availableRounds,bulletins.map((item:any)=>Number(item.bulletin_number)));if(nextNumber===null)return{success:false as const,error:'No hay una nueva fecha finalizada pendiente por publicar.'};if(expectedNumber!==nextNumber)return{success:false as const,error:`El borrador disponible es el boletín No. ${nextNumber}. Actualiza la página.`};const previous=bulletins.find((item:any)=>Number(item.bulletin_number)<nextNumber);let snapshot=await buildBulletinSnapshot(db,tournamentId,null,nextNumber);snapshot=stampSuspensionOrigins(snapshot,nextNumber,previous?.snapshot);if(!snapshot.categories.length)return{success:false as const,error:'El torneo no tiene categorías para publicar.'};const {error}=await db.from('tournament_bulletins').insert({tournament_id:tournamentId,bulletin_number:nextNumber,snapshot});if(error)return{success:false as const,error:error.code==='23505'?'Ese número de boletín ya fue utilizado. Actualiza la página.':'No se pudo confirmar el boletín.'};revalidatePath(`/${slug}/admin`);revalidatePath(`/${slug}/delegado`);return{success:true as const}}
