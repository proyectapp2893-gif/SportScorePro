'use client';

import { loadDemoDatabase, saveDemoDatabase } from './database';

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function saveDemoTournament(input: {
  editingTournamentId?: string | null;
  tournament: Record<string, unknown>;
  sportId: string;
  categories: Array<{ id: string; name: string; gender: string; duration: string; isExisting?: boolean }>;
  deletedCategoryIds: string[];
  teamsMap: Record<string, string[]>;
}) {
  const db = loadDemoDatabase();
  const tournamentId = input.editingTournamentId || id('demo-tournament');
  const existingIndex = db.tournaments.findIndex((item) => item.id === tournamentId);
  const record = { id: tournamentId, client_id: 'demo-client', created_at: new Date().toISOString(), is_active: true, ...input.tournament };
  if (existingIndex >= 0) db.tournaments[existingIndex] = { ...db.tournaments[existingIndex], ...record };
  else db.tournaments.push(record);

  const removed = new Set(input.deletedCategoryIds);
  db.categories = db.categories.filter((item) => !removed.has(item.id));
  for (const draft of input.categories) {
    const categoryId = draft.isExisting ? draft.id : id('demo-category');
    const sport = db.sports.find((item) => item.id === input.sportId);
    const category = { id: categoryId, tournament_id: tournamentId, sport_id: input.sportId, name: draft.name, gender: draft.gender, match_duration: draft.duration, sports: sport, tournaments: record, registration_open: true, min_roster_size: 1, max_roster_size: 30 };
    const index = db.categories.findIndex((item) => item.id === categoryId);
    if (index >= 0) db.categories[index] = category; else db.categories.push(category);
    const selectedSchools = input.teamsMap[draft.id] || [];
    db.teams = db.teams.filter((team) => team.category_id !== categoryId || selectedSchools.includes(team.school_id));
    for (const schoolId of selectedSchools) {
      if (db.teams.some((team) => team.category_id === categoryId && team.school_id === schoolId)) continue;
      const school = db.schools.find((item) => item.id === schoolId);
      db.teams.push({ id: id('demo-team'), category_id: categoryId, school_id: schoolId, name: school?.name || 'EQUIPO DEMO', schools: school, categories: category });
    }
  }
  saveDemoDatabase(db);
  return { success: true, tournamentId, error: undefined };
}

export function createDemoSchools(names: string[]) {
  const db = loadDemoDatabase();
  for (const name of names.map((value) => value.trim().toUpperCase()).filter(Boolean)) {
    if (!db.schools.some((school) => school.name === name)) db.schools.push({ id: id('demo-school'), client_id: 'demo-client', name, logo_url: null });
  }
  saveDemoDatabase(db);
  return { success: true, data: { inserted: names.length }, error: undefined };
}

export function updateDemoSchool(schoolId: string, name: string) {
  const db = loadDemoDatabase();
  const school = db.schools.find((item) => item.id === schoolId);
  if (school) school.name = name.trim().toUpperCase();
  db.teams.filter((team) => team.school_id === schoolId).forEach((team) => { team.name = school?.name || team.name; if (team.schools) team.schools.name = school?.name; });
  saveDemoDatabase(db); return { success: true, error: undefined };
}

export function deleteDemoSchool(schoolId: string) {
  const db = loadDemoDatabase();
  const teamIds = db.teams.filter((team) => team.school_id === schoolId).map((team) => team.id);
  db.schools = db.schools.filter((school) => school.id !== schoolId);
  db.teams = db.teams.filter((team) => team.school_id !== schoolId);
  db.players = db.players.filter((player) => !teamIds.includes(player.team_id));
  saveDemoDatabase(db); return { success: true, error: undefined };
}

type FixtureRound = { roundNumber: number; scheduledDate?: string | null; matches: Array<{ homeTeamId: string; awayTeamId?: string | null; scheduledTime?: string | null; venue?: string | null; status?: string }> };

