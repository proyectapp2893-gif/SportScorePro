export function adminDashboardPath(slug: string, tournamentId?: string) {
  return `/${slug}/admin${tournamentId ? `?tournament=${encodeURIComponent(tournamentId)}` : ''}`;
}

export function adminTournamentModulePath(slug: string, module: string, tournamentId: string) {
  return `/${slug}/admin/${module}?tournament=${encodeURIComponent(tournamentId)}`;
}

export function adminCategoryModulePath(slug: string, module: string, tournamentId: string, categoryId: string) {
  return `/${slug}/admin/${module}?cat=${encodeURIComponent(categoryId)}&tournament=${encodeURIComponent(tournamentId)}`;
}
