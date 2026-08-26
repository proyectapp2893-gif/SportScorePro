'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug, teamBelongsToClientSlug } from '@/app/lib/tenant';

type PlayerPhotoResult =
  | { success: true; data: { url: string } }
  | { success: false; error: string };

type TeamCardPhotosResult =
  | { success: true; data: Array<{ playerId: string; url: string }> }
  | { success: false; error: string };

type DelegationBackup = {
  format: 'SPORTSCORE_DELEGATIONS_BACKUP';
  version: 1;
  exportedAt: string;
  tournament: { name: string };
  delegations: Array<{
    school: { name: string; logoUrl: string | null };
    teams: Array<{
      name: string;
      category: { name: string; gender: string | null; sport: string | null };
      staff: Array<{ role: string; fullName: string }>;
      players: Array<{ name: string; identityNumber: string | null; shirtNumber: number | null; birthYear: number | null; birthDate: string | null; vinculo: string | null; relationshipDetail: string | null }>;
    }>;
  }>;
};

type BackupResult<T> = { success: true; data: T } | { success: false; error: string };

const normalized = (value: unknown) => String(value || '').trim().toUpperCase();

export async function exportDelegationsBackup(slug: string, tournamentId: string): Promise<BackupResult<DelegationBackup>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente inválido.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: tournament } = await supabase.from('tournaments').select('id, name').eq('id', tournamentId).eq('client_id', clientId).maybeSingle();
  if (!tournament) return { success: false, error: 'El torneo no pertenece a esta organización.' };

  const { data: teams, error } = await supabase.from('teams').select(`
    id, name,
    schools!inner(id, name, logo_url, client_id),
    categories!inner(name, gender, tournament_id, sports(name)),
    players(name, identity_number, shirt_number, birth_year, birth_date, vinculo, relationship_detail),
    team_staff(role, full_name)
  `).eq('schools.client_id', clientId).eq('categories.tournament_id', tournamentId);
  if (error) return { success: false, error: 'No se pudo preparar el respaldo de delegaciones.' };

  const bySchool = new Map<string, DelegationBackup['delegations'][number]>();
  for (const team of teams || []) {
    const school = team.schools as unknown as { id: string; name: string; logo_url: string | null };
    const category = team.categories as unknown as { name: string; gender: string | null; sports: { name: string } | null };
    if (!bySchool.has(school.id)) bySchool.set(school.id, { school: { name: school.name, logoUrl: school.logo_url }, teams: [] });
    bySchool.get(school.id)?.teams.push({
      name: team.name,
      category: { name: category.name, gender: category.gender, sport: category.sports?.name || null },
      staff: ((team.team_staff || []) as Array<{ role: string; full_name: string }>).map((member) => ({ role: member.role, fullName: member.full_name })),
      players: ((team.players || []) as Array<Record<string, unknown>>).map((player) => ({
        name: String(player.name || ''), identityNumber: player.identity_number ? String(player.identity_number) : null,
        shirtNumber: typeof player.shirt_number === 'number' ? player.shirt_number : null,
        birthYear: typeof player.birth_year === 'number' ? player.birth_year : null,
        birthDate: player.birth_date ? String(player.birth_date) : null, vinculo: player.vinculo ? String(player.vinculo) : null,
        relationshipDetail: player.relationship_detail ? String(player.relationship_detail) : null,
      })),
    });
  }

  const backup: DelegationBackup = { format: 'SPORTSCORE_DELEGATIONS_BACKUP', version: 1, exportedAt: new Date().toISOString(), tournament: { name: tournament.name }, delegations: Array.from(bySchool.values()) };
  await logAuditEvent({ action: 'admin.delegations.backup_export', actorType: 'client', clientId, targetType: 'tournament', targetId: tournamentId, metadata: { slug, delegations: backup.delegations.length } });
  return { success: true, data: backup };
}

