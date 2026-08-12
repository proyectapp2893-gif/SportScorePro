import { describe, expect, it } from 'vitest';
import {
  compareTeamsForStandings,
  getMatchScoreForStandings,
  getResultPoints,
  getSportKind,
  getSportRules,
  isBaseballSport,
  isBasketballSport,
  isSetBasedSport,
  isSoccerSport,
} from '../app/lib/sports/rules';

describe('sport rules', () => {
  it('normalizes sport aliases with and without accents', () => {
    expect(getSportKind('Futbol')).toBe('soccer');
    expect(getSportKind('Fútbol Sala')).toBe('soccer');
    expect(getSportKind('Microfutbol')).toBe('soccer');
    expect(getSportKind('Béisbol')).toBe('baseball');
    expect(getSportKind('Beisbol')).toBe('baseball');
    expect(getSportKind('Softball')).toBe('baseball');
    expect(getSportKind('Baloncesto')).toBe('basketball');
    expect(getSportKind('Basket')).toBe('basketball');
    expect(getSportKind('Voley')).toBe('volleyball');
    expect(getSportKind('Padel')).toBe('racket');
    expect(getSportKind('Tenis de mesa')).toBe('racket');
    expect(getSportKind('Golf')).toBe('golf');
    expect(getSportKind('Ajedrez')).toBe('generic');
  });

  it('exposes readable sport helpers for routing', () => {
    expect(isSoccerSport('MICRO')).toBe(true);
    expect(isBasketballSport('BASKETBALL')).toBe(true);
    expect(isBaseballSport('SOFTBOL')).toBe(true);
    expect(isSetBasedSport('TENIS')).toBe(true);
    expect(isSetBasedSport('VOLEIBOL')).toBe(true);
    expect(isSetBasedSport('FUTBOL')).toBe(false);
  });

  it('uses soccer scoring and penalty sets for standings decisions', () => {
    const soccerRules = getSportRules('FUTBOL');

    expect(getResultPoints(2, 1, soccerRules)).toEqual({ home: 3, away: 0 });
    expect(getResultPoints(1, 1, soccerRules)).toEqual({ home: 1, away: 1 });

    expect(
      getMatchScoreForStandings(
        { home_score: 1, away_score: 1, home_sets: 4, away_sets: 3 },
        soccerRules,
      ),
    ).toEqual({
      home: 4,
      away: 3,
      isPenaltyScore: true,
      countsForScoreColumns: false,
    });
  });

  it('uses basketball win/loss points and score columns', () => {
    const basketballRules = getSportRules('BALONCESTO');

    expect(getResultPoints(50, 48, basketballRules)).toEqual({ home: 2, away: 1 });
    expect(getResultPoints(48, 50, basketballRules)).toEqual({ home: 1, away: 2 });
    expect(
      getMatchScoreForStandings({ home_score: 50, away_score: 48 }, basketballRules),
    ).toEqual({
      home: 50,
      away: 48,
      isPenaltyScore: false,
      countsForScoreColumns: true,
    });
  });

  it('uses sets as the standings score for volleyball and racket sports', () => {
    const volleyballRules = getSportRules('VOLEIBOL');
    const racketRules = getSportRules('PADEL');

    expect(getResultPoints(2, 1, volleyballRules)).toEqual({ home: 2, away: 1 });
    expect(getMatchScoreForStandings({ home_score: 60, away_score: 58, home_sets: 2, away_sets: 1 }, volleyballRules)).toEqual({
      home: 2,
      away: 1,
      isPenaltyScore: false,
      countsForScoreColumns: false,
    });
    expect(getMatchScoreForStandings({ home_sets: 0, away_sets: 2 }, racketRules)).toMatchObject({
      home: 0,
      away: 2,
      countsForScoreColumns: false,
    });
  });

  it('orders soccer standings by points, fair play, goal difference and score for', () => {
    const soccerRules = getSportRules('FUTBOL');
    const teams = [
      { points: 6, fair_play_points: 9, goals_for: 5, goals_against: 2 },
      { points: 6, fair_play_points: 10, goals_for: 4, goals_against: 1 },
      { points: 6, fair_play_points: 10, goals_for: 3, goals_against: 1 },
      { points: 3, fair_play_points: 12, goals_for: 10, goals_against: 1 },
    ];

    const sorted = [...teams].sort((a, b) => compareTeamsForStandings(a, b, soccerRules, true, 0));

    expect(sorted).toEqual([
      { points: 6, fair_play_points: 10, goals_for: 4, goals_against: 1 },
      { points: 6, fair_play_points: 10, goals_for: 3, goals_against: 1 },
      { points: 6, fair_play_points: 9, goals_for: 5, goals_against: 2 },
      { points: 3, fair_play_points: 12, goals_for: 10, goals_against: 1 },
    ]);
  });

  it('orders basketball and volleyball standings by points, ratio and score for', () => {
    const basketballRules = getSportRules('BALONCESTO');
    const teams = [
      { points: 4, goals_for: 50, goals_against: 25 },
      { points: 4, goals_for: 60, goals_against: 30 },
      { points: 4, goals_for: 55, goals_against: 22 },
    ];

    const sorted = [...teams].sort((a, b) => compareTeamsForStandings(a, b, basketballRules));

    expect(sorted).toEqual([
      { points: 4, goals_for: 55, goals_against: 22 },
      { points: 4, goals_for: 60, goals_against: 30 },
      { points: 4, goals_for: 50, goals_against: 25 },
    ]);
  });

  it('orders baseball standings by points, winning percentage and score for', () => {
    const baseballRules = getSportRules('BEISBOL');
    const teams = [
      { points: 6, played: 3, won: 2, goals_for: 12 },
      { points: 6, played: 2, won: 2, goals_for: 9 },
      { points: 6, played: 2, won: 2, goals_for: 11 },
    ];

    const sorted = [...teams].sort((a, b) => compareTeamsForStandings(a, b, baseballRules));

    expect(sorted).toEqual([
      { points: 6, played: 2, won: 2, goals_for: 11 },
      { points: 6, played: 2, won: 2, goals_for: 9 },
      { points: 6, played: 3, won: 2, goals_for: 12 },
    ]);
  });
});
