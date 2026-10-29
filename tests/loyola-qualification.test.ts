import { describe, expect, it } from 'vitest';
import { selectLoyolaQualifiers } from '../app/lib/tournaments/loyola-qualification';

const teams = Array.from({ length: 9 }, (_, index) => ({
  id: `team-${index + 1}`,
  fair_play_points: index === 8 ? 0 : 100,
}));
const matches = teams.map((team, index) => ({
  home_team_id: team.id,
  away_team_id: teams[(index + 1) % teams.length].id,
  home_score: 1,
  away_score: 1,
  home_sets: null,
  away_sets: null,
  status: 'FINISHED',
}));

describe('Loyola group qualification', () => {
  it('excludes the ninth team after the regular phase and applies fair play to ties', () => {
    const result = selectLoyolaQualifiers(teams, matches, 'FUTBOL', true, 100);
    expect(result.qualifiedIds).toHaveLength(8);
    expect(result.eliminatedIds).toEqual(['team-9']);
  });

  it('does not allow a group draw while a regular match is pending', () => {
    expect(() => selectLoyolaQualifiers(teams, [{ ...matches[0], status: 'SCHEDULED' }, ...matches.slice(1)], 'FUTBOL', true, 100)).toThrow(/Finaliza todos/);
  });
});
