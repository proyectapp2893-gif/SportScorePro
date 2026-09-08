'use server';

import { randomUUID } from 'crypto';
import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { categoryBelongsToClientSlug, getClientIdBySlug, teamBelongsToClientSlug } from '@/app/lib/tenant';

type RosterActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type PlayerInput = {
  name: string;
  identityNumber?: string | null;
  shirtNumber?: number | null;
  birthYear?: number | null;
  birthDate?: string | null;
  vinculo?: string | null;
  relationshipDetail?: string | null;
  strictRegistration?: boolean;
};

export async function copyRosterBetweenTeams(slug: string, sourceTeamId: string, destinationTeamId: string): Promise<RosterActionResult<{ players: number; documents: number; skipped: number }>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (sourceTeamId === destinationTeamId || !(await teamBelongsToClientSlug(sourceTeamId, slug)) || !(await teamBelongsToClientSlug(destinationTeamId, slug))) return { success: false, error: 'Los equipos seleccionados no son válidos para esta institución.' };
  const supabase = createServerSupabaseAdminClient();
  const [{ data: sourceTeam }, { data: destinationTeam }] = await Promise.all([
    supabase.from('teams').select('id, school_id, categories!inner(tournament_id)').eq('id', sourceTeamId).maybeSingle(),
    supabase.from('teams').select('id, school_id, categories!inner(tournament_id, registration_open, registration_deadline)').eq('id', destinationTeamId).maybeSingle(),
  ]);
  if (!sourceTeam || !destinationTeam || sourceTeam.school_id !== destinationTeam.school_id) return { success: false, error: 'El traslado solo se permite entre equipos de la misma delegación.' };
  const destinationCategory = (destinationTeam as any).categories;
  if (destinationCategory?.registration_open === false || (destinationCategory?.registration_deadline && new Date(destinationCategory.registration_deadline).getTime() < Date.now())) return { success: false, error: 'La inscripción del torneo destino está cerrada.' };
  const { data: sourcePlayers, error } = await supabase.from('players').select('id, name, identity_number, shirt_number, birth_year, birth_date, vinculo, relationship_detail, player_documents(id, document_type, storage_path, original_filename, mime_type, file_size, status, rejection_reason, reviewed_at)').eq('team_id', sourceTeamId).order('name');
  if (error) return { success: false, error: 'No se pudo leer la nómina de origen.' };
  const identities = (sourcePlayers || []).map((player: any) => player.identity_number).filter(Boolean);
  const { data: existing } = identities.length ? await supabase.from('players').select('id, identity_number').eq('team_id', destinationTeamId).in('identity_number', identities) : { data: [] as any[] };
  const byIdentity = new Map((existing || []).map((player: any) => [player.identity_number, player.id]));
  let playersCopied = 0; let documentsCopied = 0; let skipped = 0;
  for (const sourcePlayer of sourcePlayers || []) {
    let targetId = byIdentity.get(sourcePlayer.identity_number);
    if (!targetId) {
      const inserted = await supabase.from('players').insert({ team_id: destinationTeamId, name: sourcePlayer.name, identity_number: sourcePlayer.identity_number, shirt_number: sourcePlayer.shirt_number, birth_year: sourcePlayer.birth_year, birth_date: sourcePlayer.birth_date, vinculo: sourcePlayer.vinculo, relationship_detail: sourcePlayer.relationship_detail }).select('id').single();
      if (inserted.error || !inserted.data) { skipped += 1; continue; }
      targetId = inserted.data.id; playersCopied += 1;
    } else skipped += 1;
    const { data: targetDocs } = await supabase.from('player_documents').select('document_type').eq('player_id', targetId);
    const targetTypes = new Set((targetDocs || []).map((doc: any) => doc.document_type));
    for (const sourceDoc of sourcePlayer.player_documents || []) {
      if (!sourceDoc.storage_path || targetTypes.has(sourceDoc.document_type)) continue;
      const file = await supabase.storage.from('player-documents').download(sourceDoc.storage_path);
      if (file.error || !file.data) continue;
      const ext = sourceDoc.mime_type === 'application/pdf' ? 'pdf' : (sourceDoc.mime_type || 'image/jpeg').split('/')[1].replace('jpeg', 'jpg');
      const path = `${(await getClientIdBySlug(slug)) || 'tenant'}/${destinationTeamId}/${targetId}/${sourceDoc.document_type.toLowerCase()}-${randomUUID()}.${ext}`;
      const uploaded = await supabase.storage.from('player-documents').upload(path, file.data, { contentType: sourceDoc.mime_type || file.data.type, upsert: false });
      if (uploaded.error) continue;
      const record = await supabase.from('player_documents').insert({ player_id: targetId, document_type: sourceDoc.document_type, storage_path: path, original_filename: sourceDoc.original_filename, mime_type: sourceDoc.mime_type || file.data.type, file_size: sourceDoc.file_size || file.data.size, status: sourceDoc.status || 'PENDING', rejection_reason: sourceDoc.rejection_reason || null, reviewed_at: sourceDoc.reviewed_at || null, updated_at: new Date().toISOString() });
      if (record.error) { await supabase.storage.from('player-documents').remove([path]); continue; }
      documentsCopied += 1;
    }
  }
  await logAuditEvent({ action: 'admin.roster.copy_between_tournaments', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'team', targetId: destinationTeamId, metadata: { slug, sourceTeamId, destinationTeamId, playersCopied, documentsCopied, skipped } });
  return { success: true, data: { players: playersCopied, documents: documentsCopied, skipped } };
}