export function createDemoFixture(categoryId: string, rounds: FixtureRound[]) {
  const db = loadDemoDatabase();
  const oldMatchdayIds = db.matchdays.filter((day) => day.category_id === categoryId).map((day) => day.id);
  db.matches = db.matches.filter((match) => !oldMatchdayIds.includes(match.matchday_id));
  db.matchdays = db.matchdays.filter((day) => day.category_id !== categoryId);
  let insertedMatches = 0;
  for (const round of rounds) {
    const matchday = { id: id('demo-matchday'), category_id: categoryId, round_number: round.roundNumber, scheduled_date: round.scheduledDate || null };
    db.matchdays.push(matchday);
    for (const draft of round.matches) {
      const home = db.teams.find((team) => team.id === draft.homeTeamId);
      const away = db.teams.find((team) => team.id === draft.awayTeamId);
      db.matches.push({ id: id('demo-match'), matchday_id: matchday.id, home_team_id: draft.homeTeamId, away_team_id: draft.awayTeamId || null, scheduled_time: draft.scheduledTime || null, venue: draft.venue || null, status: draft.status || 'SCHEDULED', home_score: null, away_score: null, home_sets: null, away_sets: null, home_team: home, away_team: away || null, matchdays: matchday });
      insertedMatches += 1;
    }
  }
  saveDemoDatabase(db); return { success: true, insertedMatches, error: undefined };
}

export function scheduleDemoFixture(categoryId: string) {
  const db = loadDemoDatabase();
  const category = db.categories.find((item) => item.id === categoryId);
  const tournament = db.tournaments.find((item) => item.id === category?.tournament_id);
  const venues: string[] = tournament?.available_venues?.length ? tournament.available_venues : ['Cancha 1'];
  const times: string[] = tournament?.schedule_time_slots?.length ? tournament.schedule_time_slots : ['14:00'];
  const firstDate = tournament?.schedule_dates?.[0] || new Date().toISOString().slice(0, 10);
  const days = db.matchdays.filter((day) => day.category_id === categoryId).sort((a, b) => a.round_number - b.round_number);
  days.forEach((day, dayIndex) => {
    const date = new Date(`${firstDate}T12:00:00`); date.setDate(date.getDate() + dayIndex * 7); day.scheduled_date = date.toISOString().slice(0, 10);
    const playable = db.matches.filter((match) => match.matchday_id === day.id && match.status !== 'BYE');
    playable.forEach((match, index) => { match.venue = venues[index % venues.length]; match.scheduled_time = times[Math.floor(index / venues.length) % times.length]; match.matchdays = day; });
    db.matches.filter((match) => match.matchday_id === day.id && match.status === 'BYE').forEach((match) => { match.venue = 'Descansa'; match.matchdays = day; });
  });
  const updatedMatches = db.matches.filter((match) => days.some((day) => day.id === match.matchday_id)).length;
  saveDemoDatabase(db); return { success: true, updatedMatches, error: undefined };
}

export function deleteDemoFixture(categoryId: string) {
  const db = loadDemoDatabase(); const ids = db.matchdays.filter((day) => day.category_id === categoryId).map((day) => day.id);
  db.matches = db.matches.filter((match) => !ids.includes(match.matchday_id)); db.matchdays = db.matchdays.filter((day) => day.category_id !== categoryId); saveDemoDatabase(db);
  return { success: true, error: undefined };
}

export function updateDemoMatch(matchId: string, values: Record<string, unknown>) {
  const db = loadDemoDatabase(); const match = db.matches.find((item) => item.id === matchId); if (!match) return { success: false, error: 'Partido no encontrado' };
  Object.assign(match, { scheduled_time: values.scheduledTime, venue: values.venue, home_score: values.homeScore, away_score: values.awayScore, status: values.status });
  const day = db.matchdays.find((item) => item.id === match.matchday_id); if (day) { day.scheduled_date = values.scheduledDate; match.matchdays = day; }
  saveDemoDatabase(db); return { success: true, error: undefined };
}

export function addDemoPlayers(teamId: string, inputs: any[]) {
  const db = loadDemoDatabase(); const playerIds: string[] = [];
  inputs.forEach((input) => { const playerId = id('demo-player'); playerIds.push(playerId); db.players.push({ id: playerId, team_id: teamId, name: input.name, identity_number: input.identityNumber, shirt_number: input.shirtNumber, birth_year: input.birthYear, birth_date: input.birthDate, vinculo: input.vinculo, relationship_detail: input.relationshipDetail, player_documents: [] }); });
  saveDemoDatabase(db); return { success: true, data: { playerIds, inserted: inputs.length }, error: undefined };
}

export function updateDemoPlayer(playerId: string, input: any) {
  const db = loadDemoDatabase(); const player = db.players.find((item) => item.id === playerId); if (!player) return { success: false, error: 'Jugador no encontrado' };
  Object.assign(player, { name: input.name, identity_number: input.identityNumber, shirt_number: input.shirtNumber, birth_year: input.birthYear, birth_date: input.birthDate, vinculo: input.vinculo, relationship_detail: input.relationshipDetail }); saveDemoDatabase(db); return { success: true, error: undefined };
}

