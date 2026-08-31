import { describe, expect, it } from 'vitest';
import { normalizeDoubleCautions } from '../app/lib/discipline/double-caution';

const base = { match_id: 'match-1', player_id: 'player-1', team_id: 'team-1', period: '1T', match_second: 120, minute_record: 2, fine_status: 'UNPAID' };

describe('normalizeDoubleCautions', () => {
  it('keeps the first yellow and the derived red as the only billable events', () => {
    const events = [
      { ...base, id: 'yellow-1', event_type: 'YELLOW', created_at: '2026-08-29T18:00:00.000Z' },
      { ...base, id: 'yellow-2', event_type: 'YELLOW', created_at: '2026-08-29T18:05:00.000Z' },
      { ...base, id: 'red-derived', event_type: 'RED', created_at: '2026-08-29T18:05:00.000Z' },
    ];
    const result = normalizeDoubleCautions(events);
    expect(result.map((event) => event.id)).toEqual(['red-derived']);
    expect(result[0].isDoubleCaution).toBe(true);
  });

  it('does not pair a direct red from another player or match', () => {
    const events = [
      { ...base, id: 'yellow-1', event_type: 'YELLOW', created_at: '2026-08-29T18:00:00.000Z' },
      { ...base, id: 'yellow-2', event_type: 'YELLOW', created_at: '2026-08-29T18:05:00.000Z' },
      { ...base, player_id: 'player-2', id: 'red-direct', event_type: 'RED', created_at: '2026-08-29T18:05:00.000Z' },
    ];
    const result = normalizeDoubleCautions(events);
    expect(result).toHaveLength(3);
    expect(result.find((event) => event.id === 'red-direct')?.isDoubleCaution).not.toBe(true);
  });
});
