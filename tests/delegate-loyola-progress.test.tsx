import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DelegateLoyolaProgress from '../app/[slug]/delegado/DelegateLoyolaProgress';

const names = ['NIUPI', 'ARSENAL', 'GALÁCTICOS', 'LA BANDA', 'SPORTING SAN JOSÉ', 'TIBURONES', 'TERCER TIEMPO', 'SAN JOSÉ UNITED', 'REAL SAN JOSE'];
const teams = names.map((name, index) => ({ id: String(index), name, group_name: index < 4 ? 'A' : index < 8 ? 'B' : null }));
const matches = [
  { id: 'regular', status: 'FINISHED', home_team_id: '0', away_team_id: '8', home_team: teams[0], away_team: teams[8], home_score: 2, away_score: 0, matchdays: { round_number: 1, scheduled_date: '2026-08-01' }, scheduled_time: '14:30:00', venue: 'Cancha 1' },
  { id: 'group', status: 'SCHEDULED', home_team_id: '0', away_team_id: '1', home_team: teams[0], away_team: teams[1], home_score: null, away_score: null, matchdays: { round_number: 101, scheduled_date: '2026-10-31' }, scheduled_time: '16:00:00', venue: 'Cancha 2' },
];

describe('delegate Loyola progress', () => {
  it('shows the eliminated team, both phase tables and approved group match details', () => {
    const html = renderToStaticMarkup(React.createElement(DelegateLoyolaProgress, {
      selectedTeamId: '0', teams, matches, eventsByMatch: { regular: [{ id: 'goal', match_id: 'regular', team_id: '0', player_id: 'player', event_type: 'GOAL', players: { name: 'Jugador NIUPI' } }] }, drawEvents: [{ id: 'draw', created_at: '2026-10-29T14:00:00Z', action: 'admin.loyola.draw_assignment', metadata: { teamName: 'NIUPI', groupName: 'A' } }], sportName: 'Fútbol',
      tournament: { fair_play_enabled: true, fp_starting_points: 1000, fp_yellow_deduction: 100, fp_red_deduction: 300 },
    }));
    expect(html).toContain('Eliminado: REAL SAN JOSE');
    expect(html).toContain('Posiciones · Fase 1');
    expect(html).toContain('Grupo A');
    expect(html).toContain('Grupo B');
    expect(html).toContain('31/10/2026');
    expect(html).toContain('Cancha 2');
    expect(html).toContain('1000');
    expect(html).toContain('Acta del sorteo manual');
    expect(html).toContain('Goleadores · acumulado');
    expect(html).toContain('Jugador NIUPI');
    expect(html).toContain('Valla menos vencida · acumulado');
  });

  it('explains to the eliminated team that its participation ended while keeping the group calendar visible', () => {
    const html = renderToStaticMarkup(React.createElement(DelegateLoyolaProgress, {
      selectedTeamId: '8', teams, matches, eventsByMatch: {}, drawEvents: [], sportName: 'Fútbol',
      tournament: { fair_play_enabled: true, fp_starting_points: 1000 },
    }));
    expect(html).toContain('Tu equipo terminó su participación en la fase regular.');
    expect(html).toContain('31/10/2026');
  });
});