export async function getOrCreateRosterTeam(
  slug: string,
  categoryId: string,
  schoolId: string,
  schoolName: string,
): Promise<RosterActionResult<{ id: string; name: string; school_id: string; category_id: string }>> {
  if (!(await hasAdminSession(slug))) {
    return { success: false, error: 'Sesión de administrador no válida.' };
  }

  if (!(await categoryBelongsToClientSlug(categoryId, slug))) {
    return { success: false, error: 'La categoría no pertenece a este cliente.' };
  }

  const supabase = createServerSupabaseAdminClient();
  const { data: existingTeam } = await supabase
    .from('teams')
    .select('id, name, school_id, category_id')
    .eq('school_id', schoolId)
    .eq('category_id', categoryId)
    .maybeSingle();

  if (existingTeam) return { success: true, data: existingTeam };

  const clientId = await getClientIdBySlug(slug);
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('id')
    .eq('id', schoolId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (schoolError || !school) {
    return { success: false, error: 'La institución no pertenece a este cliente.' };
  }

  const { data: newTeam, error } = await supabase
    .from('teams')
    .insert({
      school_id: schoolId,
      category_id: categoryId,
      name: schoolName.trim().toUpperCase(),
    })
    .select('id, name, school_id, category_id')
    .single();

  if (error || !newTeam) {
    return { success: false, error: 'Error en la sincronización de delegación.' };
  }

  await logAuditEvent({
    action: 'admin.roster.team_create',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: newTeam.id,
    metadata: { slug, categoryId, schoolId },
  });

  return { success: true, data: newTeam };
}

export async function updateRosterTeamName(slug: string, teamId: string, name: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };

  const safeName = name.trim().toUpperCase();
  if (!safeName) return { success: false, error: 'Nombre inválido.' };

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('teams').update({ name: safeName }).eq('id', teamId);
  if (error) return { success: false, error: 'No se pudo renombrar la delegación.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.team_rename',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: teamId,
    metadata: { slug, name: safeName },
  });

  return { success: true, data: undefined };
}

export async function deleteRosterTeam(slug: string, teamId: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };

  const supabase = createServerSupabaseAdminClient();
  await supabase.from('players').delete().eq('team_id', teamId);
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) return { success: false, error: 'Error al remover delegación.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.team_delete',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: teamId,
    metadata: { slug },
  });

  return { success: true, data: undefined };
}

export async function deleteRosterPlayer(slug: string, playerId: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .maybeSingle();

  if (fetchError || !player || !(await teamBelongsToClientSlug(player.team_id, slug))) {
    return { success: false, error: 'El jugador no pertenece a este cliente.' };
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) return { success: false, error: 'Error al procesar la baja.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.player_delete',
    actorType: 'client',
    clientId,
    targetType: 'player',
    targetId: playerId,
    metadata: { slug, teamId: player.team_id },
  });

  return { success: true, data: undefined };
}

export async function loadRosterPlayerDocuments(slug: string, teamId: string): Promise<RosterActionResult<any[]>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase.from('player_documents').select('id, player_id, document_type, status, rejection_reason, original_filename, updated_at, players!inner(team_id)').eq('players.team_id', teamId).order('updated_at', { ascending: false });
  if (error) return { success: false, error: 'No se pudieron cargar los documentos.' };
  return { success: true, data: data || [] };
}

