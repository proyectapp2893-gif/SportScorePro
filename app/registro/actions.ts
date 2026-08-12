'use server';

import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';

type PublicPlayerInput = {
  name: string;
  shirtNumber: number;
  birthYear: number;
};

type PublicRegistrationResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function schoolAndCategoryExist(schoolId: string, categoryId: string) {
  const supabase = createServerSupabaseAdminClient();
  const [{ data: school }, { data: category }] = await Promise.all([
    supabase.from('schools').select('id, name').eq('id', schoolId).maybeSingle(),
    supabase.from('categories').select('id').eq('id', categoryId).maybeSingle(),
  ]);

  if (!school || !category) return null;
  return { schoolName: String(school.name || '').trim() };
}

async function teamBelongsToSelection(teamId: string, schoolId?: string, categoryId?: string) {
  const supabase = createServerSupabaseAdminClient();
  let query = supabase.from('teams').select('id, school_id, category_id').eq('id', teamId);
  if (schoolId) query = query.eq('school_id', schoolId);
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

export async function getOrCreatePublicRegistrationTeam(
  schoolId: string,
  categoryId: string,
): Promise<PublicRegistrationResult<{ id: string; name: string }>> {
  const validSelection = await schoolAndCategoryExist(schoolId, categoryId);
  if (!validSelection) return { success: false, error: 'Colegio o categoría inválida.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: existingTeam } = await supabase
    .from('teams')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('category_id', categoryId)
    .maybeSingle();

  if (existingTeam) return { success: true, data: existingTeam };

  const { data: newTeam, error } = await supabase
    .from('teams')
    .insert({
      school_id: schoolId,
      category_id: categoryId,
      name: validSelection.schoolName,
    })
    .select('id, name')
    .single();

  if (error || !newTeam) return { success: false, error: 'Error al crear la delegación.' };
  return { success: true, data: newTeam };
}

export async function updatePublicRegistrationTeamName(teamId: string, name: string): Promise<PublicRegistrationResult> {
  const safeName = name.trim().toUpperCase();
  if (!safeName) return { success: false, error: 'Nombre inválido.' };
  if (!(await teamBelongsToSelection(teamId))) return { success: false, error: 'Delegación inválida.' };

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('teams').update({ name: safeName }).eq('id', teamId);
  if (error) return { success: false, error: 'Error al actualizar el nombre.' };
  return { success: true, data: undefined };
}

export async function deletePublicRegistrationTeam(teamId: string): Promise<PublicRegistrationResult> {
  if (!(await teamBelongsToSelection(teamId))) return { success: false, error: 'Delegación inválida.' };

  const supabase = createServerSupabaseAdminClient();
  await supabase.from('players').delete().eq('team_id', teamId);
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) return { success: false, error: 'Error al eliminar la delegación.' };
  return { success: true, data: undefined };
}

export async function deletePublicRegistrationPlayer(playerId: string): Promise<PublicRegistrationResult> {
  const supabase = createServerSupabaseAdminClient();
  const { data: player } = await supabase.from('players').select('id').eq('id', playerId).maybeSingle();
  if (!player) return { success: false, error: 'Atleta inválido.' };

  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) return { success: false, error: 'Error al dar de baja al atleta.' };
  return { success: true, data: undefined };
}

export async function addPublicRegistrationPlayers(
  schoolId: string,
  categoryId: string,
  players: PublicPlayerInput[],
): Promise<PublicRegistrationResult<{ team: { id: string; name: string }; inserted: number }>> {
  const teamResult = await getOrCreatePublicRegistrationTeam(schoolId, categoryId);
  if (!teamResult.success) return teamResult;

  const formattedPlayers = players
    .map((player) => ({
      team_id: teamResult.data.id,
      name: player.name.trim().toUpperCase(),
      shirt_number: Number.isFinite(player.shirtNumber) ? player.shirtNumber : 0,
      birth_year: Number.isFinite(player.birthYear) ? player.birthYear : 0,
    }))
    .filter((player) => player.name && player.name !== 'UNDEFINED');

  if (formattedPlayers.length === 0) return { success: false, error: 'No hay atletas válidos.' };

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('players').insert(formattedPlayers);
  if (error) return { success: false, error: 'Error al registrar atletas.' };

  return { success: true, data: { team: teamResult.data, inserted: formattedPlayers.length } };
}
