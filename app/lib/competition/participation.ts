export const REQUIRED_REGULAR_PARTICIPATIONS = 4;

export function participationEligible(count: number, required = REQUIRED_REGULAR_PARTICIPATIONS) {
  return Number(count) >= required;
}

export function regularParticipationCount(records: Array<{ player_id: string; match_id: string; status?: string | null }>, playerId: string) {
  return new Set(records.filter(record => record.player_id === playerId && (record.status || 'CONFIRMED') === 'CONFIRMED').map(record => record.match_id)).size;
}
