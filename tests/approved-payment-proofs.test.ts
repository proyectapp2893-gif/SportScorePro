import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), db: vi.fn() }));
vi.mock('@/app/lib/auth', () => ({ hasAdminSession: mocks.admin }));
vi.mock('@/app/lib/tenant', () => ({ getClientIdBySlug: mocks.client }));
vi.mock('@/app/lib/supabase/server', () => ({ createPrivilegedSupabaseClient: mocks.db }));
vi.mock('@/app/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { getApprovedFinePaymentProofs, getFinePaymentProofUrl } from '../app/[slug]/admin/tribunal/actions';

function database(result: unknown) {
  const query: Record<string, any> = {};
  for (const method of ['select', 'eq', 'order', 'range']) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
  const signed = vi.fn().mockResolvedValue({ data: { signedUrl: 'private-url' }, error: null });
  mocks.db.mockReturnValue({ from: vi.fn(() => query), storage: { from: vi.fn(() => ({ createSignedUrl: signed })) } });
  return { query, signed };
}
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue(true); mocks.client.mockResolvedValue('tenant-id'); });

describe('approved receipt history', () => {
  it('requires an admin session for both history and files', async () => {
    mocks.admin.mockResolvedValue(false);
    expect((await getApprovedFinePaymentProofs('tenant', 'tournament')).success).toBe(false);
    expect((await getFinePaymentProofUrl('tenant', 'proof')).success).toBe(false);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('scopes approved history to the tenant and tournament, with stable pagination', async () => {
    const { query } = database({ data: Array.from({ length: 21 }, (_, id) => ({ id })), error: null });
    const result = await getApprovedFinePaymentProofs('tenant', 'tournament', 2);
    expect(query.eq).toHaveBeenCalledWith('status', 'APPROVED');
    expect(query.eq).toHaveBeenCalledWith('match_events.matches.matchdays.categories.tournaments.client_id', 'tenant-id');
    expect(query.eq).toHaveBeenCalledWith('match_events.matches.matchdays.categories.tournaments.id', 'tournament');
    expect(query.range).toHaveBeenCalledWith(40, 60);
    expect(result.success && result.hasMore).toBe(true);
    expect(result.success && result.data).toHaveLength(20);
  });
  it('returns an empty history without another page', async () => {
    database({ data: [], error: null });
    expect(await getApprovedFinePaymentProofs('tenant', 'tournament')).toEqual({ success: true, data: [], hasMore: false });
  });
  it('reports query errors rather than presenting an empty history', async () => {
    database({ data: null, error: { message: 'unavailable' } });
    expect((await getApprovedFinePaymentProofs('tenant', 'tournament')).success).toBe(false);
  });
  it('does not sign a missing or foreign receipt', async () => {
    const { query, signed } = database({ data: null, error: null });
    expect((await getFinePaymentProofUrl('tenant', 'foreign-proof')).success).toBe(false);
    expect(query.eq).toHaveBeenCalledWith('match_events.matches.matchdays.categories.tournaments.client_id', 'tenant-id');
    expect(signed).not.toHaveBeenCalled();
  });
  it('signs only the storage path retrieved from the authorized receipt', async () => {
    const { signed } = database({ data: { storage_path: 'tenant/receipt.pdf' }, error: null });
    expect((await getFinePaymentProofUrl('tenant', 'proof-id')).success).toBe(true);
    expect(signed).toHaveBeenCalledWith('tenant/receipt.pdf', 300);
  });
});
