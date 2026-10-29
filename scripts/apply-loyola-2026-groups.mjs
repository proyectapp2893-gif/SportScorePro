import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const categoryId = '2069519b-9c60-4a8e-9c97-dc477ee1067b';
const tournamentId = 'f8fe6ed5-214a-4a87-83e4-634e0cf205ed';
const approved = JSON.parse(readFileSync(new URL('../app/lib/tournaments/loyola-2026-groups.json', import.meta.url), 'utf8'));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (result, message) => { if (result.error) throw new Error(`${message}: ${result.error.message}`); return result.data; };
const mode = process.argv[2];
if (!['check', 'apply'].includes(mode)) throw new Error('Usa check o apply.');

const category = must(await db.from('categories').select('id, name, tournament_id').eq('id', categoryId).single(), 'Categoría');
const tournament = must(await db.from('tournaments').select('id, name, tournament_format, fixture_visible_to_delegates, fixture_visible_to_public').eq('id', tournamentId).single(), 'Torneo');
if (category.tournament_id !== tournament.id || category.name !== '+ 35' || tournament.name !== 'VII EDICIÓN LOYOLA SOCCER CUP' || tournament.tournament_format !== 'LOYOLA') throw new Error('La categoría no corresponde al torneo esperado.');
const teams = must(await db.from('teams').select('id, name, group_name').eq('category_id', categoryId), 'Equipos');
const byName = new Map(teams.map((team) => [team.name, team]));
const qualified = teams.filter((team) => ['A', 'B'].includes(team.group_name));
if (qualified.length !== 8 || qualified.filter((team) => team.group_name === 'A').length !== 4 || qualified.filter((team) => team.group_name === 'B').length !== 4) throw new Error('Los grupos no tienen cuatro equipos cada uno.');
const slots = new Set();
const pairs = new Set();
for (const round of approved) {
  const participants = new Set();
  for (const match of round.matches) {
    const home = byName.get(match.home), away = byName.get(match.away);
    if (!home || !away || home.group_name !== match.group || away.group_name !== match.group) throw new Error(`Grupo incorrecto: ${match.home} vs ${match.away}`);
    if (participants.has(home.id) || participants.has(away.id)) throw new Error(`Equipo duplicado en ${round.round}`);
    participants.add(home.id); participants.add(away.id);
    const pair = `${home.id}:${away.id}`;
    if (pairs.has(pair)) throw new Error(`Cruce duplicado: ${pair}`);
    pairs.add(pair);
    const slot = `${round.date}:${match.time}:${match.venue}`;
    if (slots.has(slot)) throw new Error(`Cancha duplicada: ${slot}`);
    slots.add(slot);
  }
  if (participants.size !== 8) throw new Error(`Jornada incompleta: ${round.round}`);
}
if (approved.length !== 6 || pairs.size !== 24) throw new Error('El calendario debe contener 24 cruces únicos.');
const days = must(await db.from('matchdays').select('id, round_number, scheduled_date').eq('category_id', categoryId), 'Jornadas');
const regular = days.filter((day) => day.round_number < 100);
const existingGroups = days.filter((day) => day.round_number >= 101 && day.round_number <= 106);
const later = days.filter((day) => day.round_number >= 201);
const legacy = days.filter((day) => day.round_number === 100);
if (regular.length !== 9 || later.length || existingGroups.length && existingGroups.length !== 6) throw new Error('El fixture actual difiere del estado previsto.');
const groupMatches = existingGroups.length ? must(await db.from('matches').select('id, matchday_id, home_team_id, away_team_id, scheduled_time, venue, group_name, status').in('matchday_id', existingGroups.map((day) => day.id)), 'Partidos de grupos') : [];
if (existingGroups.length && groupMatches.length !== 24) throw new Error('Las jornadas de grupos existentes están incompletas.');
if (existingGroups.length) {
  for (const round of approved) {
    const day = existingGroups.find((item) => item.round_number === round.round);
    if (!day || day.scheduled_date !== round.date) throw new Error(`Fecha incorrecta en la jornada ${round.round}.`);
    const actual = groupMatches.filter((match) => match.matchday_id === day.id);
    if (actual.length !== 4 || round.matches.some((expected) => !actual.some((match) =>
      match.home_team_id === byName.get(expected.home).id && match.away_team_id === byName.get(expected.away).id &&
      String(match.scheduled_time).slice(0, 5) === expected.time && match.venue === expected.venue && match.group_name === expected.group))) {
      throw new Error(`Partidos incorrectos en la jornada ${round.round}.`);
    }
  }
}
const legacyMatches = legacy.length ? must(await db.from('matches').select('*').in('matchday_id', legacy.map((day) => day.id)), 'Cruces prematuros') : [];
if (legacyMatches.some((match) => match.status !== 'SCHEDULED')) throw new Error('Hay un cruce final en curso o finalizado.');
const events = legacyMatches.length ? must(await db.from('match_events').select('id').in('match_id', legacyMatches.map((match) => match.id)), 'Eventos') : [];
if (events.length) throw new Error('Los cruces finales tienen eventos.');
console.log(JSON.stringify({ mode, regularRounds: regular.length, existingGroupRounds: existingGroups.length, existingGroupMatches: groupMatches.length, prematureFinalMatches: legacyMatches.length, plannedGroupRounds: approved.length, plannedGroupMatches: 24, delegatesVisible: tournament.fixture_visible_to_delegates, publicVisible: tournament.fixture_visible_to_public }));
if (mode === 'check') process.exit(0);