export async function importDelegationsBackup(slug: string, tournamentId: string, rawBackup: string): Promise<BackupResult<{ teamsCreated: number; playersCreated: number; playersSkipped: number; staffRestored: number; unmatchedCategories: string[] }>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!rawBackup || rawBackup.length > 5_000_000) return { success: false, error: 'El archivo está vacío o supera 5 MB.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente inválido.' };
  let backup: DelegationBackup;
  try { backup = JSON.parse(rawBackup) as DelegationBackup; } catch { return { success: false, error: 'El archivo JSON no es válido.' }; }
  if (backup?.format !== 'SPORTSCORE_DELEGATIONS_BACKUP' || backup.version !== 1 || !Array.isArray(backup.delegations)) return { success: false, error: 'El archivo no es un respaldo compatible de SportScore.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: tournament } = await supabase.from('tournaments').select('id').eq('id', tournamentId).eq('client_id', clientId).maybeSingle();
  if (!tournament) return { success: false, error: 'El torneo destino no pertenece a esta organización.' };
  const [{ data: categories }, { data: existingSchools }] = await Promise.all([
    supabase.from('categories').select('id, name, gender, sports(name)').eq('tournament_id', tournamentId),
    supabase.from('schools').select('id, name').eq('client_id', clientId),
  ]);
  const categoryByKey = new Map((categories || []).map((category) => [`${normalized((category.sports as unknown as { name?: string })?.name)}|${normalized(category.name)}`, category]));
  const schoolByName = new Map((existingSchools || []).map((school) => [normalized(school.name), school]));
  let teamsCreated = 0, playersCreated = 0, playersSkipped = 0, staffRestored = 0;
  const unmatchedCategories = new Set<string>();

  for (const delegation of backup.delegations.slice(0, 500)) {
    const schoolName = normalized(delegation?.school?.name);
    if (!schoolName || !Array.isArray(delegation.teams)) continue;
    let school = schoolByName.get(schoolName);
    if (!school) {
      const { data } = await supabase.from('schools').insert({ client_id: clientId, name: schoolName, logo_url: delegation.school.logoUrl || null }).select('id, name').single();
      if (!data) continue;
      school = data; schoolByName.set(schoolName, data);
    }
    for (const sourceTeam of delegation.teams.slice(0, 100)) {
      const categoryKey = `${normalized(sourceTeam.category?.sport)}|${normalized(sourceTeam.category?.name)}`;
      const category = categoryByKey.get(categoryKey);
      if (!category) { unmatchedCategories.add(`${sourceTeam.category?.sport || 'Deporte'} / ${sourceTeam.category?.name || 'Categoría'}`); continue; }
      let { data: team } = await supabase.from('teams').select('id').eq('school_id', school.id).eq('category_id', category.id).maybeSingle();
      if (!team) {
        const created = await supabase.from('teams').insert({ school_id: school.id, category_id: category.id, name: normalized(sourceTeam.name) || schoolName, group_name: 'A' }).select('id').single();
        team = created.data; if (team) teamsCreated += 1;
      }
      if (!team) continue;
      const { data: currentPlayers } = await supabase.from('players').select('name, identity_number').eq('team_id', team.id);
      const playerKeys = new Set((currentPlayers || []).map((player) => normalized(player.identity_number) || normalized(player.name)));
      const playersToInsert = (sourceTeam.players || []).slice(0, 500).filter((player) => {
        const key = normalized(player.identityNumber) || normalized(player.name);
        if (!key || playerKeys.has(key)) { playersSkipped += 1; return false; }
        playerKeys.add(key); return true;
      }).map((player) => ({ team_id: team.id, name: normalized(player.name), identity_number: normalized(player.identityNumber) || null, shirt_number: player.shirtNumber, birth_year: player.birthYear, birth_date: player.birthDate, vinculo: normalized(player.vinculo) || null, relationship_detail: player.relationshipDetail?.trim() || null }));
      if (playersToInsert.length > 0) {
        const inserted = await supabase.from('players').insert(playersToInsert).select('id');
        if (!inserted.error) playersCreated += inserted.data?.length || 0;
      }
      const staff = (sourceTeam.staff || []).filter((member) => ['HEAD_COACH', 'ASSISTANT_COACH'].includes(member.role) && normalized(member.fullName)).map((member) => ({ team_id: team.id, role: member.role, full_name: normalized(member.fullName), updated_at: new Date().toISOString() }));
      if (staff.length > 0) { const restored = await supabase.from('team_staff').upsert(staff, { onConflict: 'team_id,role' }); if (!restored.error) staffRestored += staff.length; }
    }
  }
  const result = { teamsCreated, playersCreated, playersSkipped, staffRestored, unmatchedCategories: Array.from(unmatchedCategories) };
  await logAuditEvent({ action: 'admin.delegations.backup_import', actorType: 'client', clientId, targetType: 'tournament', targetId: tournamentId, metadata: { slug, ...result } });
  return { success: true, data: result };
}

export async function getAdminPlayerCardPhotoUrl(slug: string, playerId: string): Promise<PlayerPhotoResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };

  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente inválido.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: player } = await supabase.from('players').select('id, team_id').eq('id', playerId).maybeSingle();
  if (!player || !(await teamBelongsToClientSlug(player.team_id, slug))) {
    return { success: false, error: 'Jugador no encontrado en esta organización.' };
  }

  const { data: photo } = await supabase
    .from('player_documents')
    .select('id, storage_path')
    .eq('player_id', playerId)
    .eq('document_type', 'FACE_PHOTO')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!photo?.storage_path) return { success: false, error: 'Este jugador todavía no tiene foto de rostro.' };

  const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(photo.storage_path, 600);
  if (error || !data?.signedUrl) return { success: false, error: 'No fue posible abrir la foto del jugador.' };

  await logAuditEvent({
    action: 'admin.player_card.view',
    actorType: 'client',
    clientId,
    targetType: 'player',
    targetId: playerId,
    metadata: { slug, photoDocumentId: photo.id },
  });

  return { success: true, data: { url: data.signedUrl } };
}

export async function getAdminTeamCardPhotoUrls(slug: string, teamId: string): Promise<TeamCardPhotosResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a esta organización.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: players, error: playersError } = await supabase.from('players').select('id').eq('team_id', teamId);
  if (playersError) return { success: false, error: 'No se pudo consultar la nómina.' };
  const playerIds = (players || []).map((player) => player.id);
  if (playerIds.length === 0) return { success: true, data: [] };

  const { data: photos, error: photosError } = await supabase
    .from('player_documents')
    .select('player_id, storage_path, updated_at')
    .in('player_id', playerIds)
    .eq('document_type', 'FACE_PHOTO')
    .order('updated_at', { ascending: false });
  if (photosError) return { success: false, error: 'No se pudieron consultar las fotografías.' };

  const latestByPlayer = new Map<string, string>();
  for (const photo of photos || []) {
    if (!latestByPlayer.has(photo.player_id)) latestByPlayer.set(photo.player_id, photo.storage_path);
  }

  const signedPhotos = await Promise.all(Array.from(latestByPlayer.entries()).map(async ([playerId, storagePath]) => {
    const { data } = await supabase.storage.from('player-documents').createSignedUrl(storagePath, 600);
    return data?.signedUrl ? { playerId, url: data.signedUrl } : null;
  }));

  return { success: true, data: signedPhotos.filter((photo): photo is { playerId: string; url: string } => Boolean(photo)) };
}
