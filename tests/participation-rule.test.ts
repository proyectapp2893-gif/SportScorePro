import { describe, expect, it } from 'vitest';
import { participationEligible, regularParticipationCount } from '../app/lib/competition/participation';

describe('regular phase participation rule', () => {
  it('counts distinct confirmed matches, never duplicate events', () => {
    expect(regularParticipationCount([
      { player_id: 'p', match_id: 'm1', status: 'CONFIRMED' },
      { player_id: 'p', match_id: 'm1', status: 'CONFIRMED' },
      { player_id: 'p', match_id: 'm2', status: 'CONFIRMED' },
      { player_id: 'p', match_id: 'm3', status: 'VOIDED' },
      { player_id: 'other', match_id: 'm4', status: 'CONFIRMED' },
    ], 'p')).toBe(2);
  });

  it('requires four and allows a custom threshold', () => {
    expect(participationEligible(3)).toBe(false);
    expect(participationEligible(4)).toBe(true);
    expect(participationEligible(3, 3)).toBe(true);
  });
});
