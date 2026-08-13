'use server';

import { randomBytes } from 'crypto';
import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { hashPassword } from '@/app/lib/passwords';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug, teamBelongsToClientSlug } from '@/app/lib/tenant';

type AdminDelegateResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type SyncDelegationCredential = {
  schoolId: string;
  schoolName: string;
  username: string;
  password?: string;
  created: boolean;
  assignedTeams: number;
};

async function loadDelegateRows(supabase: ReturnType<typeof createServerSupabaseAdminClient>, clientId: string) {
  const fullQuery = await supabase
    .from('delegate_users')
    .select(`
      id,
      name,
      username,
      email,
      whatsapp_phone,
      assigned_password,
      must_change_password,
      password_changed_at,
      is_active,
      created_at,
      schools(id, name),
      delegate_team_access(
        team_id,
        teams(
          id,
          name,
          categories(
            id,
            name,
            tournament_id,
            tournaments(id, name)
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (!fullQuery.error) return fullQuery.data || [];

  const fallbackQuery = await supabase
    .from('delegate_users')
    .select(`
      id,
      name,
      username,
      email,
      is_active,
      created_at,
      schools(id, name),
      delegate_team_access(
        team_id,
        teams(
          id,
          name,
          categories(
            id,
            name,
            tournament_id,
            tournaments(id, name)
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  return (fallbackQuery.data || []).map((delegate: any) => ({
    ...delegate,
    assigned_password: null,
    whatsapp_phone: null,
    must_change_password: false,
    password_changed_at: null,
  }));
}

async function requireDelegateAdmin(slug: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Cliente inválido.' };
  return { success: true as const, clientId, supabase: createServerSupabaseAdminClient() };
}

function normalizeUsernameSeed(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 38);

  return normalized || `delegacion.${randomBytes(3).toString('hex')}`;
}

function temporaryPassword() {
  return `Sp-${randomBytes(5).toString('base64url')}9`;
}

function normalizeWhatsappPhone(value?: string) {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

async function insertDelegateUser(supabase: ReturnType<typeof createServerSupabaseAdminClient>, row: Record<string, any>) {
  const fullInsert = await supabase
    .from('delegate_users')
    .insert(row)
    .select('id, username')
    .single();

  if (fullInsert.error?.code !== '42703') return fullInsert;

  const { assigned_password, must_change_password, password_changed_at, whatsapp_phone, ...legacyRow } = row;
  return supabase
    .from('delegate_users')
    .insert(legacyRow)
    .select('id, username')
    .single();
}

async function updateDelegatePasswordAssignment(
  supabase: ReturnType<typeof createServerSupabaseAdminClient>,
  delegateId: string,
  clientId: string,
  password: string,
) {
  const fullUpdate = await supabase
    .from('delegate_users')
    .update({
      password_hash: hashPassword(password),
      assigned_password: password,
      must_change_password: true,
      password_changed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', delegateId)
    .eq('client_id', clientId);

  if (fullUpdate.error?.code !== '42703') return fullUpdate;

  return supabase
    .from('delegate_users')
    .update({
      password_hash: hashPassword(password),
      updated_at: new Date().toISOString(),
    })
    .eq('id', delegateId)
    .eq('client_id', clientId);
}

async function findExistingDelegateBySchool(
  supabase: ReturnType<typeof createServerSupabaseAdminClient>,
  clientId: string,
  schoolId: string,
) {
  const fullQuery = await supabase
    .from('delegate_users')
    .select('id, username, assigned_password, must_change_password, password_changed_at')
    .eq('client_id', clientId)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fullQuery.error?.code !== '42703') return fullQuery;

  return supabase
    .from('delegate_users')
    .select('id, username')
    .eq('client_id', clientId)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

export async function createDelegateUser(slug: string, input: {
  name: string;
  username: string;
  password: string;
  email?: string;
  whatsappPhone?: string;
  schoolId?: string;
}): Promise<AdminDelegateResult> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const name = input.name.trim().toUpperCase();
  const username = input.username.toLowerCase().trim();
  const password = input.password.trim();
  const whatsappPhone = input.whatsappPhone ? normalizeWhatsappPhone(input.whatsappPhone) : null;
  if (!name || !username || password.length < 8) {
    return { success: false, error: 'Completa nombre, usuario y contraseña de mínimo 8 caracteres.' };
  }
  if (input.whatsappPhone && !whatsappPhone) {
    return { success: false, error: 'Ingresa el WhatsApp con código de país, entre 10 y 15 dígitos.' };
  }

  if (input.schoolId) {
    const { data: school } = await auth.supabase
      .from('schools')
      .select('id')
      .eq('id', input.schoolId)
      .eq('client_id', auth.clientId)
      .maybeSingle();
    if (!school) return { success: false, error: 'La institución no pertenece a este cliente.' };
  }

  const { error } = await insertDelegateUser(auth.supabase, {
    client_id: auth.clientId,
    school_id: input.schoolId || null,
    name,
    username,
    email: input.email?.trim() || null,
    whatsapp_phone: whatsappPhone,
    password_hash: hashPassword(password),
    assigned_password: password,
    must_change_password: true,
    password_changed_at: null,
  });

  if (error) {
    return { success: false, error: error.code === '23505' ? 'Ese usuario ya existe para este cliente.' : 'No se pudo crear el delegado.' };
  }

  await logAuditEvent({
    action: 'admin.delegate.create',
    actorType: 'client',
    clientId: auth.clientId,
    targetType: 'delegate',
    targetId: username,
    metadata: { slug, username },
  });

  return { success: true, data: undefined };
}

export async function updateDelegateWhatsapp(slug: string, delegateId: string, phone: string): Promise<AdminDelegateResult<{ phone: string }>> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    return { success: false, error: 'Ingresa el WhatsApp con código de país, entre 10 y 15 dígitos.' };
  }

  const { data: delegate, error } = await auth.supabase
    .from('delegate_users')
    .update({ whatsapp_phone: normalizedPhone, updated_at: new Date().toISOString() })
    .eq('id', delegateId)
    .eq('client_id', auth.clientId)
    .select('id')
    .maybeSingle();

  if (error || !delegate) return { success: false, error: 'No se pudo guardar el número de WhatsApp.' };

  await logAuditEvent({
    action: 'admin.delegate.whatsapp.update',
    actorType: 'client',
    clientId: auth.clientId,
    targetType: 'delegate',
    targetId: delegateId,
    metadata: { slug },
  });

  return { success: true, data: { phone: normalizedPhone } };
}

export async function toggleDelegateStatus(slug: string, delegateId: string, nextStatus: boolean): Promise<AdminDelegateResult> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('delegate_users')
    .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', delegateId)
    .eq('client_id', auth.clientId);

  if (error) return { success: false, error: 'No se pudo actualizar el estado.' };
  return { success: true, data: undefined };
}

export async function deleteDelegateUser(slug: string, delegateId: string): Promise<AdminDelegateResult> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { data: delegate, error: delegateError } = await auth.supabase
    .from('delegate_users')
    .select('id, name, username')
    .eq('id', delegateId)
    .eq('client_id', auth.clientId)
    .maybeSingle();

  if (delegateError) return { success: false, error: 'No se pudo validar el usuario delegado.' };
  if (!delegate) return { success: false, error: 'El usuario delegado no existe o no pertenece a este cliente.' };

  const { error } = await auth.supabase
    .from('delegate_users')
    .delete()
    .eq('id', delegate.id)
    .eq('client_id', auth.clientId);

  if (error) return { success: false, error: 'No se pudo eliminar el usuario delegado.' };

  await logAuditEvent({
    action: 'admin.delegate.delete',
    actorType: 'client',
    clientId: auth.clientId,
    targetType: 'delegate',
    targetId: delegate.id,
    metadata: { slug, name: delegate.name, username: delegate.username },
  });

  return { success: true, data: undefined };
}

export async function deleteDelegateUsers(slug: string, delegateIds: string[]): Promise<AdminDelegateResult<{ deleted: number }>> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const uniqueIds = Array.from(new Set(delegateIds.filter(Boolean)));
  if (uniqueIds.length === 0) return { success: false, error: 'Selecciona al menos una delegación.' };

  const { data: delegates, error: delegatesError } = await auth.supabase
    .from('delegate_users')
    .select('id, name, username')
    .eq('client_id', auth.clientId)
    .in('id', uniqueIds);

  if (delegatesError) return { success: false, error: 'No se pudieron validar las delegaciones seleccionadas.' };
  if (!delegates?.length) return { success: false, error: 'Las delegaciones seleccionadas ya no existen.' };
  if (delegates.length !== uniqueIds.length) return { success: false, error: 'Una o más delegaciones no pertenecen a este cliente.' };

  const { error } = await auth.supabase
    .from('delegate_users')
    .delete()
    .eq('client_id', auth.clientId)
    .in('id', uniqueIds);

  if (error) return { success: false, error: 'No se pudieron eliminar las delegaciones seleccionadas.' };

  await logAuditEvent({
    action: 'admin.delegate.bulk_delete',
    actorType: 'client',
    clientId: auth.clientId,
    targetType: 'delegate',
    metadata: {
      slug,
      deleted: delegates.length,
      delegates: delegates.map((delegate) => ({ id: delegate.id, name: delegate.name, username: delegate.username })),
    },
  });

  return { success: true, data: { deleted: delegates.length } };
}

