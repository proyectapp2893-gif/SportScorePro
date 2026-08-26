'use client';

import { DEMO_STORAGE_KEY } from './config';

type Row = Record<string, any>;
type Database = Record<string, Row[]>;

const sport = { id: 'demo-sport', name: 'FÚTBOL', scoring_system: 'GOALS' };
const tournament = { id: 'demo-tournament', client_id: 'demo-client', name: 'TORNEO DEMOSTRATIVO', tournament_format: 'ROUND_ROBIN', is_active: true, created_at: '2026-08-26T12:00:00Z', schedule_dates: ['2026-09-05'], schedule_time_slots: ['14:00', '16:00'], available_venues: ['Cancha 1', 'Cancha 2'], fixture_visible_to_delegates: true, fair_play_enabled: true, fp_starting_points: 100, fp_yellow_deduction: 1, fp_red_deduction: 3, fine_yellow_amount: 30000, fine_red_amount: 80000 };
const category = { id: 'demo-category', tournament_id: tournament.id, name: 'CATEGORÍA DEMO', gender: 'MASCULINO', sport_id: sport.id, sports: sport, tournaments: tournament, registration_open: true, min_roster_size: 5, max_roster_size: 25, schedule_dates: tournament.schedule_dates };
const teamNames = ['EQUIPO AURORA', 'EQUIPO HORIZONTE', 'EQUIPO CENTRAL', 'EQUIPO CAPITAL', 'EQUIPO NORTE', 'EQUIPO SUR', 'EQUIPO ÉLITE', 'EQUIPO UNIÓN', 'EQUIPO VANGUARDIA'];
const schools = teamNames.map((name, index) => ({ id: `demo-school-${index + 1}`, client_id: 'demo-client', name, logo_url: null }));
const teams = teamNames.map((name, index) => ({ id: `demo-team-${index + 1}`, category_id: category.id, school_id: schools[index].id, name, schools: schools[index], categories: category }));
const players = teams.flatMap((team, teamIndex) => Array.from({ length: 8 }, (_, playerIndex) => {
  const number = playerIndex + 1;
  return {
    id: `demo-player-${teamIndex + 1}-${number}`,
    team_id: team.id,
    name: `JUGADOR ${teamNames[teamIndex].replace('EQUIPO ', '')} ${String(number).padStart(2, '0')}`,
    identity_number: `${11000000 + teamIndex * 100 + number}`,
    shirt_number: number === 1 ? 1 : number + 6,
    birth_year: 1980 + ((teamIndex + playerIndex) % 12),
    birth_date: `${1980 + ((teamIndex + playerIndex) % 12)}-${String((playerIndex % 9) + 1).padStart(2, '0')}-15`,
    vinculo: playerIndex % 2 ? 'PADRE DE FAMILIA' : 'EX-ALUMNO',
    relationship_detail: playerIndex % 2 ? `ESTUDIANTE DEMO ${number}` : `${1998 + playerIndex}`,
    teams: team,
    player_documents: [],
  };
}));

