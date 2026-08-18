import fs from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ADMIN_USERNAME = 'loyola.demo';
const ADMIN_PASSWORD = 'LoyolaDemo2026!';
const DELEGATE_PASSWORD = 'Delegado2026!';
const CLIENT_SLUG = 'loyola-cup';

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8').split(/\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')).map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [prefix, salt, key] = storedHash.split('$');
  if (prefix !== 'scrypt' || !salt || !key) return false;
  return scryptSync(password, salt, Buffer.from(key, 'hex').length).toString('hex') === key;
}

function assertResult(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

function roundRobin(ids) {
  const rotating = [...ids];
  const rounds = [];
  for (let round = 0; round < ids.length - 1; round += 1) {
    const games = [];
    for (let i = 0; i < ids.length / 2; i += 1) {
      const pair = [rotating[i], rotating[ids.length - 1 - i]];
      games.push(round % 2 === 0 ? pair : pair.reverse());
    }
    rounds.push(games);
    rotating.splice(1, rotating.length - 1, rotating.at(-1), ...rotating.slice(1, -1));
  }
  return rounds;
}

function isoDate(dayOffset) {
  const date = new Date('2026-08-01T14:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString();
}

async function resetDemoClient(clientId) {
  const tournaments = assertResult(await supabase.from('tournaments').select('id').eq('client_id', clientId), 'Consultando torneos demo');
  const tournamentIds = tournaments.map((item) => item.id);
  const categories = tournamentIds.length ? assertResult(await supabase.from('categories').select('id').in('tournament_id', tournamentIds), 'Consultando categorías demo') : [];
  const categoryIds = categories.map((item) => item.id);
  const teams = categoryIds.length ? assertResult(await supabase.from('teams').select('id').in('category_id', categoryIds), 'Consultando equipos demo') : [];
  const teamIds = teams.map((item) => item.id);
  const matchdays = categoryIds.length ? assertResult(await supabase.from('matchdays').select('id').in('category_id', categoryIds), 'Consultando jornadas demo') : [];
  const matchdayIds = matchdays.map((item) => item.id);
  const matches = matchdayIds.length ? assertResult(await supabase.from('matches').select('id').in('matchday_id', matchdayIds), 'Consultando partidos demo') : [];
  const matchIds = matches.map((item) => item.id);
  const delegates = assertResult(await supabase.from('delegate_users').select('id').eq('client_id', clientId), 'Consultando delegados demo');
  const delegateIds = delegates.map((item) => item.id);

  if (matchIds.length) assertResult(await supabase.from('match_events').delete().in('match_id', matchIds), 'Eliminando eventos demo');
  if (matchIds.length) assertResult(await supabase.from('matches').delete().in('id', matchIds), 'Eliminando partidos demo');
  if (matchdayIds.length) assertResult(await supabase.from('matchdays').delete().in('id', matchdayIds), 'Eliminando jornadas demo');
  if (tournamentIds.length) assertResult(await supabase.from('tournament_awards').delete().in('tournament_id', tournamentIds), 'Eliminando premios demo');
  if (delegateIds.length) assertResult(await supabase.from('delegate_team_access').delete().in('delegate_user_id', delegateIds), 'Eliminando accesos demo');
  if (delegateIds.length) assertResult(await supabase.from('delegate_users').delete().in('id', delegateIds), 'Eliminando delegados demo');
  if (teamIds.length) assertResult(await supabase.from('team_staff').delete().in('team_id', teamIds), 'Eliminando técnicos demo');
  if (teamIds.length) assertResult(await supabase.from('players').delete().in('team_id', teamIds), 'Eliminando jugadores demo');
  if (teamIds.length) assertResult(await supabase.from('teams').delete().in('id', teamIds), 'Eliminando equipos demo');
  if (categoryIds.length) assertResult(await supabase.from('categories').delete().in('id', categoryIds), 'Eliminando categorías demo');
  if (tournamentIds.length) assertResult(await supabase.from('tournaments').delete().in('id', tournamentIds), 'Eliminando torneos demo');
  assertResult(await supabase.from('schools').delete().eq('client_id', clientId), 'Eliminando instituciones demo');
  assertResult(await supabase.from('clients').delete().eq('id', clientId), 'Eliminando perfil demo');
}

const teamDefinitions = [
  { name: 'LEONES DE LOYOLA', school: 'COLEGIO SAN IGNACIO', color: '7c3aed', delegate: 'MARIO GOMEZ' },
  { name: 'AGUILAS DEL NORTE', school: 'INSTITUTO NUEVA GRANADA', color: '1d4ed8', delegate: 'CARLOS RAMIREZ' },
  { name: 'TITANES FC', school: 'COLEGIO SANTA TERESA', color: 'dc2626', delegate: 'PABLO HERRERA' },
  { name: 'REAL BOLIVAR', school: 'ACADEMIA BOLIVAR', color: 'ca8a04', delegate: 'ANDRES MENDOZA' },
  { name: 'JAGUARES DEL CARIBE', school: 'LICEO DEL CARIBE', color: '059669', delegate: 'LUIS MARTINEZ' },
  { name: 'HALCONES AZULES', school: 'COLEGIO SAN GABRIEL', color: '0284c7', delegate: 'DANIEL TORRES' },
  { name: 'DEPORTIVO CENTRAL', school: 'INSTITUTO CENTRAL', color: 'ea580c', delegate: 'CAMILO RODRIGUEZ' },
  { name: 'GUERREROS DEL SUR', school: 'COLEGIO DEL SUR', color: '334155', delegate: 'MIGUEL CASTRO' },
];

const firstNames = ['SANTIAGO', 'MATEO', 'SEBASTIAN', 'NICOLAS', 'SAMUEL', 'DANIEL', 'MARTIN', 'EMILIANO', 'ALEJANDRO', 'JUAN', 'DAVID', 'TOMAS', 'LUCAS', 'GABRIEL', 'JERONIMO'];
const lastNames = ['GARCIA', 'RODRIGUEZ', 'MARTINEZ', 'LOPEZ', 'GONZALEZ', 'PEREZ', 'SANCHEZ', 'RAMIREZ', 'TORRES', 'FLOREZ', 'RUIZ', 'DIAZ', 'MORENO', 'CASTRO', 'ORTIZ'];

const results = [
  [[3, 0], [2, 1], [1, 1], [0, 2]],
  [[2, 0], [1, 0], [2, 2], [3, 1]],
  [[1, 1], [0, 2], [4, 1], [2, 0]],
  [[3, 1], [1, 2], [0, 0], [1, 3]],
  [[2, 1], [2, 0], [1, 0], [2, 2]],
  [[1, 0], [3, 2], [0, 2], [1, 1]],
  [[2, 0], [1, 1], [2, 3], [0, 1]],
];

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Faltan las credenciales de Supabase en .env.local.');
}

const existingClient = assertResult(
  await supabase.from('clients').select('id, access_code_hash').eq('slug', CLIENT_SLUG).maybeSingle(),
  'Consultando perfil Loyola Cup',
);
if (process.argv.includes('--reset-credentials')) {
  if (!existingClient) throw new Error('No existe el perfil loyola-cup.');
  const adminHash = hashPassword(ADMIN_PASSWORD);
  assertResult(await supabase.from('clients').update({ access_code: null, access_code_hash: adminHash, username: ADMIN_USERNAME, is_active: true }).eq('id', existingClient.id), 'Reiniciando acceso administrativo');
  const delegates = assertResult(await supabase.from('delegate_users').select('id, username').eq('client_id', existingClient.id).order('username'), 'Consultando delegados');
  const delegateHash = hashPassword(DELEGATE_PASSWORD);
  assertResult(await supabase.from('delegate_users').update({ password_hash: delegateHash, assigned_password: DELEGATE_PASSWORD, must_change_password: false, is_active: true, updated_at: new Date().toISOString() }).eq('client_id', existingClient.id), 'Reiniciando accesos de delegados');
  const verification = assertResult(await supabase.from('clients').select('access_code_hash').eq('id', existingClient.id).single(), 'Verificando administrador');
  const delegateVerification = assertResult(await supabase.from('delegate_users').select('username, password_hash, is_active').eq('client_id', existingClient.id).order('username'), 'Verificando delegados');
  console.log(JSON.stringify({
    ok: verifyPassword(ADMIN_PASSWORD, verification.access_code_hash) && delegateVerification.every((item) => item.is_active && verifyPassword(DELEGATE_PASSWORD, item.password_hash)),
    admin: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    delegatePortal: `/${CLIENT_SLUG}/delegado`,
    delegates: delegates.map((item) => item.username),
    delegatePassword: DELEGATE_PASSWORD,
  }, null, 2));
  process.exit(0);
}
if (process.argv.includes('--fix-red-fine')) {
  if (!existingClient) throw new Error('No existe el perfil loyola-cup.');
  const updated = assertResult(await supabase.from('tournaments').update({ fine_red_amount: 50000 }).eq('client_id', existingClient.id).eq('name', 'LOYOLA CUP 2026 - TORNEO DEMOSTRATIVO').select('id, name, fine_yellow_amount, fine_red_amount').single(), 'Actualizando tarifa de tarjeta roja');
  console.log(JSON.stringify({ ok: updated.fine_red_amount === 50000, tournament: updated }, null, 2));
  process.exit(0);
}
if (process.argv.includes('--two-rounds')) {
  if (!existingClient) throw new Error('No existe el perfil loyola-cup.');
  const tournament = assertResult(await supabase.from('tournaments').select('id').eq('client_id', existingClient.id).eq('name', 'LOYOLA CUP 2026 - TORNEO DEMOSTRATIVO').single(), 'Consultando torneo demo');
  const category = assertResult(await supabase.from('categories').select('id').eq('tournament_id', tournament.id).single(), 'Consultando categoría demo');
  const discardedMatchdays = assertResult(await supabase.from('matchdays').select('id').eq('category_id', category.id).gt('round_number', 2), 'Consultando jornadas posteriores');
  const discardedMatchdayIds = discardedMatchdays.map((item) => item.id);
  const discardedMatches = discardedMatchdayIds.length ? assertResult(await supabase.from('matches').select('id').in('matchday_id', discardedMatchdayIds), 'Consultando partidos posteriores') : [];
  const discardedMatchIds = discardedMatches.map((item) => item.id);
  if (discardedMatchIds.length) assertResult(await supabase.from('match_events').delete().in('match_id', discardedMatchIds), 'Eliminando eventos de jornadas 3 a 7');
  if (discardedMatchIds.length) assertResult(await supabase.from('matches').delete().in('id', discardedMatchIds), 'Eliminando partidos de jornadas 3 a 7');
  if (discardedMatchdayIds.length) assertResult(await supabase.from('matchdays').delete().in('id', discardedMatchdayIds), 'Eliminando jornadas 3 a 7');

  const remainingMatchdays = assertResult(await supabase.from('matchdays').select('id').eq('category_id', category.id).lte('round_number', 2), 'Consultando dos jornadas demo');
  const remainingMatchdayIds = remainingMatchdays.map((item) => item.id);
  assertResult(await supabase.from('matches').update({ home_sets: null, away_sets: null }).in('matchday_id', remainingMatchdayIds), 'Corrigiendo marcadores de fútbol');

  const delegates = assertResult(await supabase.from('delegate_users').select('id, username').eq('client_id', existingClient.id), 'Consultando delegados demo');
  for (const delegate of delegates) {
    const index = Number(delegate.username.replace(/\D/g, '')) - 1;
    if (teamDefinitions[index]) assertResult(await supabase.from('delegate_users').update({ name: teamDefinitions[index].delegate }).eq('id', delegate.id), `Actualizando ${delegate.username}`);
  }

  const teams = assertResult(await supabase.from('teams').select('id, name').eq('category_id', category.id), 'Consultando equipos demo');
  const teamIds = teams.map((item) => item.id);
  const events = assertResult(await supabase.from('match_events').select('team_id, event_type').in('team_id', teamIds).in('event_type', ['YELLOW', 'RED']), 'Recalculando disciplina');
  for (const team of teams) {
    const teamEvents = events.filter((event) => event.team_id === team.id);
    const fairPlay = 1000 - teamEvents.filter((event) => event.event_type === 'YELLOW').length * 20 - teamEvents.filter((event) => event.event_type === 'RED').length * 60;
    assertResult(await supabase.from('teams').update({ fair_play_points: fairPlay }).eq('id', team.id), `Actualizando Fair Play de ${team.name}`);
  }
  assertResult(await supabase.from('tournament_awards').delete().eq('tournament_id', tournament.id), 'Retirando premios de siete jornadas');

  const verificationMatches = assertResult(await supabase.from('matches').select('id, home_score, away_score, home_sets, away_sets, status, matchdays!inner(round_number, category_id)').eq('matchdays.category_id', category.id).order('matchdays(round_number)'), 'Verificando partidos demo');
  console.log(JSON.stringify({
    ok: verificationMatches.length === 8 && verificationMatches.every((match) => match.status === 'FINISHED' && match.home_sets === null && match.away_sets === null),
    rounds: [...new Set(verificationMatches.map((match) => match.matchdays.round_number))],
    matches: verificationMatches.length,
    scores: verificationMatches.map((match) => `${match.home_score}-${match.away_score}`),
    delegates: teamDefinitions.map((item, index) => ({ username: `delegado${index + 1}`, name: item.delegate })),
  }, null, 2));
  process.exit(0);
}
if (process.argv.includes('--three-rounds')) {
  if (!existingClient) throw new Error('No existe el perfil loyola-cup.');
  const tournament = assertResult(await supabase.from('tournaments').select('id').eq('client_id', existingClient.id).eq('name', 'LOYOLA CUP 2026 - TORNEO DEMOSTRATIVO').single(), 'Consultando torneo demo');
  const category = assertResult(await supabase.from('categories').select('id').eq('tournament_id', tournament.id).single(), 'Consultando categoría demo');
  const teams = assertResult(await supabase.from('teams').select('id, name').eq('category_id', category.id), 'Consultando equipos demo');
  const teamByName = new Map(teams.map((team) => [team.name, team]));
  const orderedTeams = teamDefinitions.map((definition) => teamByName.get(definition.name));
  if (orderedTeams.some((team) => !team)) throw new Error('No se encontraron los ocho equipos de la demo.');

  const existingThirdRound = assertResult(await supabase.from('matchdays').select('id').eq('category_id', category.id).eq('round_number', 3), 'Consultando tercera jornada');
  const existingThirdIds = existingThirdRound.map((item) => item.id);
  if (existingThirdIds.length) {
    const oldMatches = assertResult(await supabase.from('matches').select('id').in('matchday_id', existingThirdIds), 'Consultando partidos anteriores de jornada 3');
    const oldMatchIds = oldMatches.map((item) => item.id);
    if (oldMatchIds.length) assertResult(await supabase.from('match_events').delete().in('match_id', oldMatchIds), 'Eliminando eventos anteriores de jornada 3');
    if (oldMatchIds.length) assertResult(await supabase.from('matches').delete().in('id', oldMatchIds), 'Eliminando partidos anteriores de jornada 3');
    assertResult(await supabase.from('matchdays').delete().in('id', existingThirdIds), 'Eliminando jornada 3 anterior');
  }

  const thirdRound = roundRobin(orderedTeams.map((team) => team.id))[2];
  const matchday = assertResult(await supabase.from('matchdays').insert({ category_id: category.id, round_number: 3, scheduled_date: '2026-08-20', is_open: true }).select('id').single(), 'Creando tercera jornada');
  assertResult(await supabase.from('matches').insert(thirdRound.map(([homeId, awayId], index) => ({
    matchday_id: matchday.id, home_team_id: homeId, away_team_id: awayId,
    scheduled_time: `${String(14 + index * 2).padStart(2, '0')}:00`, venue: index % 2 ? 'CANCHA LOYOLA 2' : 'ESTADIO SAN IGNACIO',
    status: 'SCHEDULED', home_score: 0, away_score: 0, home_sets: null, away_sets: null,
  }))), 'Creando próximos partidos de jornada 3');

  const finishedMatches = assertResult(await supabase.from('matches').select('id, home_team_id, away_team_id, matchdays!inner(category_id)').eq('matchdays.category_id', category.id).eq('status', 'FINISHED'), 'Consultando partidos finalizados');
  const redEvents = assertResult(await supabase.from('match_events').select('team_id, event_type, matches!inner(matchdays!inner(category_id))').eq('matches.matchdays.category_id', category.id).eq('event_type', 'RED'), 'Consultando tarjetas rojas');
  for (const team of orderedTeams) {
    if (redEvents.some((event) => event.team_id === team.id)) continue;
    const match = finishedMatches.find((item) => item.home_team_id === team.id || item.away_team_id === team.id);
    const player = assertResult(await supabase.from('players').select('id').eq('team_id', team.id).order('shirt_number').limit(1).single(), `Consultando jugador de ${team.name}`);
    assertResult(await supabase.from('match_events').insert({
      match_id: match.id, team_id: team.id, player_id: player.id, event_type: 'RED', period: '2T', minute_record: 36,
      fine_status: 'UNPAID', created_at: '2026-08-03T16:00:00.000Z',
    }), `Creando tarjeta roja de ${team.name}`);
  }

  const finalRedEvents = assertResult(await supabase.from('match_events').select('team_id, event_type, matches!inner(matchdays!inner(category_id))').eq('matches.matchdays.category_id', category.id).eq('event_type', 'RED'), 'Verificando tarjetas rojas');
  for (const team of orderedTeams) {
    const teamReds = finalRedEvents.filter((event) => event.team_id === team.id).length;
    const yellows = assertResult(await supabase.from('match_events').select('id').eq('team_id', team.id).eq('event_type', 'YELLOW'), `Consultando amarillas de ${team.name}`);
    assertResult(await supabase.from('teams').update({ fair_play_points: 1000 - yellows.length * 20 - teamReds * 60 }).eq('id', team.id), `Actualizando Fair Play de ${team.name}`);
  }

  const verification = assertResult(await supabase.from('matches').select('id, status, matchdays!inner(round_number, category_id)').eq('matchdays.category_id', category.id), 'Verificando tres jornadas');
  console.log(JSON.stringify({
    ok: verification.length === 12 && finalRedEvents.length >= 8 && orderedTeams.every((team) => finalRedEvents.some((event) => event.team_id === team.id)),
    rounds: [1, 2, 3], finishedMatches: verification.filter((match) => match.status === 'FINISHED').length,
    upcomingMatches: verification.filter((match) => match.status === 'SCHEDULED').length,
    redCardsByTeam: orderedTeams.map((team) => ({ team: team.name, redCards: finalRedEvents.filter((event) => event.team_id === team.id).length })),
  }, null, 2));
  process.exit(0);
}
if (existingClient) {
  if (!process.argv.includes('--reset')) {
    throw new Error('El perfil loyola-cup ya existe. Usa --reset para regenerar exclusivamente esta demo.');
  }
  await resetDemoClient(existingClient.id);
}

const client = assertResult(await supabase.from('clients').insert({
  name: 'LOYOLA CUP', slug: CLIENT_SLUG, username: ADMIN_USERNAME,
  access_code: null, access_code_hash: hashPassword(ADMIN_PASSWORD), logo_url: '/logo.png', is_active: true,
}).select('id, name, slug').single(), 'Creando perfil Loyola Cup');

let sport = assertResult(await supabase.from('sports').select('id, name')
  .or('name.ilike.%FUTBOL%,name.ilike.%FÚTBOL%').limit(1).maybeSingle(), 'Consultando fútbol');
if (!sport) {
  sport = assertResult(await supabase.from('sports').insert({ name: 'FUTBOL', scoring_system: 'POINTS' })
    .select('id, name').single(), 'Creando fútbol');
}

const tournament = assertResult(await supabase.from('tournaments').insert({
  client_id: client.id, name: 'LOYOLA CUP 2026 - TORNEO DEMOSTRATIVO', logo_url: '/logo.png',
  tournament_format: 'LEAGUE', is_active: true, fair_play_enabled: true,
  fp_starting_points: 1000, fp_yellow_deduction: 20, fp_red_deduction: 60, fp_no_show_deduction: 100,
  fp_custom_rule: [], fine_yellow_amount: 25000, fine_red_amount: 50000,
  fixture_visible_to_delegates: true,
}).select('id, name').single(), 'Creando torneo');

const category = assertResult(await supabase.from('categories').insert({
  tournament_id: tournament.id, sport_id: sport.id, name: 'FUTBOL MASCULINO SUB-17', gender: 'MASCULINO',
  match_duration: '2x20 MIN', registration_open: true, min_roster_size: 12, max_roster_size: 18,
}).select('id, name').single(), 'Creando categoría');

const teams = [];
for (const [teamIndex, definition] of teamDefinitions.entries()) {
  const school = assertResult(await supabase.from('schools').insert({
    client_id: client.id, name: definition.school,
    logo_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(definition.name)}&background=${definition.color}&color=ffffff&bold=true&size=256`,
  }).select('id, name, logo_url').single(), `Creando ${definition.school}`);
  const team = assertResult(await supabase.from('teams').insert({
    school_id: school.id, category_id: category.id, name: definition.name, group_name: 'UNICO', fair_play_points: 1000,
  }).select('id, name').single(), `Creando ${definition.name}`);
  const roster = Array.from({ length: 15 }, (_, playerIndex) => ({
    team_id: team.id,
    name: `${firstNames[(playerIndex + teamIndex * 2) % firstNames.length]} ${lastNames[(playerIndex * 3 + teamIndex) % lastNames.length]}`,
    shirt_number: playerIndex + 1,
    birth_year: 2009 + (playerIndex % 2),
    identity_number: `LC${String(teamIndex + 1).padStart(2, '0')}${String(playerIndex + 1).padStart(3, '0')}`,
  }));
  const players = assertResult(await supabase.from('players').insert(roster).select('id, name, shirt_number'), `Creando nómina de ${definition.name}`);
  assertResult(await supabase.from('team_staff').insert([
    { team_id: team.id, role: 'HEAD_COACH', full_name: `PROF. ${definition.delegate}` },
    { team_id: team.id, role: 'ASSISTANT_COACH', full_name: `${firstNames[(teamIndex + 5) % firstNames.length]} ${lastNames[(teamIndex + 8) % lastNames.length]}` },
  ]), `Creando cuerpo técnico de ${definition.name}`);
  const username = `delegado${teamIndex + 1}`;
  const delegate = assertResult(await supabase.from('delegate_users').insert({
    client_id: client.id, school_id: school.id, name: definition.delegate, username,
    email: `${username}@loyolacup.demo`, whatsapp_phone: `5730010000${String(teamIndex + 1).padStart(2, '0')}`,
    password_hash: hashPassword(DELEGATE_PASSWORD), assigned_password: DELEGATE_PASSWORD,
    must_change_password: false, is_active: true,
  }).select('id').single(), `Creando delegado de ${definition.name}`);
  assertResult(await supabase.from('delegate_team_access').insert({ delegate_user_id: delegate.id, team_id: team.id }), `Asignando acceso a ${definition.name}`);
  teams.push({ ...team, school, players, username, delegateName: definition.delegate });
}

const rounds = roundRobin(teams.map((team) => team.id));
const allEvents = [];
const cardsByTeam = new Map(teams.map((team) => [team.id, { yellow: 0, red: 0 }]));
const standings = new Map(teams.map((team) => [team.id, { team, points: 0, goalsFor: 0, goalsAgainst: 0 }]));
let matchCount = 0;
for (const [roundIndex, games] of rounds.entries()) {
  const matchday = assertResult(await supabase.from('matchdays').insert({
    category_id: category.id, round_number: roundIndex + 1,
    scheduled_date: isoDate(roundIndex * 2).slice(0, 10), is_open: false,
  }).select('id').single(), `Creando jornada ${roundIndex + 1}`);
  for (const [gameIndex, [homeId, awayId]] of games.entries()) {
    const [homeScore, awayScore] = results[roundIndex][gameIndex];
    const homeStanding = standings.get(homeId);
    const awayStanding = standings.get(awayId);
    homeStanding.goalsFor += homeScore;
    homeStanding.goalsAgainst += awayScore;
    awayStanding.goalsFor += awayScore;
    awayStanding.goalsAgainst += homeScore;
    if (homeScore > awayScore) { homeStanding.points += 3; } else if (awayScore > homeScore) { awayStanding.points += 3; } else { homeStanding.points += 1; awayStanding.points += 1; }
    const match = assertResult(await supabase.from('matches').insert({
      matchday_id: matchday.id, home_team_id: homeId, away_team_id: awayId,
      scheduled_time: `${String(8 + gameIndex * 2).padStart(2, '0')}:00`, venue: gameIndex % 2 ? 'CANCHA LOYOLA 2' : 'ESTADIO SAN IGNACIO',
      status: 'FINISHED', home_score: homeScore, away_score: awayScore, current_period: 'FIN',
      home_sets: null, away_sets: null,
    }).select('id').single(), `Creando partido de jornada ${roundIndex + 1}`);
    matchCount += 1;
    for (const [teamId, score, minuteSeed] of [[homeId, homeScore, 7], [awayId, awayScore, 13]]) {
      const team = teams.find((item) => item.id === teamId);
      for (let goal = 0; goal < score; goal += 1) {
        const player = team.players[(roundIndex + gameIndex + goal * 2 + (teamId === awayId ? 1 : 0)) % 6];
        allEvents.push({ match_id: match.id, team_id: teamId, player_id: player.id, event_type: 'GOAL', period: goal % 2 ? '2T' : '1T', minute_record: minuteSeed + goal * 9, fine_status: 'NONE', created_at: isoDate(roundIndex * 2) });
      }
    }
    const cardTeam = (roundIndex + gameIndex) % 3 === 0 ? homeId : awayId;
    const cardOwner = teams.find((item) => item.id === cardTeam);
    const yellowPlayer = cardOwner.players[6 + ((roundIndex + gameIndex) % 5)];
    allEvents.push({ match_id: match.id, team_id: cardTeam, player_id: yellowPlayer.id, event_type: 'YELLOW', period: '2T', minute_record: 25 + gameIndex, fine_status: matchCount % 3 === 0 ? 'PAID' : 'UNPAID', created_at: isoDate(roundIndex * 2) });
    cardsByTeam.get(cardTeam).yellow += 1;
    if (matchCount % 7 === 0) {
      const redTeam = homeId;
      const redOwner = teams.find((item) => item.id === redTeam);
      allEvents.push({ match_id: match.id, team_id: redTeam, player_id: redOwner.players[11].id, event_type: 'RED', period: '2T', minute_record: 34, fine_status: matchCount % 2 === 0 ? 'PAID' : 'UNPAID', created_at: isoDate(roundIndex * 2) });
      cardsByTeam.get(redTeam).red += 1;
    }
  }
}

assertResult(await supabase.from('match_events').insert(allEvents), 'Creando goles, tarjetas y sanciones');
for (const team of teams) {
  const cards = cardsByTeam.get(team.id);
  assertResult(await supabase.from('teams').update({ fair_play_points: 1000 - cards.yellow * 20 - cards.red * 60 }).eq('id', team.id), `Actualizando Fair Play de ${team.name}`);
}

const goalsByPlayer = new Map();
for (const event of allEvents.filter((item) => item.event_type === 'GOAL')) goalsByPlayer.set(event.player_id, (goalsByPlayer.get(event.player_id) || 0) + 1);
const [topScorerId, topScorerGoals] = [...goalsByPlayer.entries()].sort((a, b) => b[1] - a[1])[0];
const topScorer = teams.flatMap((team) => team.players.map((player) => ({ ...player, team }))).find((player) => player.id === topScorerId);
const finalTable = [...standings.values()].sort((a, b) =>
  b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor,
);
const bestDefense = [...standings.values()].sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.points - a.points)[0];

assertResult(await supabase.from('tournament_awards').insert([
  { tournament_id: tournament.id, category_id: category.id, award_type: 'CHAMPION', title: 'CAMPEON LOYOLA CUP 2026', team_id: finalTable[0].team.id, description: `${finalTable[0].points} puntos en la tabla general.` },
  { tournament_id: tournament.id, category_id: category.id, award_type: 'RUNNER_UP', title: 'SUBCAMPEON LOYOLA CUP 2026', team_id: finalTable[1].team.id, description: `${finalTable[1].points} puntos en la tabla general.` },
  { tournament_id: tournament.id, category_id: category.id, award_type: 'THIRD_PLACE', title: 'TERCER PUESTO', team_id: finalTable[2].team.id, description: `${finalTable[2].points} puntos en la tabla general.` },
  { tournament_id: tournament.id, category_id: category.id, award_type: 'TOP_SCORER', title: 'MAYOR GOLEADOR', team_id: topScorer.team.id, player_id: topScorer.id, description: `${topScorerGoals} goles en la fase todos contra todos.` },
  { tournament_id: tournament.id, category_id: category.id, award_type: 'BEST_GOALKEEPER', title: 'VALLA MENOS VENCIDA', team_id: bestDefense.team.id, player_id: bestDefense.team.players[0].id, description: `${bestDefense.goalsAgainst} goles recibidos en 7 partidos.` },
  { tournament_id: tournament.id, category_id: category.id, award_type: 'MVP', title: 'JUGADOR MAS VALIOSO', team_id: finalTable[0].team.id, player_id: finalTable[0].team.players[1].id, description: 'Reconocimiento al jugador más influyente del torneo.' },
  { tournament_id: tournament.id, category_id: category.id, award_type: 'FAIR_PLAY', title: 'PREMIO FAIR PLAY', team_id: [...teams].sort((a, b) => (cardsByTeam.get(a.id).yellow + cardsByTeam.get(a.id).red * 3) - (cardsByTeam.get(b.id).yellow + cardsByTeam.get(b.id).red * 3))[0].id, description: 'Delegación con mejor comportamiento disciplinario.' },
]), 'Creando premiaciones');

const unpaidByTeam = Object.fromEntries(teams.map((team) => [team.id, 0]));
for (const event of allEvents.filter((item) => ['YELLOW', 'RED'].includes(item.event_type) && item.fine_status === 'UNPAID')) {
  unpaidByTeam[event.team_id] += event.event_type === 'RED' ? 50000 : 25000;
}

console.log(JSON.stringify({
  profile: client, tournament, category, teams: teams.length, players: teams.reduce((sum, team) => sum + team.players.length, 0),
  matches: matchCount, goals: allEvents.filter((event) => event.event_type === 'GOAL').length,
  yellowCards: allEvents.filter((event) => event.event_type === 'YELLOW').length,
  redCards: allEvents.filter((event) => event.event_type === 'RED').length,
  admin: { url: '/', username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  delegatePortal: `/${CLIENT_SLUG}/delegado`, delegatePassword: DELEGATE_PASSWORD,
  delegates: teams.map((team) => ({ team: team.name, delegate: team.delegateName, username: team.username, balanceDue: unpaidByTeam[team.id] })),
  topScorer: { name: topScorer.name, team: topScorer.team.name, goals: topScorerGoals },
  podium: finalTable.slice(0, 3).map((item, index) => ({ position: index + 1, team: item.team.name, points: item.points, goalDifference: item.goalsFor - item.goalsAgainst })),
  bestDefense: { team: bestDefense.team.name, goalkeeper: bestDefense.team.players[0].name, goalsAgainst: bestDefense.goalsAgainst },
}, null, 2));
