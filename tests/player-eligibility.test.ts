import { describe, expect, it } from 'vitest';
import { evaluatePlayerEligibility } from '../app/lib/competition/player-eligibility';

const complete = { playerId: 'p1', registered: true, teamId: 't1', expectedTeamId: 't1', documents: [{ document_type: 'FACE_PHOTO', status: 'APPROVED' }, { document_type: 'IDENTITY_FRONT', status: 'APPROVED' }] } as const;

describe('player eligibility', () => {
  it('marks a complete player eligible', () => expect(evaluatePlayerEligibility(complete).status).toBe('ELIGIBLE'));
  it('marks missing documents as warning, not block', () => expect(evaluatePlayerEligibility({ ...complete, documents: [] }).status).toBe('WARNING'));
  it('marks rejected documents as warning', () => expect(evaluatePlayerEligibility({ ...complete, documents: [{ document_type: 'FACE_PHOTO', status: 'REJECTED' }] }).warnings[0].code).toBe('DOCUMENTATION_REJECTED'));
  it('blocks an active suspension', () => expect(evaluatePlayerEligibility({ ...complete, suspended: true }).status).toBe('INELIGIBLE'));
  it('blocks an unpaid disciplinary fine according to current Mesa behavior', () => expect(evaluatePlayerEligibility({ ...complete, unpaidFine: true }).status).toBe('INELIGIBLE'));
  it('blocks a player assigned to the wrong team', () => expect(evaluatePlayerEligibility({ ...complete, expectedTeamId: 'other' }).status).toBe('INELIGIBLE'));
  it('supports multiple reasons at once', () => expect(evaluatePlayerEligibility({ ...complete, suspended: true, documents: [] }).reasons).toHaveLength(2));
  it('marks verification failures for human review', () => expect(evaluatePlayerEligibility({ ...complete, verificationError: true }).status).toBe('REVIEW_REQUIRED'));
  it.each(['FÚTBOL', 'BALONCESTO', 'VOLEIBOL', 'SOFTBOL'])('keeps %s aligned for the same player input', (sport) => {
    const eligible = evaluatePlayerEligibility(complete).status;
    const warning = evaluatePlayerEligibility({ ...complete, documents: [] }).status;
    const blocked = evaluatePlayerEligibility({ ...complete, suspended: true }).status;
    const review = evaluatePlayerEligibility({ ...complete, verificationError: true }).status;
    expect([eligible, warning, blocked, review]).toEqual(['ELIGIBLE', 'WARNING', 'INELIGIBLE', 'REVIEW_REQUIRED']);
    expect(sport).toBeTruthy();
  });
  it('prioritizes blocking over review while preserving both reasons', () => {
    const result = evaluatePlayerEligibility({ ...complete, suspended: true, verificationError: true });
    expect(result.status).toBe('INELIGIBLE');
    expect(result.reasons.map((reason) => reason.code)).toEqual(['ADMIN_REVIEW_REQUIRED', 'SUSPENDED']);
  });
  it('keeps suspension and unpaid fine as distinct blocking reasons', () => {
    const result = evaluatePlayerEligibility({ ...complete, suspended: true, unpaidFine: true });
    expect(result.status).toBe('INELIGIBLE');
    expect(result.blockingReasons.map((reason) => reason.code)).toEqual(['SUSPENDED', 'FINE_UNPAID']);
  });
});
