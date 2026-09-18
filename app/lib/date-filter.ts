export const AS_OF_DATE_PARAM = 'hasta';

export function normalizeAsOfDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function withMatchdayCutoff<T extends { lte: (column: string, value: string) => T }>(query: T, asOfDate: string | null): T {
  return asOfDate ? query.lte('matchdays.scheduled_date', asOfDate) : query;
}

export function withNestedMatchdayCutoff<T extends { lte: (column: string, value: string) => T }>(query: T, asOfDate: string | null): T {
  return asOfDate ? query.lte('matches.matchdays.scheduled_date', asOfDate) : query;
}
