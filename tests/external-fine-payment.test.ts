/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), db: vi.fn(), audit: vi.fn() }));
vi.mock('@/app/lib/auth', () => ({ hasAdminSession: mocks.admin }));
vi.mock('@/app/lib/tenant', () => ({ getClientIdBySlug: mocks.client }));
vi.mock('@/app/lib/supabase/server', () => ({ createPrivilegedSupabaseClient: mocks.db }));
vi.mock('@/app/lib/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { markFinesPaidExternally } from '../app/[slug]/admin/tribunal/actions';

function database({ playerExists = true, activeProofs = [] as any[] } = {}) {
  const queries: { table: string; filters: [string, unknown][]; payload?: any }[] = [];
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: [{ updated_events: 1, applied_amount: 25000 }], error: null });
  const results: Record<string, any> = {
    teams: { data: { id: 'team', name: 'Águilas' }, error: null },
    players: { data: playerExists ? { id: 'player', name: 'Ana' } : null, error: null },
    matches: { data: [{ id: 'match' }], error: null },
    match_events: { data: [{ id: 'fine' }], error: null },
    fine_payment_proofs: { data: activeProofs, error: null },
  };
  const from = vi.fn((table: string) => {
    const record: { table: string; filters: [string, unknown][]; payload?: any } = { table, filters: [] };
    queries.push(record);
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string, value: unknown) => { record.filters.push([column, value]); return query; });
    query.in = vi.fn((column: string, value: unknown) => { record.filters.push([column, value]); return query; });
    query.insert = vi.fn((payload: any) => { record.payload = payload; return query; });
    query.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(results[table]));
    query.single = vi.fn().mockResolvedValue({ data: { id: 'proof' }, error: null });
    query.then = (resolve: (value: unknown) => void) => Promise.resolve(results[table]).then(resolve);
    return query;
  });
  mocks.db.mockReturnValue({ from, rpc, storage: { from: vi.fn(() => ({ upload, remove })) } });
  return { queries, rpc, upload };
}

const file = { name: 'pago.pdf', type: 'application/pdf', size: 100 } as File;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(true);
  mocks.client.mockResolvedValue('client');
  mocks.audit.mockResolvedValue(undefined);
});

describe('external fine payments', () => {
  it('covers only the selected player and records an individual proof', async () => {
    const { queries, rpc } = database();
    const result = await markFinesPaidExternally('club', 'tournament', 'team', 'player', 'Pago verificado', file);
    expect(result.success).toBe(true);
    expect(queries.find(query => query.table === 'players')?.filters).toContainEqual(['team_id', 'team']);
    expect(queries.find(query => query.table === 'match_events')?.filters).toContainEqual(['player_id', 'player']);
    expect(queries.find(query => query.table === 'fine_payment_proofs' && query.payload)?.payload).toMatchObject({ player_id: 'player', proof_scope: 'PLAYER', payment_source: 'EXTERNAL' });
    expect(rpc).toHaveBeenCalledWith('sportscore_approve_fine_payment_proof', expect.objectContaining({ p_event_ids: ['fine'] }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'player', targetId: 'player' }));
  });

  it('keeps the whole-team option and proof scope', async () => {
    const { queries } = database();
    expect((await markFinesPaidExternally('club', 'tournament', 'team', null, 'Pago verificado', file)).success).toBe(true);
    expect(queries.find(query => query.table === 'match_events')?.filters).not.toContainEqual(['player_id', 'player']);
    expect(queries.find(query => query.table === 'fine_payment_proofs' && query.payload)?.payload).toMatchObject({ player_id: null, proof_scope: 'TEAM' });
  });

  it('rejects a player outside the team before uploading', async () => {
    const { upload } = database({ playerExists: false });
    expect((await markFinesPaidExternally('club', 'tournament', 'team', 'other', 'Pago verificado', file)).success).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('allows a different pending player proof but rejects one covering this player', async () => {
    const allowed = database({ activeProofs: [{ proof_scope: 'PLAYER', player_id: 'other' }] });
    expect((await markFinesPaidExternally('club', 'tournament', 'team', 'player', 'Pago verificado', file)).success).toBe(true);
    expect(allowed.upload).toHaveBeenCalled();
    const blocked = database({ activeProofs: [{ proof_scope: 'TEAM', player_id: null }] });
    expect((await markFinesPaidExternally('club', 'tournament', 'team', 'player', 'Pago verificado', file)).success).toBe(false);
    expect(blocked.upload).not.toHaveBeenCalled();
  });
});
