import { describe, expect, it } from 'vitest';
import { buildLoyolaGroupFixture } from '../app/lib/tournaments/loyola-group-fixture';

const names = [
  ['NIUPI', 'ARSENAL', 'GALÁCTICOS', 'LA BANDA'],
  ['SPORTING SAN JOSÉ', 'TIBURONES', 'TERCER TIEMPO', 'SAN JOSÉ UNITED'],
];
const teams = names.flatMap((group, groupIndex) => group.map((name) => ({ id: name, name, group_name: groupIndex ? 'B' : 'A' })));

describe('approved Loyola group fixture', () => {
  it('creates six complete dates with 24 home-and-away group matches', () => {
    const rounds = buildLoyolaGroupFixture(teams);
    expect(rounds.map((round) => round.scheduledDate)).toEqual([
      '2026-10-31', '2026-11-07', '2026-11-14', '2026-11-22', '2026-11-28', '2026-12-05',
    ]);
    expect(rounds.map((round) => round.matches.length)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(rounds[0].matches).toContainEqual({ homeTeamId: 'NIUPI', awayTeamId: 'ARSENAL', groupName: 'A', scheduledTime: '16:00:00', venue: 'Cancha 1' });
    expect(rounds[0].matches).toContainEqual({ homeTeamId: 'SPORTING SAN JOSÉ', awayTeamId: 'TIBURONES', groupName: 'B', scheduledTime: '14:30:00', venue: 'Cancha 1' });
  });

  it('refuses the calendar when a classified team is in the wrong group', () => {
    expect(() => buildLoyolaGroupFixture(teams.map((team) => team.name === 'ARSENAL' ? { ...team, group_name: 'B' } : team))).toThrow();
  });
});
