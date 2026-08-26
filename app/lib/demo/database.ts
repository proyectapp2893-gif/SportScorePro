'use client';

import { DEMO_STORAGE_KEY } from './config';

type Row = Record<string, any>;
type Database = Record<string, Row[]>;

const sport = { id: 'demo-sport', name: 'FÚTBOL', scoring_system: 'GOALS' };
const tournament = { id: 'demo-tournament', client_id: 'demo-client', name: 'TORNEO DEMOSTRATIVO', tournament_format: 'ROUND_ROBIN', is_active: true, created_at: '2026-08-26T12:00:00Z', schedule_dates: ['2026-09-05'], schedule_time_slots: ['14:00', '16:00'], available_venues: ['Cancha 1', 'Cancha 2'], fixture_visible_to_delegates: true, fair_play_enabled: true, fp_starting_points: 100, fp_yellow_deduction: 1, fp_red_deduction: 3, fine_yellow_amount: 0, fine_red_amount: 0 };
const category = { id: 'demo-category', tournament_id: tournament.id, name: 'CATEGORÍA DEMO', gender: 'MASCULINO', sport_id: sport.id, sports: sport, tournaments: tournament, registration_open: true, min_roster_size: 5, max_roster_size: 25, schedule_dates: tournament.schedule_dates };
const teamNames = ['EQUIPO AURORA', 'EQUIPO HORIZONTE', 'EQUIPO CENTRAL', 'EQUIPO CAPITAL', 'EQUIPO NORTE', 'EQUIPO SUR', 'EQUIPO ÉLITE', 'EQUIPO UNIÓN', 'EQUIPO VANGUARDIA'];
const schools = teamNames.map((name, index) => ({ id: `demo-school-${index + 1}`, client_id: 'demo-client', name, logo_url: null }));
const teams = teamNames.map((name, index) => ({ id: `demo-team-${index + 1}`, category_id: category.id, school_id: schools[index].id, name, schools: schools[index], categories: category }));
const players = [
  { id: 'demo-player-1', team_id: teams[0].id, name: 'JUGADOR DEMO 01', identity_number: '10000001', shirt_number: 10, birth_year: 1985, birth_date: '1985-05-20', vinculo: 'EX-ALUMNO', relationship_detail: '2003', player_documents: [] },
  { id: 'demo-player-2', team_id: teams[0].id, name: 'JUGADOR DEMO 02', identity_number: '10000002', shirt_number: 7, birth_year: 1983, birth_date: '1983-08-14', vinculo: 'PADRE DE FAMILIA', relationship_detail: 'ESTUDIANTE DEMO', player_documents: [] },
];

export function initialDemoDatabase(): Database {
  return { clients: [{ id: 'demo-client', name: 'INSTITUCIÓN DEMOSTRATIVA', slug: 'experiencia-7c9f3a', logo_url: null, is_active: true }], tournaments: [tournament], sports: [sport], categories: [category], schools, teams, players, matchdays: [], matches: [], match_events: [], player_documents: [], team_staff: [], delegate_users: [{ id: 'demo-delegate', client_id: 'demo-client', school_id: schools[0].id, name: 'DELEGADO DEMO', username: 'demo', is_active: true, must_change_password: false }], delegate_team_access: [{ delegate_user_id: 'demo-delegate', team_id: teams[0].id, teams: teams[0] }] };
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
