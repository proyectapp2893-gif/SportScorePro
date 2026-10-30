type DelegateMatch = {
  status?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team?: { name?: string } | null;
  away_team?: { name?: string } | null;
  scheduled_time?: string | null;
  matchdays?: { scheduled_date?: string | null; round_number?: number | null } | null;
};

function scheduledAt(match: DelegateMatch): number {
  const date = match.matchdays?.scheduled_date;
  if (!date) return Number.POSITIVE_INFINITY;
  const time = match.scheduled_time?.slice(0, 8) || '00:00:00';
  // El horario del fixture se guarda en hora local de Colombia.
  const timestamp = Date.parse(`${date}T${time.padEnd(8, ':00').slice(0, 8)}-05:00`);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function getUpcomingDelegateMatches<T extends DelegateMatch>(matches: T[], now = new Date()): T[] {
  return matches
    .filter((match) => match.home_team_id && match.away_team_id && (
      match.status === 'LIVE' || (match.status === 'SCHEDULED' && Number.isFinite(scheduledAt(match)) && scheduledAt(match) >= now.getTime())
    ))
    .sort((a, b) => {
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
      return scheduledAt(a) - scheduledAt(b);
    });
}
