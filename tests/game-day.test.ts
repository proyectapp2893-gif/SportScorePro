import { describe, expect, it } from 'vitest';
import { getMatchReadiness, getOperationalMatchState, sortGameDayMatches, type GameDayMatch } from '../app/[slug]/admin/game-day/types';

describe('game day operational logic', () => {
  it('maps existing match states without introducing a second state machine', () => {
    expect(getOperationalMatchState('LIVE')).toBe('LIVE');
    expect(getOperationalMatchState('FINISHED')).toBe('FINISHED');
    expect(getOperationalMatchState('SCHEDULED')).toBe('UPCOMING');
    expect(getOperationalMatchState('UNKNOWN')).toBe('UNKNOWN');
  });

  it('distinguishes ready, warning and blocked matches', () => {
    expect(getMatchReadiness({ homeTeam: 'A', awayTeam: 'B', venue: 'Cancha 1', scheduledTime: '14:00', scorekeeper: 'Juez', state: 'UPCOMING' }).readiness).toBe('READY');
    expect(getMatchReadiness({ homeTeam: 'A', awayTeam: 'B', venue: null, scheduledTime: '14:00', scorekeeper: null, state: 'UPCOMING' }).readiness).toBe('WARNING');
    expect(getMatchReadiness({ homeTeam: null, awayTeam: 'B', venue: 'Cancha 1', scheduledTime: '14:00', scorekeeper: 'Juez', state: 'UPCOMING' }).readiness).toBe('BLOCKED');
  });

  it('sorts live, upcoming and finished matches in operational order', () => {
    const make = (id: string, state: GameDayMatch['state'], time: string): GameDayMatch => ({ id, status: state, state, readiness: 'READY', alerts: [], scheduledTime: time, venue: 'Cancha 1', categoryName: 'Demo', roundNumber: 1, homeTeam: 'A', awayTeam: 'B', homeLogo: null, awayLogo: null, homeScore: 0, awayScore: 0, scorekeeper: 'Juez', hrefs: { mesa: '#', planilla: '#', resultado: '#', tv: '#' } });
    expect(sortGameDayMatches([make('f', 'FINISHED', '10:00'), make('u', 'UPCOMING', '09:00'), make('l', 'LIVE', '12:00')]).map((item) => item.id)).toEqual(['l', 'u', 'f']);
  });
});
