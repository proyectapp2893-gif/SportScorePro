import { describe, expect, it } from 'vitest';
import { analyzeFixture } from '../app/lib/fixture/intelligence';

const teams = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const match = (id: string, home: string, away: string, time: string, venue = 'Cancha 1') => ({ id, home_team_id: home, away_team_id: away, scheduled_time: time, venue, status: 'SCHEDULED', matchdays: { round_number: 1, scheduled_date: '2026-09-01' } });

describe('fixture intelligence', () => {
  it('returns ready for a complete fixture', () => expect(analyzeFixture([match('m1', 'a', 'b', '14:00')], teams).status).toBe('READY'));
  it('detects team and venue conflicts', () => { const result = analyzeFixture([match('m1', 'a', 'b', '14:00'), match('m2', 'a', 'c', '14:00')], teams); expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['TEAM_CONFLICT', 'VENUE_CONFLICT'])); expect(result.status).toBe('ERROR'); });
  it('detects incomplete matches but ignores valid BYE', () => { const result = analyzeFixture([{ ...match('m1', 'a', 'b', '14:00'), venue: null }, { id: 'bye', status: 'BYE', home_team_id: 'c', matchdays: { round_number: 1, scheduled_date: '2026-09-01' } }], teams); expect(result.issues.some((issue) => issue.code === 'MISSING_VENUE')).toBe(true); expect(result.metrics.byes).toBe(1); });
  it('calculates rest and optional short-rest warnings', () => { const result = analyzeFixture([match('m1', 'a', 'b', '14:00'), { ...match('m2', 'a', 'c', '14:20'), matchdays: { round_number: 2, scheduled_date: '2026-09-01' } }], teams, { minimumRestMinutes: 30 }); expect(result.teamMetrics.find((team) => team.teamId === 'a')?.minimumRestMinutes).toBe(20); expect(result.status).toBe('WARNING'); });
  it('returns empty fixture as ready with zero metrics', () => { const result = analyzeFixture([], teams); expect(result.status).toBe('READY'); expect(result.metrics.matches).toBe(0); });
});
