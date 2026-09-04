'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';

const MAX_PDF_BYTES = 5 * 1024 * 1024;

async function ownedTournament(slug: string, tournamentId: string) {
  if (!(await hasAdminSession(slug))) return null;
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return null;
  const supabase = createServerSupabaseAdminClient();
  const { data } = await supabase.from('tournaments').select('id').eq('id', tournamentId).eq('client_id', clientId).maybeSingle();
  return data;
}

export async function uploadTournamentStatutes(slug: string, tournamentId: string, file: File) {
  if (!(await ownedTournament(slug, tournamentId))) return { success: false as const, error: 'El torneo no existe o la sesión no es válida.' };
  if (!(file instanceof File) || file.size <= 0) return { success: false as const, error: 'Selecciona un archivo PDF.' };
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) return { success: false as const, error: 'El archivo debe estar en formato PDF.' };
  if (file.size > MAX_PDF_BYTES) return { success: false as const, error: 'El PDF debe pesar máximo 5 MB.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: previous } = await supabase.from('tournament_statutes').select('storage_path').eq('tournament_id', tournamentId).maybeSingle();
  const storagePath = `${tournamentId}/estatutos-${randomUUID()}.pdf`;
  const uploaded = await supabase.storage.from('tournament-statutes').upload(storagePath, file, { contentType: 'application/pdf', upsert: false });
  if (uploaded.error) return { success: false as const, error: 'No se pudo cargar el PDF.' };

  const saved = await supabase.from('tournament_statutes').upsert({
    tournament_id: tournamentId,
    storage_path: storagePath,
    original_filename: file.name.slice(0, 180),
    file_size: file.size,
    uploaded_at: new Date().toISOString(),
  }, { onConflict: 'tournament_id' });
  if (saved.error) {
    await supabase.storage.from('tournament-statutes').remove([storagePath]);
    return { success: false as const, error: 'No se pudo registrar el documento.' };
  }
  if (previous?.storage_path) await supabase.storage.from('tournament-statutes').remove([previous.storage_path]);
  revalidatePath(`/${slug}/admin/estatutos`);
  revalidatePath(`/${slug}/delegado`);
  return { success: true as const };
}

export async function deleteTournamentStatutes(slug: string, tournamentId: string) {
  if (!(await ownedTournament(slug, tournamentId))) return { success: false as const, error: 'El torneo no existe o la sesión no es válida.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: current } = await supabase.from('tournament_statutes').select('storage_path').eq('tournament_id', tournamentId).maybeSingle();
  if (!current) return { success: true as const };
  const removed = await supabase.from('tournament_statutes').delete().eq('tournament_id', tournamentId);
  if (removed.error) return { success: false as const, error: 'No se pudo retirar el documento.' };
  await supabase.storage.from('tournament-statutes').remove([current.storage_path]);
  revalidatePath(`/${slug}/admin/estatutos`);
  revalidatePath(`/${slug}/delegado`);
  return { success: true as const };
}

export async function getAdminStatutesUrl(slug: string, tournamentId: string) {
  if (!(await ownedTournament(slug, tournamentId))) return { success: false as const, error: 'Acceso no autorizado.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: document } = await supabase.from('tournament_statutes').select('storage_path').eq('tournament_id', tournamentId).maybeSingle();
  if (!document) return { success: false as const, error: 'No hay estatutos publicados.' };
  const { data, error } = await supabase.storage.from('tournament-statutes').createSignedUrl(document.storage_path, 300);
  if (error || !data?.signedUrl) return { success: false as const, error: 'No se pudo abrir el PDF.' };
  return { success: true as const, url: data.signedUrl };
}
