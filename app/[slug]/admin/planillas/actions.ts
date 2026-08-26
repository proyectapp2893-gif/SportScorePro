'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { categoryBelongsToClientSlug } from '@/app/lib/tenant';

export async function loadMatchSheets(slug: string, categoryId: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión de administrador no válida.' };
  if (!(await categoryBelongsToClientSlug(categoryId, slug))) return { success: false as const, error: 'La categoría no pertenece a esta organización.' };
  const supabase = createServerSupabaseAdminClient();
  const [{ data: category }, { data: matches, error }] = await Promise.all([
    supabase.from('categories').select('id, name, gender, sports(name), tournaments(name)').eq('id', categoryId).maybeSingle(),
    supabase.from('matches').select(`
      id, status, scheduled_time, venue, home_score, away_score,
      matchdays!inner(round_number, scheduled_date, category_id),
      home_team:teams!home_team_id(id, name, schools(name, logo_url)),
      away_team:teams!away_team_id(id, name, schools(name, logo_url))
    `).eq('matchdays.category_id', categoryId).not('away_team_id', 'is', null),
  ]);
  if (error) return { success: false as const, error: 'No se pudieron cargar los partidos y sus nóminas.' };
  const teamIds = Array.from(new Set((matches || []).flatMap((match: any) => [match.home_team?.id, match.away_team?.id]).filter(Boolean)));
  const { data: players, error: playersError } = teamIds.length > 0
    ? await supabase.from('players').select('id, team_id, name, shirt_number, birth_year, birth_date, vinculo').in('team_id', teamIds).order('shirt_number', { ascending: true })
    : { data: [], error: null };
  if (playersError) return { success: false as const, error: 'Los partidos cargaron, pero no fue posible consultar las nóminas.' };
  const playersByTeam = (players || []).reduce((groups: Record<string, any[]>, player: any) => { (groups[player.team_id] ||= []).push(player); return groups; }, {});
  const ordered = (matches || []).map((match: any) => ({ ...match, home_team: { ...match.home_team, players: playersByTeam[match.home_team?.id] || [] }, away_team: { ...match.away_team, players: playersByTeam[match.away_team?.id] || [] } })).sort((a: any, b: any) => Number(a.matchdays?.round_number || 0) - Number(b.matchdays?.round_number || 0) || String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || '')));
  return { success: true as const, data: { category, matches: ordered } };
}
