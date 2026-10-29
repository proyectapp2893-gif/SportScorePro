import { describe, expect, it } from 'vitest';
import { calculateLoyolaGroupStandings } from '../app/lib/tournaments/loyola-phase-standings';

const teams = [
  { id: 'niupi', name: 'NIUPI', group_name: 'A', fair_play_points: 600 },
  { id: 'arsenal', name: 'ARSENAL', group_name: 'A', fair_play_points: 900 },
  { id: 'sporting', name: 'SPORTING', group_name: 'B', fair_play_points: 700 },
  { id: 'tiburones', name: 'TIBURONES', group_name: 'B', fair_play_points: 800 },
];
const settings = { fairPlayEnabled: true, startingPoints: 1000, yellowDeduction: 100, redDeduction: 300 };
const regular = { id: 'regular', round_number: 9, status: 'FINISHED', home_team_id: 'niupi', away_team_id: 'arsenal', home_score: 8, away_score: 0 };
const group = { id: 'group', round_number: 101, status: 'FINISHED', home_team_id: 'niupi', away_team_id: 'arsenal', home_score: 1, away_score: 1 };

describe('Loyola phase 2 standings', () => {
  it('starts every group team at zero statistics and full Fair Play', () => {
    const standings = calculateLoyolaGroupStandings(teams, [regular, { ...group, status: 'SCHEDULED' }], [
      { match_id: 'regular', team_id: 'niupi', event_type: 'RED' },
    ], 'Fútbol', settings);
    expect(standings.A.map((team) => [team.played, team.points, team.goals_for, team.fair_play_points])).toEqual([
      [0, 0, 0, 1000], [0, 0, 0, 1000],
    ]);
    expect(standings.B.every((team) => team.fair_play_points === 1000)).toBe(true);
  });

  it('counts only group results and cards, using phase 2 Fair Play to break ties', () => {
    const standings = calculateLoyolaGroupStandings(teams, [regular, group], [
      { match_id: 'regular', team_id: 'niupi', event_type: 'RED' },
      { match_id: 'group', team_id: 'niupi', event_type: 'YELLOW' },
    ], 'Fútbol', settings);
    expect(standings.A.map((team) => [team.id, team.played, team.points, team.goals_for, team.fair_play_points])).toEqual([
      ['arsenal', 1, 1, 1, 1000], ['niupi', 1, 1, 1, 900],
    ]);
  });

  it('does not charge the second yellow again when Mesa generated a red card', () => {
    const cards = [
      { match_id: 'group', team_id: 'niupi', player_id: 'player', event_type: 'YELLOW', period: '1T', match_second: 120, minute_record: 3, created_at: '2026-10-31T16:02:00Z' },
      { match_id: 'group', team_id: 'niupi', player_id: 'player', event_type: 'YELLOW', period: '2T', match_second: 1800, minute_record: 31, created_at: '2026-10-31T16:31:00Z' },
      { match_id: 'group', team_id: 'niupi', player_id: 'player', event_type: 'RED', period: '2T', match_second: 1800, minute_record: 31, created_at: '2026-10-31T16:31:00Z' },
    ];
    const standings = calculateLoyolaGroupStandings(teams, [group], cards, 'Fútbol', settings);
    expect(standings.A.find((team) => team.id === 'niupi')?.fair_play_points).toBe(600);
  });
});
