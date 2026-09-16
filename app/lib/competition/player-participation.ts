import { REQUIRED_REGULAR_PARTICIPATIONS, participationEligible } from './participation';

export async function getRegularParticipationCounts(db: any, playerIds: string[], categoryId: string) {
  if (!playerIds.length) return new Map<string, number>();
  const [{ data: records }, { data: events }] = await Promise.all([
    db.from('player_match_participation').select('player_id,match_id,status,matches!inner(matchdays!inner(category_id))').in('player_id', playerIds).eq('status', 'CONFIRMED').eq('matches.matchdays.category_id', categoryId),
    db.from('match_events').select('player_id,match_id,matches!inner(matchdays!inner(category_id,competition_stages(stage_type)))').in('player_id', playerIds).eq('matches.matchdays.category_id', categoryId).in('event_type', ['STARTING_LINEUP', 'SUB_IN']),
  ]);
  const matchesByPlayer = new Map<string, Set<string>>();
  for (const row of records || []) {
    const bucket = matchesByPlayer.get(row.player_id) || new Set<string>(); bucket.add(row.match_id); matchesByPlayer.set(row.player_id, bucket);
  }
  for (const event of events || []) {
    const stageType = (event as any).matches?.matchdays?.competition_stages?.stage_type;
    if (stageType === 'FINALS') continue;
    const bucket = matchesByPlayer.get(event.player_id) || new Set<string>(); bucket.add(event.match_id); matchesByPlayer.set(event.player_id, bucket);
  }
  return new Map(playerIds.map(id => [id, matchesByPlayer.get(id)?.size || 0]));
}

export async function validateFinalLineup(db: any, playerIds: string[], categoryId: string) {
  const counts = await getRegularParticipationCounts(db, playerIds, categoryId);
  const blocked = playerIds.filter(id => !participationEligible(counts.get(id) || 0));
  return { counts, blocked, required: REQUIRED_REGULAR_PARTICIPATIONS };
}
