import { describe, expect, it } from 'vitest';
import { normalizeDoubleCautions } from '../app/lib/discipline/double-caution';

const base = { match_id: 'match-1', player_id: 'player-1', team_id: 'team-1', period: '1T', match_second: 120, minute_record: 2, fine_status: 'UNPAID' };

describe('normalizeDoubleCautions', () => {
  it('keeps only the derived red as the billable sanction', () => {
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

 describe('red supersedes cautions in the same match', () => {
  it.each(['UNPAID', 'PAID'])('does not bill a previous yellow when the red is %s', (fine_status) => {
    const events = [
      { ...base, id: 'yellow', event_type: 'YELLOW' },
      { ...base, id: 'red', event_type: 'RED', match_second: 900, fine_status },
    ];
    const result = normalizeDoubleCautions(events);
    expect(result.map(event => event.id)).toEqual(['red']);
    expect(result[0].isDoubleCaution).not.toBe(true);
    const debt = result.filter(event => event.fine_status !== 'PAID')
      .reduce((total, event) => total + (event.event_type === 'RED' ? 50000 : 25000), 0);
    expect(debt).toBe(fine_status === 'PAID' ? 0 : 50000);
    expect(events).toHaveLength(2);
    expect(normalizeDoubleCautions(result)).toEqual(result);
  });

  it.each([{ match_id: 'other' }, { player_id: 'other' }, { team_id: 'other' }, { player_id: null }, { match_id: null }])('preserves unrelated yellows: %o', (identity) => {
    expect(normalizeDoubleCautions([
      { ...base, id: 'yellow', event_type: 'YELLOW' },
      { ...base, ...identity, id: 'red', event_type: 'RED' },
    ])).toHaveLength(2);
  });
 });
