import approvedSchedule from './loyola-2026-groups.json';

type Team = { id: string; name: string; group_name: string | null };

export function buildLoyolaGroupFixture(teams: Team[]) {
  const groupA = teams.filter((team) => team.group_name === 'A');
  const groupB = teams.filter((team) => team.group_name === 'B');
  if (groupA.length !== 4 || groupB.length !== 4) throw new Error('Se requieren cuatro equipos en cada grupo.');
  const byName = new Map([...groupA, ...groupB].map((team) => [team.name, team]));
  if (byName.size !== 8) throw new Error('Los nombres de los equipos clasificados deben ser únicos.');
  const directedPairs = new Set<string>();
  const expectedPairs = new Set<string>();
  for (const group of [groupA, groupB]) {
    for (const home of group) for (const away of group) {
      if (home.id !== away.id) expectedPairs.add(`${home.id}:${away.id}`);
    }
  }
  if (approvedSchedule.length !== 6) throw new Error('El calendario aprobado debe tener seis jornadas.');
  const rounds = approvedSchedule.map((round, index) => {
    if (round.round !== 101 + index || !/^\d{4}-\d{2}-\d{2}$/.test(round.date) || round.matches.length !== 4) {
      throw new Error('El calendario aprobado tiene una jornada inválida.');
    }
    const participants = new Set<string>();
    const slots = new Set<string>();
    const matches = round.matches.map((match) => {
      const home = byName.get(match.home);
      const away = byName.get(match.away);
      if (!home || !away || home.group_name !== match.group || away.group_name !== match.group || home.id === away.id) {
        throw new Error(`El cruce ${match.home} vs ${match.away} no corresponde al grupo ${match.group}.`);
      }
      if (participants.has(home.id) || participants.has(away.id)) throw new Error(`Un equipo aparece dos veces en la jornada ${index + 1}.`);
      participants.add(home.id); participants.add(away.id);
      const pair = `${home.id}:${away.id}`;
      if (directedPairs.has(pair)) throw new Error(`El cruce ${match.home} vs ${match.away} está repetido.`);
      directedPairs.add(pair);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(match.time) || !['Cancha 1', 'Cancha 2'].includes(match.venue)) {
        throw new Error(`Horario o cancha inválidos en la jornada ${index + 1}.`);
      }
      const slot = `${match.time}:${match.venue}`;
      if (slots.has(slot)) throw new Error(`La cancha ${match.venue} está ocupada dos veces a las ${match.time}.`);
      slots.add(slot);
      return { homeTeamId: home.id, awayTeamId: away.id, groupName: match.group, scheduledTime: `${match.time}:00`, venue: match.venue };
    });
    if (participants.size !== 8) throw new Error(`La jornada ${index + 1} no incluye a los ocho clasificados.`);
    return { roundNumber: round.round, scheduledDate: round.date, matches };
  });
  if (directedPairs.size !== expectedPairs.size || [...expectedPairs].some((pair) => !directedPairs.has(pair))) {
    throw new Error('Cada equipo debe enfrentar a sus tres rivales de grupo como local y visitante.');
  }
  return rounds;
}
