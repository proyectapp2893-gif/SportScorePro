import { describe, expect, it } from 'vitest';
import { getDisciplinaryBlocks, remainingSuspension } from '../app/lib/discipline/suspension';
import { evaluatePlayerEligibility } from '../app/lib/competition/player-eligibility';

const red = { id: 'red', event_type: 'RED', player_id: 'javier', team_id: 'niupi', match_id: 'match', fine_status: 'PAID', suspension_matches: 5 };
const sanction = { id: 'red', matches: 5, originalMatches: 5, startBulletinNumber: 1 };

describe('bulletin and roster suspension eligibility', () => {
  it.each([[1, 5], [2, 4], [5, 1], [6, 0], [7, 0]])('bulletin %i leaves %i dates in both views', (number, remaining) => {
    expect(remainingSuspension(sanction, number)).toBe(remaining);
    const blocks = getDisciplinaryBlocks([red], [sanction], number);
    expect(Boolean(blocks.javier)).toBe(remaining > 0);
    const eligibility = evaluatePlayerEligibility({ playerId: 'javier', registered: true, requiredDocuments: [], suspended: Boolean(blocks.javier) });
    expect(eligibility.status).toBe(remaining > 0 ? 'INELIGIBLE' : 'ELIGIBLE');
  });

  it('keeps an unpaid fine blocking at zero, and releases after payment', () => {
    expect(getDisciplinaryBlocks([{ ...red, fine_status: 'UNPAID' }], [sanction], 6).javier).toBe('Multa pendiente de pago.');
    expect(getDisciplinaryBlocks([red], [sanction], 6)).toEqual({});
  });

  it('does not release another active sanction when the first expires', () => {
    const other = { ...red, id: 'other', suspension_matches: 2 };
    const active = { id: 'other', originalMatches: 2, startBulletinNumber: 6 };
    expect(getDisciplinaryBlocks([red, other], [sanction, active], 6).javier).toContain('2 fecha(s)');
  });

  it('blocks a new sanction before its first publication', () => {
    expect(getDisciplinaryBlocks([red], [], 0).javier).toContain('5 fecha(s)');
    expect(getDisciplinaryBlocks([red], [], 8).javier).toContain('5 fecha(s)');
  });

  it('does not restore superseded yellow fines when a paid red expires', () => {
    const yellow = { ...red, id: 'yellow', event_type: 'YELLOW', fine_status: 'UNPAID' };
    expect(getDisciplinaryBlocks([yellow, red], [sanction], 6)).toEqual({});
  });

  it('supports legacy bulletin sanctions without origin fields', () => {
    expect(getDisciplinaryBlocks([red], [{ id: 'red', matches: 5 }], 6)).toEqual({});
  });
});
