import { describe, expect, it } from 'vitest';
import { findTeamsMissingFromEveryRegularRound, generateBalancedRoundRobin, inferMissingTeamByes } from '../app/lib/tournaments/byes';

describe('inferMissingTeamByes', () => {
  it('shows a team added after the regular fixture was generated as resting', () => {
    const teams = [
      { id: 'team-a', name: 'Equipo A' },
      { id: 'team-b', name: 'Equipo B' },
      { id: 'new-team', name: 'Equipo Nuevo' },
    ];
    const matches = [{
      id: 'match-1',
      home_team_id: 'team-a',
      away_team_id: 'team-b',
      matchdays: { id: 'matchday-1', category_id: 'category-1', round_number: 1, scheduled_date: '2026-08-29' },
    }];

    expect(inferMissingTeamByes(matches, teams)).toEqual([
      expect.objectContaining({
        id: 'inferred-bye-matchday-1-new-team',
        status: 'BYE',
        home_team_id: 'new-team',
        away_team_id: null,
        venue: 'Descansa',
      }),
    ]);
  });

  it('does not duplicate a stored rest or infer rests in final rounds', () => {
    const teams = [{ id: 'team-a' }, { id: 'team-b' }, { id: 'team-c' }];
    const matches = [
      { id: 'bye', home_team_id: 'team-c', away_team_id: null, matchdays: { id: 'round-1', round_number: 1 } },
      { id: 'match', home_team_id: 'team-a', away_team_id: 'team-b', matchdays: { id: 'round-1', round_number: 1 } },
      { id: 'final', home_team_id: 'team-a', away_team_id: 'team-b', matchdays: { id: 'final', round_number: 201 } },
    ];

    expect(inferMissingTeamByes(matches, teams)).toEqual([]);
  });

  it('flags a team outside the entire fixture instead of showing it resting every round', () => {
    const teams = [{ id: 'team-a' }, { id: 'team-b' }, { id: 'late-team', name: 'Real San José' }];
    const matches = [1, 2, 3].map((round) => ({ id: `match-${round}`, home_team_id: 'team-a', away_team_id: 'team-b', matchdays: { id: `round-${round}`, round_number: round } }));

    expect(inferMissingTeamByes(matches, teams)).toEqual([]);
    expect(findTeamsMissingFromEveryRegularRound(matches, teams)).toEqual([{ id: 'late-team', name: 'Real San José' }]);
  });

  it('honors the first bye and gives every odd-team participant one rest', () => {
    const teams = Array.from({ length: 9 }, (_, index) => ({ id: `team-${index + 1}` }));
    const rounds = generateBalancedRoundRobin(teams, 'team-9');
    const byeIds = rounds.map((round) => {
      const bye = round.find((pair) => pair.home === null || pair.away === null);
      return (bye?.home || bye?.away)?.id;
    });
    const pairKeys = rounds.flatMap((round) => round.filter((pair) => pair.home && pair.away).map((pair) => [pair.home?.id, pair.away?.id].sort().join('|')));

    expect(rounds).toHaveLength(9);
    expect(byeIds[0]).toBe('team-9');
    expect(new Set(byeIds)).toHaveLength(9);
    expect(pairKeys).toHaveLength(36);
    expect(new Set(pairKeys)).toHaveLength(36);
  });
});
