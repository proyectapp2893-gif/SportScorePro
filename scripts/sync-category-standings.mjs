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

function getPoints(homeScore, awayScore) {
  if (homeScore > awayScore) return { home: 3, away: 0 };
  if (awayScore > homeScore) return { home: 0, away: 3 };
  return { home: 1, away: 1 };
}

const env = loadEnvFile();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data: categories, error: categoriesError } = await supabase
  .from('categories')
  .select('id, name, tournaments(name, clients(slug))');

if (categoriesError) throw categoriesError;

const results = [];

for (const category of categories || []) {
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('category_id', category.id);

  if (teamsError) throw teamsError;
  if (!teams?.length) {
    results.push({ category: category.name, skipped: 'no teams' });
    continue;
  }

  const stats = new Map((teams || []).map((team) => [team.id, {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goals_for: 0,
    goals_against: 0,
    points: 0,
  }]));

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select(`
      id, home_score, away_score, home_team_id, away_team_id,
      matchdays!inner(category_id)
    `)
    .eq('matchdays.category_id', category.id)
    .eq('status', 'FINISHED');

  if (matchesError) throw matchesError;

  for (const match of matches || []) {
    const homeStats = stats.get(match.home_team_id);
    const awayStats = stats.get(match.away_team_id);
    if (!homeStats || !awayStats) continue;

    const homeScore = match.home_score || 0;
    const awayScore = match.away_score || 0;
    const points = getPoints(homeScore, awayScore);

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

  let updated = 0;
  for (const team of teams || []) {
    const nextStats = stats.get(team.id);
    const { error: updateError } = await supabase
      .from('teams')
      .update(nextStats)
      .eq('id', team.id);

    if (updateError) throw updateError;
    updated += 1;
  }

  results.push({
    category: category.name,
    tournament: category.tournaments?.name,
    client: category.tournaments?.clients?.slug,
    teams: teams.length,
    finishedMatches: matches?.length || 0,
    updated,
  });
}

console.log(JSON.stringify({ syncedCategories: results.length, results }, null, 2));
