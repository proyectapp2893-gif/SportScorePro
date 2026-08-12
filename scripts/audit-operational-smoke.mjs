import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path = '.env.local') {
  const env = {};
  const content = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return { ...env, ...process.env };
}

function addFinding(findings, severity, area, message, context = {}) {
  findings.push({ severity, area, message, context });
}

function scoreEventValue(eventType) {
  if (eventType === 'GOAL' || eventType === 'BASKET_1') return 1;
  if (eventType === 'BASKET_2') return 2;
  if (eventType === 'BASKET_3') return 3;
  return 0;
}

function resultPoints(homeScore, awayScore) {
  if (homeScore > awayScore) return { home: 3, away: 0 };
  if (awayScore > homeScore) return { home: 0, away: 3 };
  return { home: 1, away: 1 };
}

const env = loadEnvFile();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const findings = [];
const summary = {
  clients: 0,
  tournaments: 0,
  categories: 0,
  teams: 0,
  players: 0,
  matches: 0,
  events: 0,
};

const { data: clients, error: clientsError } = await supabase
  .from('clients')
  .select('id, name, slug, is_active');

if (clientsError) throw clientsError;
summary.clients = clients?.length || 0;

for (const client of clients || []) {
  if (!client.slug) {
    addFinding(findings, 'critical', 'multicuenta', 'Cliente sin slug.', { client });
  }

  const { data: tournaments, error: tournamentsError } = await supabase
    .from('tournaments')
    .select('id, name, client_id, fair_play_enabled, fp_starting_points, fp_yellow_deduction, fp_red_deduction')
    .eq('client_id', client.id);

  if (tournamentsError) throw tournamentsError;
  summary.tournaments += tournaments?.length || 0;

  for (const tournament of tournaments || []) {
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name, tournament_id, sports(name)')
      .eq('tournament_id', tournament.id);

    if (categoriesError) throw categoriesError;
    summary.categories += categories?.length || 0;

    if (!categories?.length) {
      addFinding(findings, 'warning', 'torneos', 'Torneo sin categorías.', {
        client: client.slug,
        tournament: tournament.name,
      });
      continue;
    }

    for (const category of categories) {
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, category_id, school_id, played, won, drawn, lost, goals_for, goals_against, points, fair_play_points, schools(name, logo_url)')
        .eq('category_id', category.id);

      if (teamsError) throw teamsError;
      summary.teams += teams?.length || 0;

      const teamIds = new Set((teams || []).map((team) => team.id));
      const teamNames = new Map();

      for (const team of teams || []) {
        const normalizedName = team.name?.trim().toUpperCase();
        if (normalizedName && teamNames.has(normalizedName)) {
          addFinding(findings, 'warning', 'equipos', 'Equipo duplicado dentro de la misma categoría.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            team: team.name,
          });
        }
        teamNames.set(normalizedName, team.id);
      }

      if (!teams?.length) {
        addFinding(findings, 'warning', 'fixtures', 'Categoría sin equipos.', {
          client: client.slug,
          tournament: tournament.name,
          category: category.name,
        });
      }

      const { data: players, error: playersError } = await supabase
        .from('players')
        .select('id, name, team_id, shirt_number')
        .in('team_id', [...teamIds]);

      if (playersError && teamIds.size > 0) throw playersError;
      summary.players += players?.length || 0;
      const playerTeamById = new Map((players || []).map((player) => [player.id, player.team_id]));

      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id, status, home_team_id, away_team_id, home_score, away_score, home_sets, away_sets, venue,
          matchdays!inner(id, category_id, round_number, scheduled_date)
        `)
        .eq('matchdays.category_id', category.id);

      if (matchesError) throw matchesError;
      summary.matches += matches?.length || 0;

      const matchById = new Map();
      const standings = new Map((teams || []).map((team) => [team.id, {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      }]));

      for (const match of matches || []) {
        matchById.set(match.id, match);

        if (match.home_team_id && !teamIds.has(match.home_team_id)) {
          addFinding(findings, 'critical', 'fixtures', 'Local no pertenece a la categoría del partido.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            match: match.id,
          });
        }

        if (match.away_team_id && !teamIds.has(match.away_team_id)) {
          addFinding(findings, 'critical', 'fixtures', 'Visitante no pertenece a la categoría del partido.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            match: match.id,
          });
        }

        if (match.home_team_id && match.away_team_id && match.home_team_id === match.away_team_id) {
          addFinding(findings, 'critical', 'fixtures', 'Partido con el mismo equipo como local y visitante.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            match: match.id,
          });
        }

        if (match.status === 'FINISHED') {
          if (match.home_team_id && match.away_team_id && (match.home_score === null || match.away_score === null)) {
            addFinding(findings, 'critical', 'resultados', 'Partido finalizado sin marcador completo.', {
              client: client.slug,
              tournament: tournament.name,
              category: category.name,
              match: match.id,
            });
          }

          const homeStats = standings.get(match.home_team_id);
          const awayStats = standings.get(match.away_team_id);
          if (homeStats && awayStats) {
            const homeScore = match.home_score || 0;
            const awayScore = match.away_score || 0;
            const points = resultPoints(homeScore, awayScore);

            homeStats.played += 1;
            awayStats.played += 1;
            homeStats.goals_for += homeScore;
            homeStats.goals_against += awayScore;
            awayStats.goals_for += awayScore;
            awayStats.goals_against += homeScore;
            homeStats.points += points.home;
            awayStats.points += points.away;

            if (homeScore > awayScore) {
              homeStats.won += 1;
              awayStats.lost += 1;
            } else if (awayScore > homeScore) {
              awayStats.won += 1;
              homeStats.lost += 1;
            } else {
              homeStats.drawn += 1;
              awayStats.drawn += 1;
            }
          }
        }
      }

      for (const team of teams || []) {
        const expected = standings.get(team.id);
        if (!expected) continue;
        const stored = {
          played: team.played || 0,
          won: team.won || 0,
          drawn: team.drawn || 0,
          lost: team.lost || 0,
          goals_for: team.goals_for || 0,
          goals_against: team.goals_against || 0,
          points: team.points || 0,
        };
        const differs = Object.keys(expected).some((key) => expected[key] !== stored[key]);
        if (differs) {
          addFinding(findings, 'warning', 'posiciones', 'Estadística guardada difiere del recálculo por partidos finalizados.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            team: team.name,
            stored,
            expected,
          });
        }
      }

      const { data: events, error: eventsError } = await supabase
        .from('match_events')
        .select('id, match_id, player_id, team_id, event_type, matches!inner(status, matchdays!inner(category_id))')
        .eq('matches.matchdays.category_id', category.id);

      if (eventsError) throw eventsError;
      summary.events += events?.length || 0;

      const scoringByPlayer = new Map();
      for (const event of events || []) {
        const match = matchById.get(event.match_id);

        if (event.team_id && !teamIds.has(event.team_id)) {
          addFinding(findings, 'critical', 'eventos', 'Evento con equipo fuera de la categoría.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            event: event.id,
          });
        }

        if (match && event.team_id && event.team_id !== match.home_team_id && event.team_id !== match.away_team_id) {
          addFinding(findings, 'critical', 'eventos', 'Evento asignado a un equipo que no pertenece al partido.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            event: event.id,
            match: event.match_id,
          });
        }

        if (event.player_id && playerTeamById.has(event.player_id) && playerTeamById.get(event.player_id) !== event.team_id) {
          addFinding(findings, 'critical', 'eventos', 'Evento asignado a jugador de otro equipo.', {
            client: client.slug,
            tournament: tournament.name,
            category: category.name,
            event: event.id,
          });
        }

        const score = scoreEventValue(event.event_type);
        if (score > 0 && ['LIVE', 'FINISHED'].includes(event.matches?.status) && event.player_id) {
          scoringByPlayer.set(event.player_id, (scoringByPlayer.get(event.player_id) || 0) + score);
        }
      }

      if (scoringByPlayer.size > 0 && players?.length === 0) {
        addFinding(findings, 'critical', 'estadisticas', 'Hay anotaciones pero no hay jugadores cargados para la categoría.', {
          client: client.slug,
          tournament: tournament.name,
          category: category.name,
        });
      }
    }
  }
}

const criticalCount = findings.filter((finding) => finding.severity === 'critical').length;
const warningCount = findings.filter((finding) => finding.severity === 'warning').length;

console.log(JSON.stringify({ summary, criticalCount, warningCount, findings }, null, 2));

if (criticalCount > 0) {
  process.exit(2);
}