function buildDemoCompetition() {
  const rotating: Array<(typeof teams)[number] | null> = [...teams, null];
  const matchdays: Row[] = [];
  const matches: Row[] = [];
  const matchEvents: Row[] = [];
  for (let roundIndex = 0; roundIndex < rotating.length - 1; roundIndex += 1) {
    const date = new Date('2026-09-05T12:00:00'); date.setDate(date.getDate() + roundIndex * 7);
    const matchday = { id: `demo-matchday-${roundIndex + 1}`, category_id: category.id, round_number: roundIndex + 1, scheduled_date: date.toISOString().slice(0, 10), categories: category };
    matchdays.push(matchday);
    for (let pairIndex = 0; pairIndex < rotating.length / 2; pairIndex += 1) {
      const first = rotating[pairIndex]; const second = rotating[rotating.length - 1 - pairIndex];
      const matchId = `demo-match-${roundIndex + 1}-${pairIndex + 1}`;
      if (!first || !second) {
        const resting = first || second;
        matches.push({ id: matchId, matchday_id: matchday.id, home_team_id: resting?.id, away_team_id: null, home_team: resting, away_team: null, matchdays: matchday, status: 'BYE', venue: 'Descansa', scheduled_time: null, home_score: null, away_score: null });
        continue;
      }
      const home = (roundIndex + pairIndex) % 2 === 0 ? first : second;
      const away = home.id === first.id ? second : first;
      const isFinished = roundIndex < 3;
      const isLive = roundIndex === 3 && pairIndex === 0;
      const homeScore = isFinished ? (roundIndex + pairIndex + 1) % 4 : isLive ? 1 : null;
      const awayScore = isFinished ? (roundIndex * 2 + pairIndex) % 3 : isLive ? 1 : null;
      const match = { id: matchId, matchday_id: matchday.id, home_team_id: home.id, away_team_id: away.id, home_team: home, away_team: away, matchdays: matchday, status: isFinished ? 'FINISHED' : isLive ? 'LIVE' : 'SCHEDULED', venue: `Cancha ${(pairIndex % 2) + 1}`, scheduled_time: pairIndex < 2 ? '14:00' : '16:00', home_score: homeScore, away_score: awayScore, current_period: isLive ? '2T' : null };
      matches.push(match);
      if (isFinished || isLive) {
        const addEvent = (team: Row, eventType: string, sequence: number) => {
          const roster = players.filter((player) => player.team_id === team.id); const player = roster[(roundIndex + pairIndex + sequence) % roster.length];
          const isCard = eventType === 'YELLOW' || eventType === 'RED';
          const fineStatus = isCard ? (matchEvents.filter((event) => event.event_type === 'YELLOW' || event.event_type === 'RED').length % 3 === 0 ? 'PAID' : 'UNPAID') : 'NONE';
          matchEvents.push({ id: `demo-event-${matchEvents.length + 1}`, match_id: match.id, team_id: team.id, player_id: player.id, event_type: eventType, period: sequence % 2 ? '2T' : '1T', minute_record: `${12 + sequence * 7}'`, fine_status: fineStatus, fine_amount: eventType === 'RED' ? tournament.fine_red_amount : eventType === 'YELLOW' ? tournament.fine_yellow_amount : 0, created_at: new Date(`${matchday.scheduled_date}T${match.scheduled_time}:00`).toISOString(), players: { name: player.name, shirt_number: player.shirt_number, teams: team }, teams: team, matches: match });
        };
        for (let goal = 0; goal < Number(homeScore); goal += 1) addEvent(home, 'GOAL', goal);
        for (let goal = 0; goal < Number(awayScore); goal += 1) addEvent(away, 'GOAL', goal + 2);
        if ((roundIndex + pairIndex) % 2 === 0) addEvent(away, 'YELLOW', 5);
        if ((roundIndex === 1 && pairIndex === 2) || (roundIndex === 2 && pairIndex === 1) || (roundIndex === 3 && pairIndex === 0)) addEvent(home, 'RED', 6);
      }
    }
    const fixed = rotating[0]; const tail = rotating.slice(1); tail.unshift(tail.pop()!); rotating.splice(0, rotating.length, fixed, ...tail);
  }
  teams.forEach((team, teamIndex) => {
    const hasYellow = matchEvents.some((event) => event.team_id === team.id && event.event_type === 'YELLOW');
    if (hasYellow) return;
    const match = matches.find((item) => item.status === 'FINISHED' && (item.home_team_id === team.id || item.away_team_id === team.id));
    const player = players.find((item) => item.team_id === team.id);
    if (!match || !player) return;
    matchEvents.push({ id: `demo-event-${matchEvents.length + 1}`, match_id: match.id, team_id: team.id, player_id: player.id, event_type: 'YELLOW', period: '2T', minute_record: `${42 + teamIndex}'`, fine_status: teamIndex % 3 === 0 ? 'PAID' : 'UNPAID', fine_amount: tournament.fine_yellow_amount, created_at: new Date(`${match.matchdays.scheduled_date}T${match.scheduled_time}:00`).toISOString(), players: { name: player.name, shirt_number: player.shirt_number, teams: team }, teams: team, matches: match });
  });
  [teams[0], teams[5]].forEach((team, index) => {
    const match = matches.find((item) => item.status === 'FINISHED' && (item.home_team_id === team.id || item.away_team_id === team.id));
    const player = players.find((item) => item.team_id === team.id && item.shirt_number === 8) || players.find((item) => item.team_id === team.id);
    if (!match || !player || matchEvents.some((event) => event.team_id === team.id && event.player_id === player.id && event.event_type === 'RED')) return;
    matchEvents.push({ id: `demo-event-${matchEvents.length + 1}`, match_id: match.id, team_id: team.id, player_id: player.id, event_type: 'RED', period: '2T', minute_record: `${70 + index * 5}'`, fine_status: 'UNPAID', fine_amount: tournament.fine_red_amount, created_at: new Date(`${match.matchdays.scheduled_date}T${match.scheduled_time}:00`).toISOString(), players: { name: player.name, shirt_number: player.shirt_number, teams: team }, teams: team, matches: match });
  });
  return { matchdays, matches, matchEvents };
}