export async function resetDelegatePassword(slug: string, delegateId: string, password: string): Promise<AdminDelegateResult> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };
  if (password.trim().length < 8) return { success: false, error: 'La contraseña debe tener mínimo 8 caracteres.' };

  const { error } = await updateDelegatePasswordAssignment(auth.supabase, delegateId, auth.clientId, password.trim());

  if (error) return { success: false, error: 'No se pudo reiniciar la contraseña.' };
  return { success: true, data: undefined };
}

export async function assignDelegateTeam(slug: string, delegateId: string, teamId: string): Promise<AdminDelegateResult> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece al cliente.' };

  const { data: delegate } = await auth.supabase
    .from('delegate_users')
    .select('id')
    .eq('id', delegateId)
    .eq('client_id', auth.clientId)
    .maybeSingle();

  if (!delegate) return { success: false, error: 'Delegado inválido.' };

  const { error } = await auth.supabase
    .from('delegate_team_access')
    .upsert({ delegate_user_id: delegateId, team_id: teamId }, { onConflict: 'delegate_user_id,team_id' });

  if (error) return { success: false, error: 'No se pudo asignar el equipo.' };
  return { success: true, data: undefined };
}

export async function removeDelegateTeam(slug: string, delegateId: string, teamId: string): Promise<AdminDelegateResult> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('delegate_team_access')
    .delete()
    .eq('delegate_user_id', delegateId)
    .eq('team_id', teamId);

  if (error) return { success: false, error: 'No se pudo quitar el equipo.' };
  return { success: true, data: undefined };
}

