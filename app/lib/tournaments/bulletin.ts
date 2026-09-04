/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '@/app/lib/sports/rules';
import { normalizeDoubleCautions } from '@/app/lib/discipline/double-caution';

export type BulletinSnapshot = { categories: Array<{ id:string; name:string; sport:string; fairPlayEnabled:boolean; round:number; results:any[]; standings:any[]; scorers:any[]; cards:any[]; debts:any[]; sanctions:any[] }> };

export function hydrateDynamicBulletinFields(snapshot:BulletinSnapshot,live:BulletinSnapshot,currentBulletinNumber:number):BulletinSnapshot {
  return {...snapshot,categories:snapshot.categories.map(category=>{const current=live.categories.find(item=>item.id===category.id);return {...category,debts:current?.debts||[],sanctions:category.sanctions.map((sanction:any)=>{const active=current?.sanctions.find((item:any)=>item.id===sanction.id);const originalMatches=Number(sanction.originalMatches??sanction.matches??0);const startBulletinNumber=Number(sanction.startBulletinNumber??1);return {...sanction,...(active?{comment:active.comment}:{}),originalMatches,startBulletinNumber,matches:Math.max(0,originalMatches-(currentBulletinNumber-startBulletinNumber))}}).filter((sanction:any)=>sanction.matches>0)}})};
}

export function stampSuspensionOrigins(snapshot:BulletinSnapshot,bulletinNumber:number,previous?:BulletinSnapshot):BulletinSnapshot {
  return {...snapshot,categories:snapshot.categories.map(category=>({...category,sanctions:category.sanctions.map((sanction:any)=>{const old=previous?.categories.find(item=>item.id===category.id)?.sanctions.find((item:any)=>item.id===sanction.id);return {...sanction,originalMatches:Number(old?.originalMatches??old?.matches??sanction.matches??0),startBulletinNumber:Number(old?.startBulletinNumber??bulletinNumber)}})}))};
}

