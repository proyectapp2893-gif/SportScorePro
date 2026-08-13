'use server';

import { randomUUID } from 'crypto';
import { clearDelegateSession, getDelegateSession, setDelegateSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { hashPassword, verifyPassword } from '@/app/lib/passwords';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';

type DelegateActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type PlayerInput = {
  name: string;
  identityNumber?: string | null;
  shirtNumber?: number | null;
  birthYear?: number | null;
  vinculo?: string | null;
};

const MAX_LOGO_SIZE_BYTES = 800 * 1024;
const MAX_PLAYER_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;
const PLAYER_DOCUMENT_TYPES = ['IDENTITY_FRONT', 'IDENTITY_BACK'] as const;

async function getDelegateForSlug(slug: string) {
  const delegateId = await getDelegateSession(slug);
  if (!delegateId) return null;

  const supabase = createServerSupabaseAdminClient();
  const { data } = await supabase
    .from('delegate_users')
    .select('id, client_id, school_id, name, username, is_active, must_change_password, clients!inner(slug, is_active)')
    .eq('id', delegateId)
    .eq('is_active', true)
    .eq('clients.slug', slug)
    .eq('clients.is_active', true)
    .maybeSingle();

  if (data) return data;

  const fallback = await supabase
    .from('delegate_users')
    .select('id, client_id, school_id, name, username, is_active, clients!inner(slug, is_active)')
    .eq('id', delegateId)
    .eq('is_active', true)
    .eq('clients.slug', slug)
    .eq('clients.is_active', true)
    .maybeSingle();

  return fallback.data ? { ...fallback.data, must_change_password: false } : null;
}

async function assertDelegateTeam(slug: string, teamId: string) {
  const delegate = await getDelegateForSlug(slug);
  if (!delegate) return { success: false as const, error: 'Sesión de delegado no válida.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: access, error } = await supabase
    .from('delegate_team_access')
    .select(`
      team_id,
      teams!inner(
        id, school_id, category_id,
        categories!inner(id, tournament_id, registration_open, registration_deadline, min_roster_size, max_roster_size, roster_locked_message, tournaments(id, tournament_format))
      )
    `)
    .eq('delegate_user_id', delegate.id)
    .eq('team_id', teamId)
    .maybeSingle();

  if (error?.code === '42703') {
    return { success: false as const, error: 'Falta aplicar la migración de configuración de inscripciones para delegados.' };
  }

  if (!access?.teams) return { success: false as const, error: 'No tienes permiso sobre este equipo.' };

  const team = access.teams as any;
  if (delegate.school_id && delegate.school_id !== team.school_id) {
    return { success: false as const, error: 'El equipo no pertenece a tu delegación.' };
  }

  return { success: true as const, delegate, team };
}

function isRegistrationOpen(category: any) {
  if (!category?.registration_open) return false;
  if (!category.registration_deadline) return true;
  return new Date(category.registration_deadline).getTime() >= Date.now();
}

export async function loginDelegate(slug: string, username: string, password: string): Promise<DelegateActionResult> {
  const safeUsername = username.toLowerCase().trim();
  const safePassword = password.trim();
  if (!safeUsername || !safePassword) return { success: false, error: 'Completa usuario y contraseña.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: delegate, error } = await supabase
    .from('delegate_users')
    .select('id, client_id, password_hash, is_active, clients!inner(slug, is_active)')
    .eq('username', safeUsername)
    .eq('clients.slug', slug)
    .maybeSingle();

  if (error || !delegate || !verifyPassword(safePassword, delegate.password_hash)) {
    return { success: false, error: 'Credenciales incorrectas.' };
  }

  if (!delegate.is_active || !(delegate.clients as any)?.is_active) {
    return { success: false, error: 'Usuario suspendido.' };
  }

  await setDelegateSession(slug, delegate.id);
  await logAuditEvent({
    action: 'delegate.login',
    actorType: 'delegate',
    actorId: delegate.id,
    clientId: delegate.client_id,
    targetType: 'delegate',
    targetId: delegate.id,
    metadata: { slug, username: safeUsername },
  });

  return { success: true, data: undefined };
}

export async function logoutDelegate(slug: string) {
  await clearDelegateSession(slug);
  return { success: true };
}

export async function addDelegatePlayers(slug: string, teamId: string, players: PlayerInput[]): Promise<DelegateActionResult<{ inserted: number }>> {
  const access = await assertDelegateTeam(slug, teamId);
  if (!access.success) return { success: false, error: access.error };

  const category = (access.team as any).categories;
  if (!isRegistrationOpen(category)) {
    return { success: false, error: category?.roster_locked_message || 'La inscripción está cerrada para esta categoría.' };
  }

  const formattedPlayers = players
    .map((player) => ({
      team_id: teamId,
      name: player.name.trim().toUpperCase(),
      identity_number: player.identityNumber?.trim().replace(/\D/g, '') || null,
      shirt_number: player.shirtNumber ?? null,
      birth_year: player.birthYear ?? null,
      vinculo: player.vinculo?.trim().toUpperCase() || null,
    }))
    .filter((player) => player.name);

  if (formattedPlayers.some((player) => !player.identity_number || player.identity_number.length < 5 || player.identity_number.length > 30)) {
    return { success: false, error: 'Todos los jugadores deben tener un número de identidad válido.' };
  }
  if (new Set(formattedPlayers.map((player) => player.identity_number)).size !== formattedPlayers.length) {
    return { success: false, error: 'Hay números de identidad repetidos en la carga.' };
  }

  const allowedRelationships = new Set(['PADRE DE FAMILIA', 'EX-ALUMNO', 'COLABORADOR']);
  if (formattedPlayers.some((player) => player.vinculo && !allowedRelationships.has(player.vinculo))) {
    return { success: false, error: 'El vínculo debe ser PADRE DE FAMILIA, EX-ALUMNO o COLABORADOR.' };
  }
  if (formattedPlayers.some((player) => player.shirt_number !== null && (!Number.isInteger(player.shirt_number) || player.shirt_number < 1 || player.shirt_number > 999))) {
    return { success: false, error: 'Los dorsales deben ser números enteros entre 1 y 999.' };
  }
  const currentYear = new Date().getFullYear();
  if (formattedPlayers.some((player) => player.birth_year !== null && (!Number.isInteger(player.birth_year) || player.birth_year < 1900 || player.birth_year > currentYear))) {
    return { success: false, error: 'Uno o más años de nacimiento no son válidos.' };
  }

  if ((category?.tournaments as any)?.tournament_format === 'THREE_STAGE_35') {
    const youngestAllowedYear = new Date().getFullYear() - 35;
    if (formattedPlayers.some((player) => !player.birth_year || Number(player.birth_year) > youngestAllowedYear)) {
      return { success: false, error: `Todos los participantes deben tener 35 años o más (nacidos en ${youngestAllowedYear} o antes).` };
    }
  }

  if (formattedPlayers.length === 0) return { success: false, error: 'No hay jugadores válidos.' };

  const supabase = createServerSupabaseAdminClient();
  const tournamentId = category?.tournament_id || category?.tournaments?.id;
  if (tournamentId) {
    const identityNumbers = formattedPlayers.map((player) => player.identity_number as string);
    const { data: existingPlayers, error: identityCheckError } = await supabase
      .from('players')
      .select('id, name, identity_number, team_id, teams!inner(categories!inner(tournament_id))')
      .in('identity_number', identityNumbers)
      .eq('teams.categories.tournament_id', tournamentId)
      .limit(1);

    if (identityCheckError) return { success: false, error: 'No se pudo validar la identidad de los jugadores.' };
    if (existingPlayers?.length) {
      return { success: false, error: `La identidad ${existingPlayers[0].identity_number} ya está inscrita en otro registro de este torneo.` };
    }
  }
  if (category?.max_roster_size) {
    const { count } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);

    if ((count || 0) + formattedPlayers.length > category.max_roster_size) {
      return { success: false, error: `La nómina supera el máximo permitido de ${category.max_roster_size} jugadores.` };
    }
  }

  const { error } = await supabase.from('players').insert(formattedPlayers);
  if (error) return {
    success: false,
    error: error.code === '23505'
      ? 'Uno de los números de identidad ya está inscrito en otro equipo de este torneo.'
      : 'No se pudieron registrar jugadores.',
  };

  await logAuditEvent({
    action: 'delegate.roster.players_create',
    actorType: 'delegate',
    actorId: access.delegate.id,
    clientId: access.delegate.client_id,
    targetType: 'team',
    targetId: teamId,
    metadata: { slug, inserted: formattedPlayers.length },
  });

  return { success: true, data: { inserted: formattedPlayers.length } };
}

export async function deleteDelegatePlayer(slug: string, teamId: string, playerId: string): Promise<DelegateActionResult> {
  const access = await assertDelegateTeam(slug, teamId);
  if (!access.success) return { success: false, error: access.error };
  if (!isRegistrationOpen((access.team as any).categories)) {
    return { success: false, error: 'La inscripción está cerrada para esta categoría.' };
  }

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('team_id', teamId);
  if (error) return { success: false, error: 'No se pudo eliminar el jugador.' };

  await logAuditEvent({
    action: 'delegate.roster.player_delete',
    actorType: 'delegate',
    actorId: access.delegate.id,
    clientId: access.delegate.client_id,
    targetType: 'player',
    targetId: playerId,
    metadata: { slug, teamId },
  });

  return { success: true, data: undefined };
}

export async function uploadPlayerIdentityDocument(
  slug: string,
  teamId: string,
  playerId: string,
  documentType: typeof PLAYER_DOCUMENT_TYPES[number],
  file: File,
): Promise<DelegateActionResult> {
  const access = await assertDelegateTeam(slug, teamId);
  if (!access.success) return { success: false, error: access.error };
  if (!PLAYER_DOCUMENT_TYPES.includes(documentType)) return { success: false, error: 'Tipo de documento inválido.' };
  if (!file || file.size <= 0 || file.size > MAX_PLAYER_DOCUMENT_SIZE_BYTES) return { success: false, error: 'El archivo debe pesar máximo 5 MB.' };
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (!allowedTypes.has(file.type)) return { success: false, error: 'Usa un archivo JPG, PNG, WebP o PDF.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: player } = await supabase.from('players').select('id, birth_year').eq('id', playerId).eq('team_id', teamId).maybeSingle();
  if (!player) return { success: false, error: 'El jugador no pertenece a este equipo.' };
  const currentYear = new Date().getFullYear();
  if (!player.birth_year || currentYear - Number(player.birth_year) < 35) return { success: false, error: 'Los documentos solo se habilitan para participantes de 35 años o más.' };

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const storagePath = `${access.delegate.client_id}/${teamId}/${playerId}/${documentType.toLowerCase()}-${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('player-documents').upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return { success: false, error: 'No se pudo almacenar el documento privado.' };

  const { data: previous } = await supabase.from('player_documents').select('storage_path').eq('player_id', playerId).eq('document_type', documentType).maybeSingle();
  const { error } = await supabase.from('player_documents').upsert({
    player_id: playerId,
    document_type: documentType,
    storage_path: storagePath,
    original_filename: file.name.slice(0, 180),
    mime_type: file.type,
    file_size: file.size,
    status: 'PENDING',
    rejection_reason: null,
    uploaded_by_delegate_id: access.delegate.id,
    reviewed_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'player_id,document_type' });
  if (error) {
    await supabase.storage.from('player-documents').remove([storagePath]);
    return { success: false, error: 'No se pudo registrar el documento.' };
  }
  if (previous?.storage_path) await supabase.storage.from('player-documents').remove([previous.storage_path]);

  await logAuditEvent({ action: 'delegate.player_document.upload', actorType: 'delegate', actorId: access.delegate.id, clientId: access.delegate.client_id, targetType: 'player', targetId: playerId, metadata: { slug, teamId, documentType } });
  return { success: true, data: undefined };
}

export async function getPlayerIdentityDocumentUrl(slug: string, teamId: string, playerId: string, documentType: typeof PLAYER_DOCUMENT_TYPES[number]): Promise<DelegateActionResult<{ url: string }>> {
  const access = await assertDelegateTeam(slug, teamId);
  if (!access.success) return { success: false, error: access.error };
  const supabase = createServerSupabaseAdminClient();
  const { data: player } = await supabase.from('players').select('id').eq('id', playerId).eq('team_id', teamId).maybeSingle();
  if (!player) return { success: false, error: 'Jugador inválido.' };
  const { data: document } = await supabase.from('player_documents').select('storage_path').eq('player_id', playerId).eq('document_type', documentType).maybeSingle();
  if (!document) return { success: false, error: 'Documento no encontrado.' };
  const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(document.storage_path, 60);
  if (error || !data) return { success: false, error: 'No se pudo abrir el documento.' };
  await logAuditEvent({ action: 'delegate.player_document.view', actorType: 'delegate', actorId: access.delegate.id, clientId: access.delegate.client_id, targetType: 'player', targetId: playerId, metadata: { slug, teamId, documentType } });
  return { success: true, data: { url: data.signedUrl } };
}

export async function updateDelegateSchoolLogo(slug: string, teamId: string, logoUrl: string): Promise<DelegateActionResult> {
  const access = await assertDelegateTeam(slug, teamId);
  if (!access.success) return { success: false, error: access.error };

  const safeLogoUrl = logoUrl.trim();
  if (!safeLogoUrl) return { success: false, error: 'URL de logo inválida.' };

  const supabase = createServerSupabaseAdminClient();
  const schoolId = (access.team as any).school_id;
  const { error } = await supabase.from('schools').update({ logo_url: safeLogoUrl }).eq('id', schoolId);
  if (error) return { success: false, error: 'No se pudo actualizar el logo.' };

  await logAuditEvent({
    action: 'delegate.school.logo_update',
    actorType: 'delegate',
    actorId: access.delegate.id,
    clientId: access.delegate.client_id,
    targetType: 'school',
    targetId: schoolId,
    metadata: { slug, teamId },
  });

  return { success: true, data: undefined };
}

export async function uploadDelegateSchoolLogo(slug: string, teamId: string, file: File): Promise<DelegateActionResult<{ publicUrl: string }>> {
  const access = await assertDelegateTeam(slug, teamId);
  if (!access.success) return { success: false, error: access.error };

  if (!file.type.startsWith('image/')) return { success: false, error: 'El archivo debe ser una imagen.' };
  if (file.size > MAX_LOGO_SIZE_BYTES) return { success: false, error: 'El logo no puede superar 800 KB.' };

  const supabase = createServerSupabaseAdminClient();
  const schoolId = (access.team as any).school_id;
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `${access.delegate.client_id}/delegate-schools/${schoolId}-${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) return { success: false, error: 'No se pudo subir el logo.' };

  const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(filePath);
  const publicUrl = publicUrlData.publicUrl;

  const { error } = await supabase.from('schools').update({ logo_url: publicUrl }).eq('id', schoolId);
  if (error) return { success: false, error: 'No se pudo actualizar el logo.' };

  await logAuditEvent({
    action: 'delegate.school.logo_upload',
    actorType: 'delegate',
    actorId: access.delegate.id,
    clientId: access.delegate.client_id,
    targetType: 'school',
    targetId: schoolId,
    metadata: { slug, teamId, size: file.size, type: file.type },
  });

  return { success: true, data: { publicUrl } };
}

export async function changeDelegatePassword(slug: string, currentPassword: string, nextPassword: string): Promise<DelegateActionResult> {
  const delegate = await getDelegateForSlug(slug);
  if (!delegate) return { success: false, error: 'Sesión de delegado no válida.' };
  if (nextPassword.trim().length < 8) return { success: false, error: 'La nueva contraseña debe tener mínimo 8 caracteres.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: freshDelegate } = await supabase
    .from('delegate_users')
    .select('password_hash')
    .eq('id', delegate.id)
    .maybeSingle();

  if (!freshDelegate || !verifyPassword(currentPassword.trim(), freshDelegate.password_hash)) {
    return { success: false, error: 'La contraseña actual no coincide.' };
  }

  const { error } = await supabase
    .from('delegate_users')
    .update({
      password_hash: hashPassword(nextPassword.trim()),
      assigned_password: null,
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', delegate.id);

  if (error?.code === '42703') {
    const fallbackUpdate = await supabase
      .from('delegate_users')
      .update({ password_hash: hashPassword(nextPassword.trim()), updated_at: new Date().toISOString() })
      .eq('id', delegate.id);

    if (fallbackUpdate.error) return { success: false, error: 'No se pudo actualizar la contraseña.' };
    return { success: true, data: undefined };
  }

  if (error) return { success: false, error: 'No se pudo actualizar la contraseña.' };

  return { success: true, data: undefined };
}