export async function openRosterPlayerDocument(slug: string, documentId: string): Promise<RosterActionResult<{ url: string }>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: document } = await supabase.from('player_documents').select('id, player_id, storage_path, players!inner(team_id)').eq('id', documentId).maybeSingle();
  const teamId = (document as any)?.players?.team_id;
  if (!document || !teamId || !(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'Documento inválido.' };
  const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(document.storage_path, 60);
  if (error || !data) return { success: false, error: 'No se pudo abrir el documento.' };
  await logAuditEvent({ action: 'admin.player_document.view', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'player', targetId: document.player_id, metadata: { slug, documentId } });
  return { success: true, data: { url: data.signedUrl } };
}

export async function reviewRosterPlayerDocument(slug: string, documentId: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: document } = await supabase.from('player_documents').select('id, player_id, players!inner(team_id)').eq('id', documentId).maybeSingle();
  const teamId = (document as any)?.players?.team_id;
  if (!document || !teamId || !(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'Documento inválido.' };
  const reason = rejectionReason?.trim() || null;
  if (status === 'REJECTED' && !reason) return { success: false, error: 'Indica el motivo del rechazo.' };
  const { error } = await supabase.from('player_documents').update({ status, rejection_reason: status === 'REJECTED' ? reason : null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', documentId);
  if (error) return { success: false, error: 'No se pudo actualizar la revisión.' };
  await logAuditEvent({ action: 'admin.player_document.review', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'player', targetId: document.player_id, metadata: { slug, documentId, status, rejectionReason: reason } });
  return { success: true, data: undefined };
}

export async function addRosterPlayers(
  slug: string,
  teamId: string,
  players: PlayerInput[],
): Promise<RosterActionResult<{ inserted: number }>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };

  const normalizeBirthDate = (value: string | null | undefined) => {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{8}$/.test(raw)) return `${raw.slice(4)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}`;
    const match = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : raw;
  };

  const formattedPlayers = players
    .map((player) => ({
      team_id: teamId,
      name: player.name.trim().toUpperCase(),
      identity_number: player.identityNumber?.trim().replace(/\D/g, '') || null,
      shirt_number: player.shirtNumber ?? null,
      birth_year: player.birthYear ?? null,
      birth_date: normalizeBirthDate(player.birthDate) || null,
      vinculo: player.vinculo?.trim().toUpperCase() || null,
      relationship_detail: player.relationshipDetail?.trim().toUpperCase() || null,
      strict_registration: Boolean(player.strictRegistration),
    }))
    .filter((player) => player.name)
    .map((player) => ({ ...player, birth_year: player.birth_date ? Number(player.birth_date.slice(0, 4)) : player.birth_year }));

  const strictPlayers = formattedPlayers.filter((player) => player.strict_registration);
  if (strictPlayers.some((player) => !player.identity_number || player.identity_number.length < 5 || player.identity_number.length > 30)) return { success: false, error: 'Todos los jugadores deben tener una identificación válida.' };
  if (new Set(strictPlayers.map((player) => player.identity_number)).size !== strictPlayers.length) return { success: false, error: 'Hay números de identidad repetidos en la carga.' };
  if (strictPlayers.some((player) => !Number.isInteger(player.shirt_number) || Number(player.shirt_number) < 1 || Number(player.shirt_number) > 999)) return { success: false, error: 'Todos los dorsales deben ser enteros entre 1 y 999.' };
  if (new Set(strictPlayers.map((player) => player.shirt_number)).size !== strictPlayers.length) return { success: false, error: 'Hay dorsales repetidos en la carga.' };
  if (strictPlayers.some((player) => !player.birth_date || Number.isNaN(Date.parse(player.birth_date)))) return { success: false, error: 'Todos los jugadores deben tener una fecha de nacimiento completa.' };
  if (strictPlayers.some((player) => !['PADRE DE FAMILIA', 'EX-ALUMNO', 'COLABORADOR'].includes(player.vinculo || ''))) return { success: false, error: 'El vínculo debe ser PADRE DE FAMILIA, EX-ALUMNO o COLABORADOR.' };
  if (strictPlayers.some((player) => player.vinculo === 'EX-ALUMNO' && !/^\d{4}$/.test(player.relationship_detail || ''))) return { success: false, error: 'Los ex-alumnos deben indicar el año de promoción.' };
  if (strictPlayers.some((player) => player.vinculo === 'PADRE DE FAMILIA' && (player.relationship_detail || '').length < 5)) return { success: false, error: 'Los padres de familia deben indicar el nombre completo del estudiante.' };

  const { data: teamCategory } = await createServerSupabaseAdminClient()
    .from('teams')
    .select('categories(tournament_id, tournaments(tournament_format, schedule_dates))')
    .eq('id', teamId)
    .maybeSingle();
  if ((teamCategory as any)?.categories?.tournaments?.tournament_format === 'THREE_STAGE_35') {
    const tournamentDate = String((teamCategory as any)?.categories?.tournaments?.schedule_dates?.[0] || `${new Date().getFullYear()}-12-31`);
    const cutoff = new Date(`${tournamentDate}T12:00:00`); cutoff.setFullYear(cutoff.getFullYear() - 35);
    if (formattedPlayers.some((player) => player.birth_date ? new Date(`${player.birth_date}T12:00:00`) > cutoff : !player.birth_year || Number(player.birth_year) > cutoff.getFullYear())) {
      return { success: false, error: `Todos los participantes deben tener 35 años cumplidos al iniciar el torneo (${tournamentDate}).` };
    }
  }

  if (formattedPlayers.length === 0) return { success: false, error: 'No hay jugadores válidos.' };

  const supabase = createServerSupabaseAdminClient();
  if (strictPlayers.length) {
    const identities = strictPlayers.map((player) => player.identity_number as string);
    const { data: existing } = await supabase.from('players').select('identity_number, teams!inner(categories!inner(tournament_id))').in('identity_number', identities).eq('teams.categories.tournament_id', (teamCategory as any)?.categories?.tournament_id).limit(1);
    if (existing?.length) return { success: false, error: `La identidad ${existing[0].identity_number} ya está inscrita en este torneo.` };
  }
  const rowsToInsert = formattedPlayers.map(({ strict_registration: _strictRegistration, ...player }) => player);
  const { error } = await supabase.from('players').insert(rowsToInsert);
  if (error) return { success: false, error: 'Error al registrar jugadores.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.players_create',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: teamId,
    metadata: { slug, inserted: formattedPlayers.length },
  });

  return { success: true, data: { inserted: formattedPlayers.length } };
}

