import { describe, expect, it } from 'vitest';
import { getUpcomingDelegateMatches } from '../app/lib/tournaments/delegate-next-match';

const match = (id: string, status: string, date: string, time = '14:30:00', away_team_id: string | null = 'rival') => ({
  id, status, home_team_id: 'equipo', away_team_id, scheduled_time: time, matchdays: { scheduled_date: date },
});

describe('próximo partido del delegado', () => {
  it('omite descansos y fechas vencidas, y ordena los encuentros reales', () => {
    const matches = [
      match('descanso', 'BYE', '2026-10-24', '', null),
      match('tarde', 'SCHEDULED', '2026-11-07'),
      match('vencido', 'SCHEDULED', '2026-10-24'),
      match('proximo', 'SCHEDULED', '2026-10-31', '16:00:00'),
      match('sin-rival', 'SCHEDULED', '2026-10-31', '14:30:00', null),
      match('sin-fecha', 'SCHEDULED', ''),
    ];
    expect(getUpcomingDelegateMatches(matches, new Date('2026-10-30T17:00:00Z')).map((item) => item.id)).toEqual(['proximo', 'tarde']);
  });

  it('prioriza el encuentro en vivo y respeta la hora de Colombia', () => {
    const matches = [match('terminado-hoy', 'SCHEDULED', '2026-10-30', '12:00:00'), match('hoy', 'SCHEDULED', '2026-10-30', '13:00:00'), match('en-vivo', 'LIVE', '2026-10-24')];
    expect(getUpcomingDelegateMatches(matches, new Date('2026-10-30T17:30:00Z')).map((item) => item.id)).toEqual(['en-vivo', 'hoy']);
  });
});
