import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function assertNoError(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

function logoUrl(name, color) {
  const encodedName = encodeURIComponent(name.replace(/\s+/g, '+'));
  return `https://ui-avatars.com/api/?name=${encodedName}&background=${color}&color=ffffff&bold=true&size=256&format=png`;
}

function makeRoundRobin(teamIds) {
  const ids = [...teamIds];
  const rounds = [];

  for (let round = 0; round < ids.length - 1; round += 1) {
    const matches = [];
    for (let index = 0; index < ids.length / 2; index += 1) {
      const home = ids[index];
      const away = ids[ids.length - 1 - index];
      matches.push(round % 2 === 0 ? [home, away] : [away, home]);
    }

    rounds.push(matches);
    const fixed = ids[0];
    const rotated = [fixed, ids[ids.length - 1], ...ids.slice(1, ids.length - 1)];
    ids.splice(0, ids.length, ...rotated);
  }

  return rounds;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const clients = assertNoError(
  await supabase.from('clients').select('id, name, slug, is_active').eq('is_active', true).order('created_at', { ascending: true }),
  'Consultando clientes',
);

const client = clients.find((item) => item.slug === 'csjb') || clients[0];
if (!client) throw new Error('No hay clientes activos para crear el torneo.');

let sport = assertNoError(
  await supabase.from('sports').select('id, name').or('name.ilike.%FUTBOL%,name.ilike.%FÚTBOL%,name.ilike.%FOOTBALL%').limit(1).maybeSingle(),
  'Consultando deporte fútbol',
);

if (!sport) {
  sport = assertNoError(
    await supabase.from('sports').insert({ name: 'FUTBOL', scoring_system: 'POINTS' }).select('id, name').single(),
    'Creando deporte fútbol',
  );
}

const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12);
const tournamentName = `PRUEBA FUTBOL 8E ${stamp}`;

const tournament = assertNoError(
  await supabase.from('tournaments').insert({
    client_id: client.id,
    name: tournamentName,
    logo_url: logoUrl('FUTBOL 8E', '0f766e'),
    tournament_format: 'LEAGUE',
    fair_play_enabled: true,
    fp_starting_points: 1000,
    fp_yellow_deduction: 100,
    fp_red_deduction: 300,
    fp_no_show_deduction: 500,
    fp_custom_rule: [],
    fine_yellow_amount: 0,
    fine_red_amount: 0,
  }).select('id, name').single(),
  'Creando torneo',
);

const category = assertNoError(
  await supabase.from('categories').insert({
    tournament_id: tournament.id,
    sport_id: sport.id,
    name: 'CATEGORIA PRUEBA',
    gender: 'MASCULINO',
    match_duration: '2x20 MIN',
  }).select('id, name').single(),
  'Creando categoría',
);

const teamDefinitions = [
  ['ATLETICO NORTE', '1d4ed8', 15],
  ['DEPORTIVO SUR', 'dc2626', 16],
  ['REAL CENTRAL', '7c3aed', 17],
  ['UNION ORIENTE', '059669', 18],
  ['ACADEMIA OCCIDENTE', 'ea580c', 19],
  ['CLUB CAPITAL', '0891b2', 20],
  ['ESTRELLAS FC', 'be123c', 15],
  ['TITANES SPORT', '334155', 20],
];

const teams = [];

for (const [name, color, playerCount] of teamDefinitions) {
  const school = assertNoError(
    await supabase.from('schools').insert({
      client_id: client.id,
      name: `${name} ${stamp}`,
      logo_url: logoUrl(name, color),
    }).select('id, name, logo_url').single(),
    `Creando institución ${name}`,
  );

  const team = assertNoError(
    await supabase.from('teams').insert({
      school_id: school.id,
      category_id: category.id,
      name,
      group_name: 'A',
      fair_play_points: 1000,
    }).select('id, name').single(),
    `Creando equipo ${name}`,
  );

  const players = Array.from({ length: playerCount }, (_, index) => {
    const number = index + 1;
    return {
      team_id: team.id,
      name: `${name} JUGADOR ${String(number).padStart(2, '0')}`,
      shirt_number: number,
      birth_year: 2008 + (index % 6),
    };
  });

  assertNoError(
    await supabase.from('players').insert(players),
    `Creando jugadores de ${name}`,
  );

  teams.push({ ...team, school, playerCount });
}

const rounds = makeRoundRobin(teams.map((team) => team.id));
const startDate = new Date('2026-08-01T00:00:00.000Z');
let insertedMatches = 0;

for (const [roundIndex, matches] of rounds.entries()) {
  const matchday = assertNoError(
    await supabase.from('matchdays').insert({
      category_id: category.id,
      round_number: roundIndex + 1,
      scheduled_date: addDays(startDate, roundIndex),
      is_open: true,
    }).select('id').single(),
    `Creando jornada ${roundIndex + 1}`,
  );

  const matchPayload = matches.map(([homeTeamId, awayTeamId], matchIndex) => ({
    matchday_id: matchday.id,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    scheduled_time: `${String(8 + matchIndex * 2).padStart(2, '0')}:00`,
    venue: `CANCHA ${matchIndex + 1}`,
    status: 'SCHEDULED',
  }));

  assertNoError(
    await supabase.from('matches').insert(matchPayload),
    `Creando partidos jornada ${roundIndex + 1}`,
  );
  insertedMatches += matchPayload.length;
}

const verification = {
  client: { name: client.name, slug: client.slug },
  tournament,
  category,
  teams: teams.map((team) => ({ name: team.name, players: team.playerCount, logo: team.school.logo_url })),
  rounds: rounds.length,
  matches: insertedMatches,
};

console.log(JSON.stringify(verification, null, 2));
