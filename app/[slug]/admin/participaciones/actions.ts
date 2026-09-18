'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createPrivilegedSupabaseClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { logAuditEvent } from '@/app/lib/audit';

const fail = (error: string) => ({ success: false as const, error });

async function adminDb(slug: string) {
  if (!(await hasAdminSession(slug))) return null;
  const clientId = await getClientIdBySlug(slug);
  return clientId ? { db: createPrivilegedSupabaseClient(), clientId } : null;
}

export async function loadParticipationData(slug: string, categoryId: string, asOfDate?: string | null) {
  const access = await adminDb(slug);
  if (!access) return fail('Sesión administrativa no válida.') as any;
  const { db, clientId } = access;
  const { data: category } = await db.from('categories').select('id,name,tournament_id,tournaments!inner(client_id)').eq('id', categoryId).eq('tournaments.client_id', clientId).maybeSingle();
  if (!category) return fail('La categoría no pertenece a esta institución.') as any;
  const [{ data: teams }, { data: matches }] = await Promise.all([
    db.from('teams').select('id,name,players(id,name,shirt_number)').eq('category_id', categoryId).order('name'),
    db.from('matches').select('id,status,scheduled_time,home_team_id,away_team_id,matchdays!inner(id,scheduled_date,round_number,stage_id,competition_stages(stage_type,name))').eq('matchdays.category_id', categoryId).order('matchdays(scheduled_date)', { ascending: true }),
  ]);
  const filteredMatches = (matches || []).filter((match: any) => !asOfDate || match.matchdays?.scheduled_date <= asOfDate);
  const visibleMatchIds = new Set(filteredMatches.map((match: any) => match.id));
  const teamIds = (teams || []).map((team:any) => team.id);
  const [{ data: records }, { data: eventRecords }, { data: playerEvents }] = await Promise.all([
    teamIds.length ? db.from('player_match_participation').select('id,player_id,team_id,match_id,source,status,comment,created_at').in('team_id', teamIds) : Promise.resolve({ data: [] }),
    teamIds.length ? db.from('match_events').select('id,player_id,team_id,match_id,event_type,matches!inner(matchdays!inner(category_id,scheduled_date,competition_stages(stage_type)))').in('team_id', teamIds).eq('matches.matchdays.category_id', categoryId).in('event_type', ['STARTING_LINEUP', 'SUB_IN']) : Promise.resolve({ data: [] }),
    teamIds.length ? db.from('match_events').select('id,player_id,team_id,match_id,event_type,period,minute_record,created_at,fine_status,disciplinary_comment,matches!inner(home_team_id,away_team_id,matchdays!inner(category_id,scheduled_date,round_number,competition_stages(stage_type)),home_team:teams!home_team_id(name),away_team:teams!away_team_id(name))').in('team_id', teamIds).eq('matches.matchdays.category_id', categoryId).order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
  ]);
  return { success: true as const, data: { category, teams: teams || [], matches: filteredMatches, records: (records || []).filter((record: any) => visibleMatchIds.has(record.match_id)), eventRecords: (eventRecords || []).filter((record:any) => record.matches?.matchdays?.competition_stages?.stage_type !== 'FINALS' && (!asOfDate || record.matches?.matchdays?.scheduled_date <= asOfDate)), playerEvents: (playerEvents || []).filter((event: any) => !asOfDate || event.matches?.matchdays?.scheduled_date <= asOfDate) } };
}

export async function saveManualParticipation(slug: string, input: { categoryId: string; playerId: string; teamId: string; matchId: string; comment: string }) {
  const access = await adminDb(slug);
  if (!access) return fail('Sesión administrativa no válida.');
  const { db, clientId } = access;
  const { data: match } = await db.from('matches').select('id,home_team_id,away_team_id,matchdays!inner(category_id,stage_id,competition_stages(stage_type))').eq('id', input.matchId).eq('matchdays.category_id', input.categoryId).maybeSingle();
  const { data: player } = await db.from('players').select('id,team_id').eq('id', input.playerId).eq('team_id', input.teamId).maybeSingle();
  if (!match || !player || (match.home_team_id !== input.teamId && match.away_team_id !== input.teamId)) return fail('El jugador, equipo o partido no son válidos.');
  const stageType = (match as any).matchdays?.competition_stages?.stage_type;
  if (stageType === 'FINALS') return fail('Solo se pueden registrar partidos de fase regular.');
  const { data: record, error } = await db.from('player_match_participation').upsert({ player_id: input.playerId, team_id: input.teamId, match_id: input.matchId, stage_id: (match as any).matchdays?.stage_id || null, source: 'MANUAL', status: 'CONFIRMED', comment: input.comment.trim() || null, created_by: clientId, updated_at: new Date().toISOString() }, { onConflict: 'player_id,match_id' }).select('id').single();
  if (error || !record) return fail(error?.code === '23505' ? 'El jugador ya está contabilizado en este partido.' : 'No se pudo registrar la participación.');
  await logAuditEvent({ action: 'admin.player_participation.manual_add', actorType: 'client', actorId: clientId, clientId, targetType: 'player', targetId: input.playerId, metadata: { slug, matchId: input.matchId, teamId: input.teamId, comment: input.comment.trim() } });
  return { success: true as const };
}

export async function voidParticipation(slug: string, recordId: string, comment: string) {
  const access = await adminDb(slug);
  if (!access) return fail('Sesión administrativa no válida.');
  const { db, clientId } = access;
  const { data: record } = await db.from('player_match_participation').select('id,player_id,team_id,teams!inner(categories!inner(tournaments!inner(client_id)))').eq('id', recordId).eq('teams.categories.tournaments.client_id', clientId).maybeSingle();
  if (!record) return fail('Participación no encontrada.');
  const { error } = await db.from('player_match_participation').update({ status: 'VOIDED', comment: comment.trim() || 'Anulada por administración', updated_at: new Date().toISOString() }).eq('id', recordId);
  if (error) return fail('No se pudo anular la participación.');
  await logAuditEvent({ action: 'admin.player_participation.void', actorType: 'client', actorId: clientId, clientId, targetType: 'player', targetId: record.player_id, metadata: { slug, recordId, comment: comment.trim() } });
  return { success: true as const };
}
