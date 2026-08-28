export type FixturePublicationState = 'PRIVATE' | 'DELEGATES_ONLY' | 'PUBLIC';

export function canDelegatesViewFixture(value: boolean | null | undefined) {
  return value === true;
}

export function canPublicViewFixture(value: boolean | null | undefined) {
  return value === true;
}

export function getFixturePublicationState(delegates: boolean | null | undefined, publicValue: boolean | null | undefined): FixturePublicationState {
  if (canPublicViewFixture(publicValue)) return 'PUBLIC';
  if (canDelegatesViewFixture(delegates)) return 'DELEGATES_ONLY';
  return 'PRIVATE';
}

export const fixturePublicationLabels: Record<FixturePublicationState, string> = {
  PRIVATE: 'Privado',
  DELEGATES_ONLY: 'Revisión de delegados',
  PUBLIC: 'Publicado',
};
