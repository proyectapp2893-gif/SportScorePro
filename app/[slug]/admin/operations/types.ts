export type OperationsMetric = { value: number; error: null } | { value: null; error: string };

export type OperationsKpis = {
  teams: OperationsMetric;
  players: OperationsMetric;
  matches: OperationsMetric;
  today: OperationsMetric;
  live: OperationsMetric;
  pending: OperationsMetric;
  pendingDocuments: OperationsMetric;
  activeSanctions: OperationsMetric;
};

export type OperationsMatch = {
  id: string;
  status: string;
  scheduledTime: string | null;
  venue: string | null;
  roundNumber: number | null;
  categoryId: string;
  categoryName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  href: string;
};

export type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  status: 'complete' | 'warning' | 'incomplete';
  weight: number;
  href: string;
};

export type OperationsAlert = {
  id: string;
  title: string;
  description: string;
  count?: number;
  priority: 'info' | 'warning' | 'critical' | 'success';
  href: string;
  actionLabel: string;
};

export type TournamentOperationsData = {
  kpis: OperationsKpis;
  checks: ReadinessCheck[];
  readiness: number;
  alerts: OperationsAlert[];
  todayMatches: OperationsMatch[];
  agendaError: string | null;
  publication: { delegates: boolean; public: boolean; state: 'PRIVATE' | 'DELEGATES_ONLY' | 'PUBLIC' };
};
