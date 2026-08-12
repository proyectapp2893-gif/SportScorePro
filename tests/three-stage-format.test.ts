import { describe, expect, it } from 'vitest';
import { generateGroupStage, generatePlacementFinals, generateRoundRobin, seedTwoGroups } from '../app/lib/tournaments/three-stage';

const teams = Array.from({ length: 8 }, (_, index) => ({ id: `team-${index + 1}` }));

describe('three-stage tournament format', () => {
  it('creates 7 rounds and 28 unique matches for phase one', () => {
    const rounds = generateRoundRobin(teams, 1);
    expect(rounds).toHaveLength(7);
    expect(rounds.flatMap((round) => round.matches)).toHaveLength(28);
  });

  it('seeds balanced groups and creates 24 double round-robin matches', () => {
    const seeded = seedTwoGroups(teams.map((team) => team.id));
    expect(seeded.filter((team) => team.groupName === 'A').map((team) => team.seed)).toEqual([1, 4, 5, 8]);
    expect(generateGroupStage(seeded).flatMap((round) => round.matches)).toHaveLength(24);
  });

  it('creates gold and silver finals from group positions', () => {
    const finals = generatePlacementFinals(['a1', 'a2'], ['b1', 'b2']);
    expect(finals[0].matches).toMatchObject([
      { homeTeamId: 'a1', awayTeamId: 'b1', matchType: 'GOLD_FINAL' },
      { homeTeamId: 'a2', awayTeamId: 'b2', matchType: 'SILVER_FINAL' },
    ]);
  });
});