export async function updateRosterPlayer(slug: string, playerId: string, input: PlayerInput): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: current } = await supabase.from('players').select('id,team_id').eq('id', playerId).maybeSingle();
  if (!current || !(await teamBelongsToClientSlug(current.team_id, slug))) return { success: false, error: 'El jugador no pertenece a este cliente.' };
  const player = {
    name: String(input.name || '').trim().toUpperCase(),
    identity_number: input.identityNumber?.trim() || null,
    shirt_number: input.shirtNumber ?? null,
    birth_date: input.birthDate || null,
    birth_year: input.birthDate ? Number(input.birthDate.slice(0, 4)) : input.birthYear ?? null,
    vinculo: input.vinculo?.trim().toUpperCase() || null,
    relationship_detail: input.relationshipDetail?.trim().toUpperCase() || null,
  };
  if (!player.name) return { success: false, error: 'Ingresa el nombre completo.' };
  if (player.identity_number && !/^\d{5,30}$/.test(player.identity_number)) return { success: false, error: 'La identificación debe tener entre 5 y 30 dígitos.' };
  if (player.shirt_number !== null && (!Number.isInteger(player.shirt_number) || player.shirt_number < 1 || player.shirt_number > 999)) return { success: false, error: 'El dorsal debe estar entre 1 y 999.' };
  if (player.birth_date && (!/^\d{4}-\d{2}-\d{2}$/.test(player.birth_date) || Number.isNaN(Date.parse(player.birth_date)) || new Date(player.birth_date).toISOString().slice(0, 10) !== player.birth_date || new Date(player.birth_date) > new Date())) return { success: false, error: 'Fecha de nacimiento inválida.' };
  if (player.birth_year !== null && (!Number.isInteger(player.birth_year) || player.birth_year < 1900 || player.birth_year > new Date().getFullYear())) return { success: false, error: 'Año de nacimiento inválido.' };
  const { data: team, error: teamError } = await supabase.from('teams').select('categories(tournament_id,tournaments(tournament_format,schedule_dates))').eq('id', current.team_id).single();
  if (teamError) return { success: false, error: 'No se pudo verificar el torneo.' };
  const category = (team as any).categories;
  if (category?.tournaments?.tournament_format === 'THREE_STAGE_35') {
    const date = String(category.tournaments.schedule_dates?.[0] || `${new Date().getFullYear()}-12-31`);
    const cutoff = new Date(`${date}T12:00:00`); cutoff.setFullYear(cutoff.getFullYear() - 35);
    if (player.birth_date ? new Date(`${player.birth_date}T12:00:00`) > cutoff : !player.birth_year || player.birth_year > cutoff.getFullYear()) return { success: false, error: 'El participante debe tener 35 años cumplidos al iniciar el torneo.' };
  }
  if (player.identity_number) {
    const duplicate = await supabase.from('players').select('id,teams!inner(categories!inner(tournament_id))').eq('identity_number', player.identity_number).eq('teams.categories.tournament_id', category.tournament_id).neq('id', playerId).limit(1);
    if (duplicate.error) return { success: false, error: 'No se pudo verificar la identificación.' };
    if (duplicate.data?.length) return { success: false, error: 'Esta identificación ya está inscrita en el torneo.' };
  }
  if (player.shirt_number !== null) {
    const duplicate = await supabase.from('players').select('id').eq('team_id', current.team_id).eq('shirt_number', player.shirt_number).neq('id', playerId).limit(1);
    if (duplicate.error) return { success: false, error: 'No se pudo verificar el dorsal.' };
    if (duplicate.data?.length) return { success: false, error: 'El dorsal ya está usado por otro jugador del equipo.' };
  }
  const { data: saved, error } = await supabase.from('players').update(player).eq('id', playerId).eq('team_id', current.team_id).select('id').single();
  if (error || !saved) return { success: false, error: 'No se pudo actualizar el jugador.' };
  await logAuditEvent({ action: 'admin.roster.player_update', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'player', targetId: playerId, metadata: { slug, teamId: current.team_id } });
  return { success: true, data: undefined };
}