export async function updateCategoryRegistrationSettings(slug: string, categoryId: string, input: {
  registrationOpen: boolean;
  registrationDeadline?: string | null;
  minRosterSize?: number | null;
  maxRosterSize?: number | null;
  lockedMessage?: string | null;
}): Promise<AdminDelegateResult> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { data: category } = await auth.supabase
    .from('categories')
    .select('id, tournaments!inner(client_id)')
    .eq('id', categoryId)
    .eq('tournaments.client_id', auth.clientId)
    .maybeSingle();

  if (!category) return { success: false, error: 'Categoría inválida.' };

  const { error } = await auth.supabase
    .from('categories')
    .update({
      registration_open: input.registrationOpen,
      registration_deadline: input.registrationDeadline || null,
      min_roster_size: input.minRosterSize ?? null,
      max_roster_size: input.maxRosterSize ?? null,
      roster_locked_message: input.lockedMessage?.trim() || null,
    })
    .eq('id', categoryId);

  if (error) return { success: false, error: 'No se pudo actualizar la configuración.' };
  return { success: true, data: undefined };
}

export async function syncDelegatesFromTournament(slug: string, tournamentId: string, options?: {
  resetExistingPasswords?: boolean;
}): Promise<AdminDelegateResult<{
  credentials: SyncDelegationCredential[];
  delegates: any[];
  createdDelegates: number;
  reusedDelegates: number;
  resetPasswords: number;
  assignedTeams: number;
}>> {
  const auth = await requireDelegateAdmin(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const { data: tournament } = await auth.supabase
    .from('tournaments')
    .select('id, name')
    .eq('id', tournamentId)
    .eq('client_id', auth.clientId)
    .maybeSingle();

  if (!tournament) return { success: false, error: 'El torneo no pertenece a este cliente.' };

  const { data: teams, error: teamsError } = await auth.supabase
    .from('teams')
    .select(`
      id,
      school_id,
      schools!inner(id, name),
      categories!inner(id, tournament_id)
    `)
    .eq('categories.tournament_id', tournamentId)
    .not('school_id', 'is', null);

  if (teamsError) return { success: false, error: 'No se pudieron leer las delegaciones del torneo.' };
  if (!teams?.length) return { success: false, error: 'Este torneo aún no tiene delegaciones/equipos para sincronizar.' };

  const teamsBySchool = new Map<string, { school: any; teamIds: string[] }>();
  for (const team of teams as any[]) {
    const schoolId = team.school_id;
    if (!schoolId || !team.schools?.id) continue;
    const current = teamsBySchool.get(schoolId) || { school: team.schools, teamIds: [] };
    current.teamIds.push(team.id);
    teamsBySchool.set(schoolId, current);
  }

  const credentials: SyncDelegationCredential[] = [];
  let createdDelegates = 0;
  let reusedDelegates = 0;
  let resetPasswords = 0;
  let assignedTeams = 0;

  for (const [schoolId, entry] of teamsBySchool.entries()) {
    const schoolName = String(entry.school.name || 'DELEGACION').trim().toUpperCase();
    const usernameSeed = normalizeUsernameSeed(schoolName);

    const { data: existingBySchool } = await findExistingDelegateBySchool(auth.supabase, auth.clientId, schoolId);

    let delegateId = existingBySchool?.id;
    let username = existingBySchool?.username || usernameSeed;
    let password: string | undefined;
    let created = false;

    if (!delegateId) {
      password = temporaryPassword();
      const { data: inserted, error: insertError } = await insertDelegateUser(auth.supabase, {
          client_id: auth.clientId,
          school_id: schoolId,
          name: schoolName,
          username,
          password_hash: hashPassword(password),
          assigned_password: password,
          must_change_password: true,
          password_changed_at: null,
        });

      if (insertError?.code === '23505') {
        username = `${usernameSeed}.${randomBytes(2).toString('hex')}`;
        const retryPassword = password;
        const { data: retryInserted, error: retryError } = await insertDelegateUser(auth.supabase, {
            client_id: auth.clientId,
            school_id: schoolId,
            name: schoolName,
            username,
            password_hash: hashPassword(retryPassword),
            assigned_password: retryPassword,
            must_change_password: true,
            password_changed_at: null,
          });

        if (retryError || !retryInserted) {
          return { success: false, error: `No se pudo crear el delegado para ${schoolName}.` };
        }

        delegateId = retryInserted.id;
        username = retryInserted.username;
      } else if (insertError || !inserted) {
        return { success: false, error: `No se pudo crear el delegado para ${schoolName}.` };
      } else {
        delegateId = inserted.id;
        username = inserted.username;
      }

      created = true;
      createdDelegates += 1;
    } else {
      if (options?.resetExistingPasswords) {
        password = temporaryPassword();
        const { error: resetError } = await updateDelegatePasswordAssignment(auth.supabase, delegateId, auth.clientId, password);

        if (resetError) return { success: false, error: `No se pudo reiniciar la clave de ${schoolName}.` };
        resetPasswords += 1;
      } else {
        password = (existingBySchool as any)?.must_change_password ? (existingBySchool as any)?.assigned_password || undefined : undefined;
      }

      reusedDelegates += 1;
    }

    const accessRows = entry.teamIds.map((teamId) => ({ delegate_user_id: delegateId, team_id: teamId }));
    const { error: accessError } = await auth.supabase
      .from('delegate_team_access')
      .upsert(accessRows, { onConflict: 'delegate_user_id,team_id' });

    if (accessError) return { success: false, error: `No se pudieron asignar equipos a ${schoolName}.` };

    assignedTeams += entry.teamIds.length;
    credentials.push({
      schoolId,
      schoolName,
      username,
      password,
      created,
      assignedTeams: entry.teamIds.length,
    });
  }

  await logAuditEvent({
    action: 'admin.delegate.sync_tournament',
    actorType: 'client',
    clientId: auth.clientId,
    targetType: 'tournament',
    targetId: tournamentId,
    metadata: { slug, tournament: tournament.name, createdDelegates, reusedDelegates, resetPasswords, assignedTeams },
  });

  return {
    success: true,
    data: {
      credentials,
      delegates: await loadDelegateRows(auth.supabase, auth.clientId),
      createdDelegates,
      reusedDelegates,
      resetPasswords,
      assignedTeams,
    },
  };
}
