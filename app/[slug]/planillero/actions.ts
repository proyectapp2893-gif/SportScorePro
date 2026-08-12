'use server';

import { clearScorekeeperSession, getScorekeeperSession, setScorekeeperSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { hashPassword, verifyPassword } from '@/app/lib/passwords';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';

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
