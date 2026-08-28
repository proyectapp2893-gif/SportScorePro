export type TournamentSelection = { id: string; isActive?: boolean };

export function tournamentStorageKey(slug: string) {
  return `sportscore:admin-tournament:${slug}`;
}

export function resolveTournamentSelection(tournaments: TournamentSelection[], queryId?: string | null, storedId?: string | null) {
  const belongs = (id?: string | null) => Boolean(id && tournaments.some((tournament) => tournament.id === id));
  if (belongs(queryId)) return queryId!;
  if (belongs(storedId)) return storedId!;
  return tournaments.find((tournament) => tournament.isActive)?.id || tournaments[0]?.id || '';
}