export function deleteDemoPlayer(playerId: string) { const db = loadDemoDatabase(); db.players = db.players.filter((item) => item.id !== playerId); db.player_documents = db.player_documents.filter((item) => item.player_id !== playerId); saveDemoDatabase(db); return { success: true, error: undefined }; }

export function saveDemoStaff(teamId: string, staff: Record<string, string>) { const db = loadDemoDatabase(); db.team_staff = db.team_staff.filter((item) => item.team_id !== teamId); Object.entries(staff).filter(([, name]) => name?.trim()).forEach(([role, full_name]) => db.team_staff.push({ id: id('demo-staff'), team_id: teamId, role, full_name })); saveDemoDatabase(db); return { success: true, error: undefined }; }

export function addDemoDocument(playerId: string, documentType: string, filename: string) { const db = loadDemoDatabase(); const record = { id: id('demo-document'), player_id: playerId, document_type: documentType, original_filename: filename, status: 'PENDING', updated_at: new Date().toISOString() }; db.player_documents.push(record); const player = db.players.find((item) => item.id === playerId); if (player) player.player_documents = [...(player.player_documents || []).filter((item: any) => item.document_type !== documentType), record]; saveDemoDatabase(db); return { success: true, data: record, error: undefined }; }

export function updateDemoTeamGroup(teamId: string, groupName: string) { const db = loadDemoDatabase(); const team = db.teams.find((item) => item.id === teamId); if (team) team.group_name = groupName; saveDemoDatabase(db); return { success: true, error: undefined }; }
export function randomizeDemoGroups(categoryId: string, count: number) { const db = loadDemoDatabase(); const assignments = db.teams.filter((team) => team.category_id === categoryId).map((team, index) => ({ teamId: team.id, groupName: String.fromCharCode(65 + (index % count)) })); assignments.forEach(({ teamId, groupName }) => { const team = db.teams.find((item) => item.id === teamId); if (team) team.group_name = groupName; }); saveDemoDatabase(db); return { success: true, assignments, error: undefined }; }
export function setDemoFixtureVisibility(categoryId: string, visible: boolean) { const db = loadDemoDatabase(); const category = db.categories.find((item) => item.id === categoryId); const tournament = db.tournaments.find((item) => item.id === category?.tournament_id); if (tournament) tournament.fixture_visible_to_delegates = visible; db.categories.filter((item) => item.tournament_id === tournament?.id).forEach((item) => { item.tournaments = tournament; }); saveDemoDatabase(db); return { success: true, error: undefined }; }
export function setDemoPublicFixtureVisibility(categoryId: string, visible: boolean) { const db = loadDemoDatabase(); const category = db.categories.find((item) => item.id === categoryId); const tournament = db.tournaments.find((item) => item.id === category?.tournament_id); if (tournament) tournament.fixture_visible_to_public = visible; db.categories.filter((item) => item.tournament_id === tournament?.id).forEach((item) => { item.tournaments = tournament; }); saveDemoDatabase(db); return { success: true, error: undefined }; }

export function getDemoFootballRoster(matchId: string) {
  const db = loadDemoDatabase(); const match = db.matches.find((item) => item.id === matchId);
  if (!match) throw new Error('Partido demo no encontrado.');
  const withDemoDocuments = (player: any, index: number) => ({ ...player, player_documents: player.player_documents?.length ? player.player_documents : index < 2 ? [{ document_type: 'FACE_PHOTO', status: 'APPROVED' }, { document_type: 'IDENTITY_FRONT', status: 'APPROVED' }] : [] });
  const home = db.players.filter((player) => player.team_id === match.home_team_id).map(withDemoDocuments);
  const away = db.players.filter((player) => player.team_id === match.away_team_id).map(withDemoDocuments);
  const suspendedPlayers: Record<string, string> = {};
  db.match_events.filter((event) => event.event_type === 'RED').forEach((event) => { suspendedPlayers[event.player_id] = event.fine_status === 'PAID' ? 'TARJETA ROJA' : 'ROJA · MULTA PENDIENTE'; });
  return { home, away, suspendedPlayers };
}

