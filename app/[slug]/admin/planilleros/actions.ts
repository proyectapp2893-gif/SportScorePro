'use server';

import { randomBytes } from 'crypto';
import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { hashPassword } from '@/app/lib/passwords';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';

type AdminScorekeeperResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function requireScorekeeperAdmin(slug: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Cliente inválido.' };
  return { success: true as const, clientId, supabase: createServerSupabaseAdminClient() };
}

function temporaryPassword() {
  return `Sc-${randomBytes(5).toString('base64url')}9`;
}

async function loadScorekeeperRows(supabase: ReturnType<typeof createServerSupabaseAdminClient>, clientId: string) {
  const query = await supabase
    .from('scorekeeper_users')
    .select(`
      id,
      name,
      role,
      username,
      email,
      assigned_password,
      must_change_password,
      password_changed_at,
      is_active,
      created_at,
      scorekeeper_match_access(
        match_id,
        matches(
          id,
          status,
          scheduled_time,
          home_team:teams!home_team_id(id, name),
          away_team:teams!away_team_id(id, name),
          matchdays(
            scheduled_date,
            round_number,
            categories(
              id,
              name,
              sports(name),
              tournaments(id, name)
            )
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (query.error) return [];
  return query.data || [];
}

export async function createScorekeeperUser(slug: string, input: {
  name: string;
  username: string;
  password?: string;
  email?: string;
  role: 'JUDGE' | 'SCOREKEEPER' | 'SUPERVISOR';
}): Promise<AdminScorekeeperResult> {
  const auth = await requireScorekeeperAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const name = input.name.trim().toUpperCase();
  const username = input.username.toLowerCase().trim();
  const password = input.password?.trim() || temporaryPassword();
  if (!name || !username || password.length < 8) {
    return { success: false, error: 'Completa nombre, usuario y una clave de mínimo 8 caracteres.' };
  }

  const { error } = await auth.supabase
    .from('scorekeeper_users')
    .insert({
      client_id: auth.clientId,
      name,
      role: input.role,
      username,
      email: input.email?.trim() || null,
      password_hash: hashPassword(password),
      assigned_password: password,
      must_change_password: true,
      password_changed_at: null,
    });

  if (error) {
    return {
      success: false,
      error: error.code === '42P01'
        ? 'Falta aplicar la migración del portal de planilleros.'
        : error.code === '23505'
          ? 'Ese usuario ya existe para este cliente.'
          : 'No se pudo crear el usuario operativo.',
    };
  }

  await logAuditEvent({
    action: 'admin.scorekeeper.create',
    actorType: 'client',
    clientId: auth.clientId,
    targetType: 'scorekeeper',
    targetId: username,
    metadata: { slug, role: input.role },
  });

  return { success: true, data: undefined };
}

export async function toggleScorekeeperStatus(slug: string, scorekeeperId: string, nextStatus: boolean): Promise<AdminScorekeeperResult> {
  const auth = await requireScorekeeperAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('scorekeeper_users')
    .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', scorekeeperId)
    .eq('client_id', auth.clientId);

  if (error) return { success: false, error: 'No se pudo actualizar el estado.' };
  return { success: true, data: undefined };
}

export async function resetScorekeeperPassword(slug: string, scorekeeperId: string, password: string): Promise<AdminScorekeeperResult> {
  const auth = await requireScorekeeperAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };
  if (password.trim().length < 8) return { success: false, error: 'La contraseña debe tener mínimo 8 caracteres.' };

  const { error } = await auth.supabase
    .from('scorekeeper_users')
    .update({
      password_hash: hashPassword(password.trim()),
      assigned_password: password.trim(),
      must_change_password: true,
      password_changed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scorekeeperId)
    .eq('client_id', auth.clientId);

  if (error) return { success: false, error: 'No se pudo reiniciar la contraseña.' };
  return { success: true, data: undefined };
}

export async function assignScorekeeperMatch(slug: string, scorekeeperId: string, matchId: string): Promise<AdminScorekeeperResult> {
  const auth = await requireScorekeeperAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { data: scorekeeper } = await auth.supabase
    .from('scorekeeper_users')
    .select('id')
    .eq('id', scorekeeperId)
    .eq('client_id', auth.clientId)
    .maybeSingle();
  if (!scorekeeper) return { success: false, error: 'Usuario operativo inválido.' };

  const { data: match } = await auth.supabase
    .from('matches')
    .select('id, matchdays!inner(categories!inner(tournaments!inner(client_id)))')
    .eq('id', matchId)
    .eq('matchdays.categories.tournaments.client_id', auth.clientId)
    .maybeSingle();
  if (!match) return { success: false, error: 'El partido no pertenece a este cliente.' };

  const { data: existingAccess } = await auth.supabase
    .from('scorekeeper_match_access')
    .select('scorekeeper_user_id')
    .eq('match_id', matchId)
    .maybeSingle();

  if (existingAccess && existingAccess.scorekeeper_user_id !== scorekeeperId) {
    return { success: false, error: 'Este partido ya tiene juez o planillero asignado.' };
  }

  const { error } = await auth.supabase
    .from('scorekeeper_match_access')
    .upsert({ scorekeeper_user_id: scorekeeperId, match_id: matchId }, { onConflict: 'scorekeeper_user_id,match_id' });

  if (error) return { success: false, error: 'No se pudo asignar el partido.' };
  return { success: true, data: undefined };
}

export async function removeScorekeeperMatch(slug: string, scorekeeperId: string, matchId: string): Promise<AdminScorekeeperResult> {
  const auth = await requireScorekeeperAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('scorekeeper_match_access')
    .delete()
    .eq('scorekeeper_user_id', scorekeeperId)
    .eq('match_id', matchId);

  if (error) return { success: false, error: 'No se pudo quitar el partido.' };
  return { success: true, data: undefined };
}

export async function refreshScorekeepers(slug: string): Promise<AdminScorekeeperResult<any[]>> {
  const auth = await requireScorekeeperAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };
  return { success: true, data: await loadScorekeeperRows(auth.supabase, auth.clientId) };
}
