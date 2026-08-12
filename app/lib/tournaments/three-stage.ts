export type FixtureTeam = { id: string; seed?: number; groupName?: 'A' | 'B' };
export type GeneratedMatch = { homeTeamId: string; awayTeamId: string; leg: number; groupName?: string; matchType?: 'LEAGUE' | 'GROUP' | 'GOLD_FINAL' | 'SILVER_FINAL' };
export type GeneratedRound = { roundNumber: number; matches: GeneratedMatch[] };

function rotate<T>(teams: Array<T | null>) {
  return [teams[0], teams[teams.length - 1], ...teams.slice(1, -1)];
}

export function generateRoundRobin(input: FixtureTeam[], legs: 1 | 2, roundOffset = 0, matchType: GeneratedMatch['matchType'] = 'LEAGUE'): GeneratedRound[] {
  if (input.length < 2) return [];
  let rotating: Array<FixtureTeam | null> = [...input];
  if (rotating.length % 2) rotating.push(null);
  const firstLeg: GeneratedRound[] = [];

  for (let roundIndex = 0; roundIndex < rotating.length - 1; roundIndex += 1) {
    const matches: GeneratedMatch[] = [];
    for (let index = 0; index < rotating.length / 2; index += 1) {
      const left = rotating[index];
      const right = rotating[rotating.length - 1 - index];
      if (!left || !right) continue;
      const reverse = (roundIndex + index) % 2 === 1;
      matches.push({
        homeTeamId: reverse ? right.id : left.id,
        awayTeamId: reverse ? left.id : right.id,
        leg: 1,
        groupName: left.groupName || right.groupName,
        matchType,
      });
    }
    firstLeg.push({ roundNumber: roundOffset + roundIndex + 1, matches });
    rotating = rotate(rotating);
  }

  if (legs === 1) return firstLeg;
  return [...firstLeg, ...firstLeg.map((round, index) => ({
    roundNumber: roundOffset + firstLeg.length + index + 1,
    matches: round.matches.map((match) => ({ ...match, homeTeamId: match.awayTeamId, awayTeamId: match.homeTeamId, leg: 2 })),
  }))];
}

export function seedTwoGroups(rankedTeamIds: string[]) {
  if (rankedTeamIds.length !== 8) throw new Error('El formato requiere exactamente ocho equipos clasificados.');
  const groupASeeds = new Set([1, 4, 5, 8]);
  return rankedTeamIds.map((id, index) => ({ id, seed: index + 1, groupName: (groupASeeds.has(index + 1) ? 'A' : 'B') as 'A' | 'B' }));
}

export function generateGroupStage(seeded: FixtureTeam[]) {
  const groupA = seeded.filter((team) => team.groupName === 'A');
  const groupB = seeded.filter((team) => team.groupName === 'B');
  if (groupA.length !== 4 || groupB.length !== 4) throw new Error('Cada grupo debe contener cuatro equipos.');
  const aRounds = generateRoundRobin(groupA, 2, 0, 'GROUP');
  const bRounds = generateRoundRobin(groupB, 2, 0, 'GROUP');
  return aRounds.map((round, index) => ({ roundNumber: round.roundNumber, matches: [...round.matches, ...bRounds[index].matches] }));
}

export function generatePlacementFinals(groupA: string[], groupB: string[]): GeneratedRound[] {
  if (groupA.length < 2 || groupB.length < 2) throw new Error('Se requieren los dos primeros equipos de cada grupo.');
  return [{ roundNumber: 1, matches: [
    { homeTeamId: groupA[0], awayTeamId: groupB[0], leg: 1, matchType: 'GOLD_FINAL' },
    { homeTeamId: groupA[1], awayTeamId: groupB[1], leg: 1, matchType: 'SILVER_FINAL' },
  ] }];
}