export function startDemoFootballMatch(matchId: string, lineups: Array<{ playerId: string; teamId: string; period: string }> = []) {
  const db = loadDemoDatabase(); const match = db.matches.find((item) => item.id === matchId); if (!match) throw new Error('Partido demo no encontrado.');
  Object.assign(match, { status: 'LIVE', current_period: '1T', is_timer_running: true, timer_start_time: new Date().toISOString(), timer_accumulated_seconds: 0, match_phase: 'REGULAR' });
  lineups.forEach((lineup) => { const player = db.players.find((item) => item.id === lineup.playerId); db.match_events.push({ id: id('demo-event'), match_id: matchId, team_id: lineup.teamId, player_id: lineup.playerId, event_type: 'STARTING_LINEUP', period: lineup.period, created_at: new Date().toISOString(), players: player ? { name: player.name, shirt_number: player.shirt_number, teams: player.teams } : null, matches: match }); });
  saveDemoDatabase(db); return { success: true };
}

export function recordDemoFootballEvent(input: any) {
  const db = loadDemoDatabase(); const match = db.matches.find((item) => item.id === input.matchId); if (!match) throw new Error('Partido demo no encontrado.');
  const player = db.players.find((item) => item.id === input.playerId); const team = db.teams.find((item) => item.id === input.teamId); const tournamentRow = db.tournaments.find((item) => item.id === team?.categories?.tournament_id) || db.tournaments[0];
  const eventType = input.eventType; const isCard = eventType === 'YELLOW' || eventType === 'RED';
  db.match_events.push({ id: id('demo-event'), match_id: input.matchId, team_id: input.teamId, player_id: input.playerId || null, event_type: eventType, period: input.period, minute_record: input.minuteRecord ? `${input.minuteRecord}'` : null, match_second: input.matchSecond, fine_status: isCard ? 'UNPAID' : 'NONE', fine_amount: eventType === 'RED' ? tournamentRow?.fine_red_amount || 0 : eventType === 'YELLOW' ? tournamentRow?.fine_yellow_amount || 0 : 0, created_at: new Date().toISOString(), players: player ? { name: player.name, shirt_number: player.shirt_number, teams: team } : null, teams: team, matches: match });
  if (eventType === 'GOAL' || eventType === 'SCORE_ADJUST') { const field = input.teamId === match.home_team_id ? 'home_score' : 'away_score'; match[field] = Math.max(0, Number(match[field] || 0) + Number(input.scoreDelta || 0)); }
  saveDemoDatabase(db); return { success: true, home_score: match.home_score || 0, away_score: match.away_score || 0 };
}

/** Removes the most recent goal for a team in the demo store and keeps the demo scoreboard in sync. */
export function revertDemoLastFootballGoal(matchId: string, teamId: string, playerId?: string | null, updateMatchScore = true) {
  const db = loadDemoDatabase();
  const match = db.matches.find((item) => item.id === matchId);
  if (!match) throw new Error('Partido demo no encontrado.');
  const candidates = db.match_events
    .filter((event: any) => event.match_id === matchId && event.team_id === teamId && event.event_type === 'GOAL')
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  const event = playerId ? candidates.find((item: any) => item.player_id === playerId) : candidates[0];
  if (!event) return { success: false, error: 'No se encontró un gol para revertir.' };
  db.match_events = db.match_events.filter((item: any) => item.id !== event.id);
  const field = teamId === match.home_team_id ? 'home_score' : 'away_score';
  if (updateMatchScore) match[field] = Math.max(0, Number(match[field] || 0) - 1);
  saveDemoDatabase(db);
  return { success: true, home_score: match.home_score || 0, away_score: match.away_score || 0 };
}

export function changeDemoMatchPeriod(matchId: string, period: string) { const db = loadDemoDatabase(); const match = db.matches.find((item) => item.id === matchId); if (match) match.current_period = period; saveDemoDatabase(db); return { success: true }; }
export function finishDemoFootballMatch(matchId: string, homeScore: number, awayScore: number, currentPeriod: string) { const db = loadDemoDatabase(); const match = db.matches.find((item) => item.id === matchId); if (match) Object.assign(match, { status: 'FINISHED', home_score: homeScore, away_score: awayScore, current_period: currentPeriod, is_timer_running: false, timer_start_time: null, match_phase: 'FINISHED' }); saveDemoDatabase(db); return { success: true }; }
export function applyDemoWalkover(matchId: string, absentTeamId: string) { const db = loadDemoDatabase(); const match = db.matches.find((item) => item.id === matchId); if (match) Object.assign(match, { status: 'FINISHED', home_score: absentTeamId === match.home_team_id ? 0 : 3, away_score: absentTeamId === match.away_team_id ? 0 : 3, is_timer_running: false }); saveDemoDatabase(db); return { success: true }; }
