/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), db: vi.fn() }));
vi.mock('@/app/lib/auth', () => ({ hasAdminSession: mocks.admin }));
vi.mock('@/app/lib/tenant', () => ({ getClientIdBySlug: mocks.client }));
vi.mock('@/app/lib/supabase/server', () => ({ createPrivilegedSupabaseClient: mocks.db }));
vi.mock('@/app/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { getPendingFineEventsForProof } from '../app/[slug]/admin/tribunal/actions';

function database(proof: any) {
  const queries: Record<string, any>[] = [];
  mocks.db.mockReturnValue({ from: vi.fn((table: string) => {
    const query: Record<string, any> = { table, filters: [] };
    for (const method of ['select', 'eq', 'in', 'order']) query[method] = vi.fn((...args: any[]) => {
      if (method === 'eq' || method === 'in') query.filters.push(args);
      return query;
    });
    query.maybeSingle = vi.fn().mockResolvedValue({ data: proof, error: null });
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: [{ id: 'fine' }], error: null }).then(resolve);
    queries.push(query);
    return query;
  }) });
  return queries;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(true);
  mocks.client.mockResolvedValue('client');
});

describe('pending proof review', () => {
  it('loads a player proof independently of visible Tribunal filters', async () => {
    const queries = database({ team_id: 'team', player_id: 'player', proof_scope: 'PLAYER' });
    expect((await getPendingFineEventsForProof('club', 'tournament', 'proof')).success).toBe(true);
    expect(queries[0].filters).toContainEqual(['teams.categories.tournaments.client_id', 'client']);
    expect(queries[0].filters).toContainEqual(['status', 'PENDING']);
    expect(queries[1].filters).toContainEqual(['team_id', 'team']);
    expect(queries[1].filters).toContainEqual(['player_id', 'player']);
    expect(queries[1].filters).toContainEqual(['matches.matchdays.categories.tournament_id', 'tournament']);
  });

  it('loads every unpaid fine for a team proof', async () => {
    const queries = database({ team_id: 'team', player_id: null, proof_scope: 'TEAM' });
    expect((await getPendingFineEventsForProof('club', 'tournament', 'proof')).success).toBe(true);
    expect(queries[1].filters).not.toContainEqual(['player_id', 'player']);
  });

  it('cannot load another tenant’s or missing proof', async () => {
    const queries = database(null);
    expect((await getPendingFineEventsForProof('club', 'tournament', 'foreign')).success).toBe(false);
    expect(queries).toHaveLength(1);
  });
});
