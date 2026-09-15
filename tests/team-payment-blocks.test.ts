import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { loadTeamDisciplinaryBlocks } from '../app/lib/discipline/team-blocks';

function database(events: unknown[], sanctions: unknown[] = [], error: unknown = null) {
  const results = [{ data: { category_id: 'category', categories: { tournament_id: 'tournament' } } }, { data: events, error }, { data: { bulletin_number: 6, snapshot: { categories: [{ id: 'category', sanctions }] } } }];
  const queries: Record<string, any>[] = [];
  return { queries, from: vi.fn(() => {
    const result = results.shift();
    const q: Record<string, any> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) q[method] = vi.fn(() => q);
    q.single = q.maybeSingle = vi.fn().mockResolvedValue(result);
    q.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    queries.push(q); return q;
  }) };
}

describe('live team payment eligibility', () => {
  it('enables all three Sporting players after the consolidated payment', async () => {
    const db = database(['alexander', 'juan', 'joel'].map(id => ({ id, player_id: id, team_id: 'sporting', match_id: 'match', event_type: 'YELLOW', fine_status: 'PAID' })));
    expect(await loadTeamDisciplinaryBlocks(db, 'sporting')).toEqual({});
    expect(db.queries[1].eq).toHaveBeenCalledWith('team_id', 'sporting');
    expect(db.queries[1].eq).toHaveBeenCalledWith('matches.matchdays.category_id', 'category');
    expect(db.queries[2].eq).toHaveBeenCalledWith('tournament_id', 'tournament');
  });
  it('keeps a new unpaid fine blocking while paid teammates are available', async () => {
    const db = database([{ id: 'paid', player_id: 'one', event_type: 'YELLOW', fine_status: 'PAID' }, { id: 'new', player_id: 'two', event_type: 'YELLOW', fine_status: 'UNPAID' }]);
    expect(await loadTeamDisciplinaryBlocks(db, 'team')).toEqual({ two: 'Multa pendiente de pago.' });
  });
  it('releases a paid red after its suspension expires but preserves active suspensions', async () => {
    const db = database([{ id: 'expired', player_id: 'one', event_type: 'RED', fine_status: 'PAID', suspension_matches: 5 }, { id: 'active', player_id: 'two', event_type: 'RED', fine_status: 'PAID', suspension_matches: 5 }], [{ id: 'expired', originalMatches: 5, startBulletinNumber: 1 }, { id: 'active', originalMatches: 5, startBulletinNumber: 5 }]);
    expect(await loadTeamDisciplinaryBlocks(db, 'team')).toEqual({ two: 'Suspensión activa: 4 fecha(s) pendiente(s).' });
  });
  it('does not silently enable players when the disciplinary query fails', async () => {
    await expect(loadTeamDisciplinaryBlocks(database([], [], { message: 'unavailable' }), 'team')).rejects.toThrow('habilitación');
  });
});
