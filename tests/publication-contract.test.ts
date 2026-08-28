import { describe, expect, it } from 'vitest';
import { canDelegatesViewFixture, canPublicViewFixture, getFixturePublicationState } from '../app/lib/tournaments/publication';

describe('fixture publication contract', () => {
  it.each([
    [false, false, 'PRIVATE'],
    [true, false, 'DELEGATES_ONLY'],
    [true, true, 'PUBLIC'],
    [false, true, 'PUBLIC'],
  ] as const)('resuelve %s/%s como %s', (delegates, publicValue, expected) => {
    expect(getFixturePublicationState(delegates, publicValue)).toBe(expected);
  });

  it('mantiene capacidades independientes', () => {
    expect(canDelegatesViewFixture(false)).toBe(false);
    expect(canDelegatesViewFixture(true)).toBe(true);
    expect(canPublicViewFixture(false)).toBe(false);
    expect(canPublicViewFixture(true)).toBe(true);
  });
});