export async function uploadRosterPlayerDocument(slug: string, playerId: string, documentType: string, file: File): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: player } = await supabase.from('players').select('id,team_id').eq('id', playerId).maybeSingle();
  if (!player || !(await teamBelongsToClientSlug(player.team_id, slug))) return { success: false, error: 'El jugador no pertenece a este cliente.' };
  if (!['FACE_PHOTO', 'IDENTITY_FRONT', 'IDENTITY_BACK'].includes(documentType)) return { success: false, error: 'Tipo de documento inválido.' };
  if (!(file instanceof File) || file.size <= 0 || file.size > 5 * 1024 * 1024) return { success: false, error: 'El archivo debe pesar máximo 5 MB y no estar vacío.' };
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  if (!extensions[file.type] || (documentType === 'FACE_PHOTO' && file.type === 'application/pdf')) return { success: false, error: 'Usa JPG, PNG o WebP para la foto; el documento también acepta PDF.' };
  const previous = await supabase.from('player_documents').select('storage_path').eq('player_id', playerId).eq('document_type', documentType).maybeSingle();
  if (previous.error) return { success: false, error: 'No se pudo consultar el archivo actual.' };
  const clientId = await getClientIdBySlug(slug);
  const storagePath = `${clientId}/${player.team_id}/${playerId}/${documentType.toLowerCase()}-${randomUUID()}.${extensions[file.type]}`;
  const upload = await supabase.storage.from('player-documents').upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upload.error) return { success: false, error: 'No se pudo subir el archivo.' };
  const record = await supabase.from('player_documents').upsert({ player_id: playerId, document_type: documentType, storage_path: storagePath, original_filename: file.name.slice(0, 180), mime_type: file.type, file_size: file.size, status: 'PENDING', rejection_reason: null, reviewed_at: null, uploaded_by_delegate_id: null, updated_at: new Date().toISOString() }, { onConflict: 'player_id,document_type' });
  if (record.error) {
    await supabase.storage.from('player-documents').remove([storagePath]);
    return { success: false, error: 'No se pudo guardar el archivo. El anterior se conserva.' };
  }
  if (previous.data?.storage_path) await supabase.storage.from('player-documents').remove([previous.data.storage_path]);
  await logAuditEvent({ action: 'admin.player_document.upload', actorType: 'client', clientId, targetType: 'player', targetId: playerId, metadata: { slug, documentType } });
  return { success: true, data: undefined };
}
