'use server';

import { clearScorekeeperSession, getScorekeeperSession, setScorekeeperSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { hashPassword, verifyPassword } from '@/app/lib/passwords';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';

type ScorekeeperActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function loginScorekeeper(slug: string, username: string, password: string): Promise<ScorekeeperActionResult> {
  const safeUsername = username.toLowerCase().trim();
  const safePassword = password.trim();
  if (!safeUsername || !safePassword) return { success: false, error: 'Completa usuario y contraseña.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: user, error } = await supabase
    .from('scorekeeper_users')
    .select('id, client_id, password_hash, is_active, clients!inner(slug, is_active)')
    .eq('username', safeUsername)
    .eq('clients.slug', slug)
    .maybeSingle();

  if (error || !user || !verifyPassword(safePassword, user.password_hash)) {
    return { success: false, error: 'Credenciales incorrectas.' };
  }

  if (!user.is_active || !(user.clients as any)?.is_active) {
    return { success: false, error: 'Usuario suspendido.' };
  }

  await setScorekeeperSession(slug, user.id);
  await logAuditEvent({
    action: 'scorekeeper.login',
    actorType: 'scorekeeper',
    actorId: user.id,
    clientId: user.client_id,
    targetType: 'scorekeeper',
    targetId: user.id,
    metadata: { slug, username: safeUsername },
  });

  return { success: true, data: undefined };
}

export async function logoutScorekeeper(slug: string) {
  await clearScorekeeperSession(slug);
  return { success: true };
}

export async function changeScorekeeperPassword(slug: string, currentPassword: string, nextPassword: string): Promise<ScorekeeperActionResult> {
  const scorekeeperId = await getScorekeeperSession(slug);
  if (!scorekeeperId) return { success: false, error: 'Sesión inválida.' };
  if (nextPassword.trim().length < 8) return { success: false, error: 'La nueva contraseña debe tener mínimo 8 caracteres.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: user } = await supabase
    .from('scorekeeper_users')
    .select('id, client_id, password_hash, clients!inner(slug)')
    .eq('id', scorekeeperId)
    .eq('clients.slug', slug)
    .maybeSingle();

  if (!user || !verifyPassword(currentPassword.trim(), user.password_hash)) {
    return { success: false, error: 'La contraseña actual no coincide.' };
  }

  const { error } = await supabase
    .from('scorekeeper_users')
    .update({
      password_hash: hashPassword(nextPassword.trim()),
      assigned_password: null,
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', scorekeeperId);

  if (error) return { success: false, error: 'No se pudo cambiar la contraseña.' };

  await logAuditEvent({
    action: 'scorekeeper.password.change',
    actorType: 'scorekeeper',
    actorId: scorekeeperId,
    clientId: user.client_id,
    targetType: 'scorekeeper',
    targetId: scorekeeperId,
    metadata: { slug },
  });

  return { success: true, data: undefined };
}

async function scorekeeperMatch(slug: string, matchId: string) {
  const scorekeeperId = await getScorekeeperSession(slug);
  if (!scorekeeperId) return null;
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return null;
  const supabase = createServerSupabaseAdminClient();
  const { data: access } = await supabase.from('scorekeeper_match_access').select('match_id,scorekeeper_users!inner(client_id,is_active)').eq('scorekeeper_user_id', scorekeeperId).eq('match_id', matchId).eq('scorekeeper_users.client_id', clientId).eq('scorekeeper_users.is_active', true).maybeSingle();
  if (!access) return null;
  const { data: match } = await supabase.from('matches').select('id,status,home_team_id,away_team_id,matchdays!inner(category_id,stage_id)').eq('id', matchId).maybeSingle();
  return match ? { supabase, scorekeeperId, clientId, match } : null;
}

export async function loadMatchParticipationRoster(slug: string, matchId: string): Promise<ScorekeeperActionResult<any>> {
  const access = await scorekeeperMatch(slug, matchId);
  if (!access) return { success: false, error: 'No tienes permiso para este partido.' };
  const { supabase, match } = access;
  const { data: players, error } = await supabase.from('players').select('id,name,shirt_number,team_id').in('team_id', [match.home_team_id, match.away_team_id]).order('shirt_number');
  if (error) return { success: false, error: 'No se pudo cargar la nómina.' };
  const { data: participation } = await supabase.from('player_match_participation').select('player_id,status,source').eq('match_id', matchId);
  const { data: lineupEvents } = await supabase.from('match_events').select('player_id,team_id').eq('match_id', matchId).eq('event_type', 'STARTING_LINEUP');
  const selected = new Set([...(participation || []).filter((item:any) => item.status === 'CONFIRMED').map((item:any) => item.player_id), ...(lineupEvents || []).map((item:any) => item.player_id)]);
  return { success: true, data: { players: players || [], selected: [...selected], homeTeamId: match.home_team_id, awayTeamId: match.away_team_id, status: match.status } };
}

export async function confirmMatchParticipation(slug: string, matchId: string, playerIds: string[]): Promise<ScorekeeperActionResult> {
  const access = await scorekeeperMatch(slug, matchId);
  if (!access) return { success: false, error: 'No tienes permiso para este partido.' };
  if (!['LIVE', 'FINISHED'].includes(access.match.status)) return { success: false, error: 'La participación se confirma cuando el partido está en curso o al cerrar el acta.' };
  const ids = [...new Set(playerIds.filter(Boolean))];
  const { data: validPlayers, error: playersError } = await access.supabase.from('players').select('id,team_id').in('id', ids).in('team_id', [access.match.home_team_id, access.match.away_team_id]);
  if (playersError || (validPlayers || []).length !== ids.length) return { success: false, error: 'La lista contiene jugadores inválidos.' };
  const { error: voidError } = await access.supabase.from('player_match_participation').update({ status: 'VOIDED', comment: 'No confirmó participación en el acta del planillero.', updated_at: new Date().toISOString() }).eq('match_id', matchId).in('source', ['EVENT', 'PLANILLERO']).eq('status', 'CONFIRMED');
  if (voidError) return { success: false, error: 'No se pudo actualizar la lista anterior.' };
  if (ids.length) {
    const { error } = await access.supabase.from('player_match_participation').upsert(ids.map(playerId => ({ player_id: playerId, team_id: (validPlayers || []).find((player:any) => player.id === playerId)?.team_id, match_id: matchId, stage_id: (access.match as any).matchdays?.stage_id || null, source: 'PLANILLERO', status: 'CONFIRMED', created_by: access.scorekeeperId, comment: 'Confirmado en el cierre del acta.', updated_at: new Date().toISOString() })), { onConflict: 'player_id,match_id' });
    if (error) return { success: false, error: 'No se pudo guardar la participación.' };
  }
  await logAuditEvent({ action: 'scorekeeper.match_participation.confirm', actorType: 'scorekeeper', actorId: access.scorekeeperId, clientId: access.clientId, targetType: 'match', targetId: matchId, metadata: { slug, players: ids.length } });
  return { success: true, data: undefined };
}