export async function buildBulletinSnapshot(db:any, tournamentId:string):Promise<BulletinSnapshot> {
  const {data:tournament}=await db.from('tournaments').select('fair_play_enabled,fp_starting_points,fp_yellow_deduction,fp_red_deduction,fine_yellow_amount,fine_red_amount').eq('id',tournamentId).maybeSingle();
  const { data: categoryData } = await db.from('categories').select('id,name,sports(name)').eq('tournament_id', tournamentId);
  const categories=categoryData||[];
  const categoryIds=categories.map((c:any)=>c.id); if(!categoryIds.length)return {categories:[]};
  const [{data:teamData},{data:dayData}]=await Promise.all([db.from('teams').select('id,name,category_id,fair_play_points').in('category_id',categoryIds),db.from('matchdays').select('id,category_id,round_number').in('category_id',categoryIds)]);
  const teams=teamData||[], days=dayData||[];
  const dayIds=days.map((d:any)=>d.id); const {data:matchData}=dayIds.length?await db.from('matches').select('id,matchday_id,status,home_score,away_score,home_sets,away_sets,home_team_id,away_team_id').in('matchday_id',dayIds):{data:[]};
  const matches=matchData||[];
  const matchIds=matches.map((m:any)=>m.id); const {data:eventData}=matchIds.length?await db.from('match_events').select('id,match_id,team_id,player_id,event_type,fine_status,created_at,period,match_second,minute_record,players(name)').in('match_id',matchIds):{data:[]};
  const events=eventData||[];
  if(events.length){const {data:disciplinaryData}=await db.from('match_events').select('id,disciplinary_comment,suspension_matches').in('id',events.map((event:any)=>event.id));const disciplinaryById=new Map<string,any>((disciplinaryData||[]).map((event:any)=>[event.id,event]));events.forEach((event:any)=>Object.assign(event,disciplinaryById.get(event.id)||{}));}
  const teamById=new Map<string,any>(teams.map((t:any)=>[t.id,t])); const dayById=new Map<string,any>(days.map((d:any)=>[d.id,d])); const matchById=new Map<string,any>(matches.map((m:any)=>[m.id,m]));
  return {categories:categories.map((category:any)=>{
    const categoryTeams=teams.filter((t:any)=>t.category_id===category.id), ids=new Set(categoryTeams.map((t:any)=>t.id));
    const categoryMatches=matches.filter((m:any)=>dayById.get(m.matchday_id)?.category_id===category.id), finished=categoryMatches.filter((m:any)=>m.status==='FINISHED');
    const round=Math.max(0,...finished.map((m:any)=>Number(dayById.get(m.matchday_id)?.round_number||0))); const rules=getSportRules(category.sports?.name);
    const rows=new Map<string,any>(categoryTeams.map((t:any)=>[t.id,{id:t.id,name:t.name,fair_play_points:t.fair_play_points??Number(tournament?.fp_starting_points||0),played:0,won:0,drawn:0,lost:0,goals_for:0,goals_against:0,points:0}]));
    finished.forEach((m:any)=>{const h:any=rows.get(m.home_team_id),a:any=rows.get(m.away_team_id);if(!h||!a)return;const s=getMatchScoreForStandings(m,rules),p=getResultPoints(s.home,s.away,rules);h.played++;a.played++;h.points+=p.home;a.points+=p.away;if(s.countsForScoreColumns){h.goals_for+=s.home;h.goals_against+=s.away;a.goals_for+=s.away;a.goals_against+=s.home}if(s.home>s.away){h.won++;a.lost++}else if(s.away>s.home){a.won++;h.lost++}else{h.drawn++;a.drawn++}});
    const categoryEvents=events.filter((e:any)=>ids.has(e.team_id));
    const normalizedCards=normalizeDoubleCautions(categoryEvents.filter((e:any)=>['YELLOW','RED'].includes(e.event_type)));
    const scorerMap=new Map(), debtMap=new Map();
    categoryEvents.forEach((e:any)=>{if(['GOAL','BASKET_1','BASKET_2','BASKET_3'].includes(e.event_type)&&e.player_id){const x=scorerMap.get(e.player_id)||{id:e.player_id,name:e.players?.name||'Jugador',team:teamById.get(e.team_id)?.name||'Equipo',total:0};x.total+=e.event_type==='BASKET_3'?3:e.event_type==='BASKET_2'?2:1;scorerMap.set(e.player_id,x)}});
    normalizedCards.forEach((e:any)=>{if(e.fine_status!=='PAID'){const amount=e.event_type==='RED'?Number(tournament?.fine_red_amount||0):Number(tournament?.fine_yellow_amount||0);debtMap.set(e.team_id,(debtMap.get(e.team_id)||0)+amount)}});
    if(tournament?.fair_play_enabled){const deductions=new Map<string,number>();normalizedCards.filter((e:any)=>['LIVE','FINISHED'].includes(matchById.get(e.match_id)?.status)).forEach((e:any)=>{const value=e.event_type==='RED'?Number(tournament?.fp_red_deduction||0):Number(tournament?.fp_yellow_deduction||0);deductions.set(e.team_id,(deductions.get(e.team_id)||0)+value)});rows.forEach((row:any,id:string)=>{const calculated=Number(tournament?.fp_starting_points||0)-(deductions.get(id)||0);row.fair_play_points=Math.min(Number(row.fair_play_points),calculated)})}
    return {id:category.id,name:category.name,sport:category.sports?.name||'Deporte',fairPlayEnabled:Boolean(tournament?.fair_play_enabled),round,
      results:finished.filter((m:any)=>Number(dayById.get(m.matchday_id)?.round_number||0)===round).map((m:any)=>{const s=getMatchScoreForStandings(m,rules);return{id:m.id,home:teamById.get(m.home_team_id)?.name||'Local',away:teamById.get(m.away_team_id)?.name||'Visitante',homeScore:s.home,awayScore:s.away}}),
      standings:Array.from(rows.values()).sort((a:any,b:any)=>compareTeamsForStandings(a,b,rules,Boolean(tournament?.fair_play_enabled),Number(tournament?.fp_starting_points||0))),scorers:Array.from(scorerMap.values()).sort((a:any,b:any)=>b.total-a.total).slice(0,10),
      cards:normalizedCards.filter((e:any)=>Number(dayById.get(matchById.get(e.match_id)?.matchday_id)?.round_number||0)===round).map((e:any)=>({id:e.id,player:e.players?.name||'Jugador',team:teamById.get(e.team_id)?.name||'Equipo',card:e.event_type==='RED'?(e.isDoubleCaution?'Roja · doble amarilla':'Roja'):'Amarilla'})),
      debts:Array.from(debtMap.entries()).filter(([,amount]:any)=>amount>0).map(([id,amount])=>({team:teamById.get(id)?.name||'Equipo',amount})),
      sanctions:categoryEvents.filter((e:any)=>e.disciplinary_comment||e.suspension_matches).map((e:any)=>({id:e.id,player:e.players?.name||'Jugador',team:teamById.get(e.team_id)?.name||'Equipo',matches:Number(e.suspension_matches||0),comment:e.disciplinary_comment||''}))};
  })};
}
