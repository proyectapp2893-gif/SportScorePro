export type FormationFocus = 'BALANCED' | 'OFFENSIVE' | 'DEFENSIVE' | 'POSSESSION' | 'HIGH_PRESS';

/** Modalidades de juego que definen la cantidad de titulares y la experiencia táctica. */
export type SportModality = 'STANDARD' | 'SOCCER_5' | 'SOCCER_7' | 'SOCCER_9' | 'SOCCER_11' | 'FUTSAL_5';

export const SPORT_MODALITY_OPTIONS: Array<{ value: SportModality; label: string; description: string }> = [
  { value: 'STANDARD', label: 'Según configuración', description: 'No fija una cantidad de jugadores titulares.' },
  { value: 'SOCCER_5', label: 'Fútbol 5', description: '4 jugadores de campo + 1 portero.' },
  { value: 'SOCCER_7', label: 'Fútbol 7', description: '6 jugadores de campo + 1 portero.' },
  { value: 'SOCCER_9', label: 'Fútbol 9', description: '8 jugadores de campo + 1 portero.' },
  { value: 'SOCCER_11', label: 'Fútbol 11', description: '10 jugadores de campo + 1 portero.' },
  { value: 'FUTSAL_5', label: 'Futsal', description: '4 jugadores de campo + 1 portero.' },
];

export const isFootball9Modality = (value: unknown): boolean => value === 'SOCCER_9';

export type FormationPosition = {
  id: string;
  role: string;
  label: string;
  abbreviation: string;
  x: number;
  y: number;
  line: string;
  order: number;
};

export type FormationTemplate = {
  id: string;
  code: string;
  name: string;
  description: string;
  focus: FormationFocus;
  recommended?: boolean;
  players: FormationPosition[];
};

const position = (id: string, role: string, abbreviation: string, x: number, y: number, line: string, order: number): FormationPosition => ({ id, role, label: role, abbreviation, x, y, line, order });
const line = (prefix: string, role: string, abbreviation: string, xs: number[], y: number) => xs.map((x, index) => position(`${prefix}-${index + 1}`, role, abbreviation, x, y, prefix, index + 1));

export const FOOTBALL9_FORMATIONS: FormationTemplate[] = [
  { id: 'football9-332', code: '3-3-2', name: 'Equilibrada', description: 'Tres defensas, tres mediocampistas y dos delanteros.', focus: 'BALANCED', recommended: true, players: [position('gk', 'Portero', 'POR', 50, 91, 'GK', 1), ...line('DEF', 'Defensa', 'DFC', [22, 50, 78], 72), ...line('MID', 'Mediocampista', 'MC', [22, 50, 78], 51), ...line('FWD', 'Delantero', 'DEL', [35, 65], 25)] },
  { id: 'football9-323', code: '3-2-3', name: 'Ofensiva', description: 'Tres defensas, dos mediocampistas y tres atacantes.', focus: 'OFFENSIVE', players: [position('gk', 'Portero', 'POR', 50, 91, 'GK', 1), ...line('DEF', 'Defensa', 'DFC', [22, 50, 78], 72), ...line('MID', 'Mediocampista', 'MC', [34, 66], 50), ...line('FWD', 'Atacante', 'ATQ', [20, 50, 80], 23)] },
  { id: 'football9-233', code: '2-3-3', name: 'Presión / Ataque', description: 'Dos defensas, tres mediocampistas y tres atacantes.', focus: 'HIGH_PRESS', players: [position('gk', 'Portero', 'POR', 50, 91, 'GK', 1), ...line('DEF', 'Defensa', 'DFC', [32, 68], 72), ...line('MID', 'Mediocampista', 'MC', [22, 50, 78], 50), ...line('FWD', 'Atacante', 'ATQ', [20, 50, 80], 23)] },
  { id: 'football9-242', code: '2-4-2', name: 'Control del mediocampo', description: 'Dos defensas, cuatro mediocampistas y dos delanteros.', focus: 'POSSESSION', players: [position('gk', 'Portero', 'POR', 50, 91, 'GK', 1), ...line('DEF', 'Defensa', 'DFC', [32, 68], 72), ...line('MID', 'Mediocampista', 'MC', [15, 38, 62, 85], 48), ...line('FWD', 'Delantero', 'DEL', [35, 65], 23)] },
  { id: 'football9-431', code: '4-3-1', name: 'Defensiva', description: 'Cuatro defensas, tres mediocampistas y un delantero.', focus: 'DEFENSIVE', players: [position('gk', 'Portero', 'POR', 50, 91, 'GK', 1), ...line('DEF', 'Defensa', 'DFC', [12, 37, 63, 88], 72), ...line('MID', 'Mediocampista', 'MC', [22, 50, 78], 49), position('fwd-1', 'Delantero', 'DEL', 50, 22, 'FWD', 1)] },
  { id: 'football9-341', code: '3-4-1', name: 'Posesión / Control', description: 'Tres defensas, cuatro mediocampistas y un delantero.', focus: 'POSSESSION', players: [position('gk', 'Portero', 'POR', 50, 91, 'GK', 1), ...line('DEF', 'Defensa', 'DFC', [22, 50, 78], 72), ...line('MID', 'Mediocampista', 'MC', [15, 38, 62, 85], 48), position('fwd-1', 'Delantero', 'DEL', 50, 22, 'FWD', 1)] },
];

export const getFootball9Formation = (code: string) => FOOTBALL9_FORMATIONS.find((formation) => formation.code === code) || FOOTBALL9_FORMATIONS[0];