export function initialDemoDatabase(): Database {
  const competition = buildDemoCompetition();
  const scorekeepers = ['JUEZ DEMO NORTE', 'JUEZ DEMO CENTRAL', 'JUEZ DEMO SUR'].map((name, index) => ({ id: `demo-scorekeeper-${index + 1}`, client_id: 'demo-client', name, role: index === 2 ? 'PLANILLERO' : 'JUEZ', username: `juez.demo${index + 1}`, assigned_password: 'demo1234', must_change_password: false, is_active: true, created_at: '2026-08-26T12:00:00Z' }));
  const scorekeeperAccess = competition.matches.filter((match) => match.status !== 'BYE').slice(0, 9).map((match, index) => ({ scorekeeper_user_id: scorekeepers[index % scorekeepers.length].id, match_id: match.id, matches: match }));
  return { clients: [{ id: 'demo-client', name: 'INSTITUCIÓN DEMOSTRATIVA', slug: 'experiencia-7c9f3a', logo_url: null, is_active: true }], tournaments: [tournament], sports: [sport], categories: [category], schools, teams, players, matchdays: competition.matchdays, matches: competition.matches, match_events: competition.matchEvents, player_documents: [], team_staff: teams.flatMap((team, index) => [{ id: `demo-staff-${index + 1}`, team_id: team.id, role: 'ENTRENADOR', full_name: `ENTRENADOR DEMO ${index + 1}` }]), scorekeeper_users: scorekeepers, scorekeeper_match_access: scorekeeperAccess, delegate_users: [{ id: 'demo-delegate', client_id: 'demo-client', school_id: schools[0].id, name: 'DELEGADO DEMO', username: 'demo', is_active: true, must_change_password: false }], delegate_team_access: teams.slice(0, 3).map((team) => ({ delegate_user_id: 'demo-delegate', team_id: team.id, teams: team })) };
}

export function loadDemoDatabase(): Database {
  try { const saved = window.localStorage.getItem(DEMO_STORAGE_KEY); return saved ? JSON.parse(saved) : initialDemoDatabase(); } catch { return initialDemoDatabase(); }
}

export function saveDemoDatabase(database: Database) { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(database)); window.dispatchEvent(new CustomEvent('sportscore-demo-change')); }
export function resetDemoDatabase() { saveDemoDatabase(initialDemoDatabase()); }

function nestedValue(row: Row, key: string): unknown { return key.split('.').reduce<any>((value, part) => value?.[part], row); }

class DemoQuery implements PromiseLike<{ data: any; error: any; count?: number | null }> {
  private filters: Array<(row: Row) => boolean> = []; private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any; private singleMode: 'single' | 'maybe' | null = null; private countMode = false; private head = false; private limitCount?: number;
  constructor(private table: string) {}
  select(_columns = '*', options?: { count?: string; head?: boolean }) { this.countMode = Boolean(options?.count); this.head = Boolean(options?.head); return this; }
  insert(payload: any) { this.operation = 'insert'; this.payload = payload; return this; }
  upsert(payload: any) { this.operation = 'upsert'; this.payload = payload; return this; }
  update(payload: any) { this.operation = 'update'; this.payload = payload; return this; }
  delete() { this.operation = 'delete'; return this; }
  eq(key: string, value: any) { this.filters.push((row) => nestedValue(row, key) === value); return this; }
  neq(key: string, value: any) { this.filters.push((row) => nestedValue(row, key) !== value); return this; }
  in(key: string, values: any[]) { this.filters.push((row) => values.includes(nestedValue(row, key))); return this; }
  is(key: string, value: any) { this.filters.push((row) => nestedValue(row, key) === value); return this; }
  or(_expression: string) { return this; }
  order(_key: string, _options?: any) { return this; }
  limit(value: number) { this.limitCount = value; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  then<TResult1 = any, TResult2 = never>(resolve?: ((value: { data: any; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(this.execute()).then(resolve, reject); }
  private execute() {
    const database = loadDemoDatabase(); const rows = database[this.table] || []; const matches = rows.filter((row) => this.filters.every((filter) => filter(row)));
    let data: any = this.limitCount ? matches.slice(0, this.limitCount) : matches;
    if (this.operation === 'insert') { const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({ id: row.id || crypto.randomUUID(), ...row })); database[this.table] = [...rows, ...incoming]; saveDemoDatabase(database); data = incoming; }
    if (this.operation === 'update') { database[this.table] = rows.map((row) => matches.includes(row) ? { ...row, ...this.payload } : row); saveDemoDatabase(database); data = database[this.table].filter((row) => this.filters.every((filter) => filter(row))); }
    if (this.operation === 'delete') { database[this.table] = rows.filter((row) => !matches.includes(row)); saveDemoDatabase(database); data = matches; }
    if (this.operation === 'upsert') { const incoming = Array.isArray(this.payload) ? this.payload : [this.payload]; incoming.forEach((item) => { const index = rows.findIndex((row) => row.id === item.id); if (index >= 0) rows[index] = { ...rows[index], ...item }; else rows.push({ id: item.id || crypto.randomUUID(), ...item }); }); database[this.table] = rows; saveDemoDatabase(database); data = incoming; }
    const count = this.countMode ? matches.length : null; if (this.head) data = null; else if (this.singleMode) data = data[0] || null;
    return { data, error: this.singleMode === 'single' && !data ? { code: 'PGRST116', message: 'Demo row not found' } : null, count };
  }
}

export const demoSupabase = { from(table: string) { return new DemoQuery(table); }, channel() { return { on() { return this; }, subscribe() { return this; } }; }, removeChannel() {}, storage: { from() { return { createSignedUrl: async () => ({ data: null, error: { message: 'No files in demo' } }) }; } } };
