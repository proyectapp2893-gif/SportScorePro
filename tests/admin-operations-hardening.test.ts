import { describe, expect, it } from 'vitest';
import { combineMetrics, metricFromCount } from '../app/[slug]/admin/operations/query-results';
import { resolveTournamentSelection, tournamentStorageKey } from '../app/[slug]/admin/operations/tournament-selection';
import { adminCategoryModulePath } from '../app/[slug]/admin/operations/routes';

describe('admin operations hardening', () => {
  it('diferencia cero válido de una consulta fallida', () => {
    expect(metricFromCount({ count: 0, error: null }, 'equipos')).toEqual({ value: 0, error: null });
    expect(metricFromCount({ count: null, error: { message: 'timeout' } }, 'equipos')).toEqual({ value: null, error: 'No fue posible cargar equipos.' });
    expect(combineMetrics([{ value: 0, error: null }, { value: null, error: 'falló' }], 'documentos')).toEqual({ value: null, error: 'No fue posible cargar documentos.' });
  });

  it('prioriza query válida, luego selección persistida válida y finalmente activo', () => {
    const tournaments = [{ id: 'a', isActive: false }, { id: 'b', isActive: true }];
    expect(resolveTournamentSelection(tournaments, 'b', 'a')).toBe('b');
    expect(resolveTournamentSelection(tournaments, 'foreign', 'a')).toBe('a');
    expect(resolveTournamentSelection(tournaments, 'foreign', 'foreign')).toBe('b');
    expect(resolveTournamentSelection([{ id: 'only' }], 'foreign', 'foreign')).toBe('only');
  });

  it('aisla la clave local por institución y codifica rutas', () => {
    expect(tournamentStorageKey('tenant-a')).not.toBe(tournamentStorageKey('tenant-b'));
    expect(adminCategoryModulePath('tenant a', 'grupos', 'torneo/1', 'cat 1')).toBe('/tenant a/admin/grupos?cat=cat%201&tournament=torneo%2F1');
  });
});
