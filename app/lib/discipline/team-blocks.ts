import 'server-only';
import { getDisciplinaryBlocks } from './suspension';

/** Shared live eligibility for the delegate portal and lineup writes. */
export async function loadTeamDisciplinaryBlocks(db: any, teamId: string): Promise<Record<string, string>> {
  const { data: team, error: teamError } = await db.from('teams').select('category_id,categories!inner(tournament_id)').eq('id', teamId).single();
  if (teamError || !team) throw new Error('No se pudo verificar la categoría del equipo.');
  const [events, bulletin] = await Promise.all([
    db.from('match_events').select('id,match_id,team_id,player_id,event_type,fine_status,suspension_matches,period,match_second,minute_record,created_at,matches!inner(matchdays!inner(category_id))')
      .eq('team_id', teamId).eq('matches.matchdays.category_id', team.category_id).in('event_type', ['YELLOW', 'RED']),
    db.from('tournament_bulletins').select('bulletin_number,snapshot').eq('tournament_id', team.categories.tournament_id).order('bulletin_number', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (events.error || bulletin.error) throw new Error('No se pudo verificar la habilitación disciplinaria.');
  const latest = bulletin.data;
  const sanctions = latest?.snapshot?.categories?.find((category: any) => category.id === team.category_id)?.sanctions || [];
  return getDisciplinaryBlocks(events.data || [], sanctions, Number(latest?.bulletin_number || 0));
}