const snapshot = `/private/tmp/loyola-fixture-before-groups-${Date.now()}.json`;
writeFileSync(snapshot, JSON.stringify({ categoryId, tournamentId, legacy, legacyMatches, existingGroups }, null, 2));
console.log(`Copia de los cruces prematuros: ${snapshot}`);
if (!existingGroups.length) {
  const created = [];
  try {
    for (const round of approved) {
      const day = must(await db.from('matchdays').insert({ category_id: categoryId, round_number: round.round, scheduled_date: round.date, is_open: true }).select('id').single(), `Crear jornada ${round.round}`);
      created.push(day.id);
      must(await db.from('matches').insert(round.matches.map((match) => ({
        matchday_id: day.id, home_team_id: byName.get(match.home).id, away_team_id: byName.get(match.away).id,
        scheduled_time: `${match.time}:00`, venue: match.venue, group_name: match.group,
        leg: round.round <= 103 ? 1 : 2, status: 'SCHEDULED', match_type: 'GROUP',
      }))), `Crear partidos ${round.round}`);
    }
  } catch (error) {
    if (created.length) {
      must(await db.from('matches').delete().in('matchday_id', created), 'Revertir partidos');
      must(await db.from('matchdays').delete().in('id', created), 'Revertir jornadas');
    }
    throw error;
  }
}
if (legacy.length) {
  must(await db.from('matches').delete().in('matchday_id', legacy.map((day) => day.id)), 'Retirar partidos finales prematuros');
  must(await db.from('matchdays').delete().in('id', legacy.map((day) => day.id)), 'Retirar jornada final prematura');
}
const finalDays = must(await db.from('matchdays').select('id, round_number').eq('category_id', categoryId), 'Verificar jornadas');
const finalGroupDays = finalDays.filter((day) => day.round_number >= 101 && day.round_number <= 106);
const finalMatches = must(await db.from('matches').select('id').in('matchday_id', finalGroupDays.map((day) => day.id)), 'Verificar partidos');
if (finalDays.length !== 15 || finalGroupDays.length !== 6 || finalMatches.length !== 24) throw new Error('La verificación final no coincide con 15 jornadas y 24 partidos nuevos.');
console.log(JSON.stringify({ result: 'ok', totalRounds: finalDays.length, groupRounds: finalGroupDays.length, groupMatches: finalMatches.length, finalRoundCreated: false }));
