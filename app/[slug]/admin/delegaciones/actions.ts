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
