import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), belongs: vi.fn(), db: vi.fn(), audit: vi.fn() }));
vi.mock('@/app/lib/auth', () => ({ hasAdminSession: mocks.admin }));
vi.mock('@/app/lib/tenant', () => ({ teamBelongsToClientSlug: mocks.belongs, getClientIdBySlug: vi.fn().mockResolvedValue('client'), categoryBelongsToClientSlug: vi.fn() }));
vi.mock('@/app/lib/supabase/server', () => ({ createServerSupabaseAdminClient: mocks.db }));
vi.mock('@/app/lib/audit', () => ({ logAuditEvent: mocks.audit }));
import { updateRosterPlayer, uploadRosterPlayerDocument } from '../app/[slug]/admin/inscripcion/actions';

function database(results: unknown[]) {
  const query: Record<string, any> = {};
  for (const method of ['select', 'eq', 'neq', 'limit', 'update', 'upsert']) query[method] = vi.fn(() => query);
  query.single = query.maybeSingle = vi.fn(async () => results.shift());
  query.then = (resolve: (result: unknown) => void) => Promise.resolve(results.shift()).then(resolve);
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) };
  const db = { from: vi.fn(() => query), storage: { from: vi.fn(() => storage) } };
  mocks.db.mockReturnValue(db);
  return { query, storage, db };
}
const player = { data: { id: 'player', team_id: 'team' }, error: null };
const team = { data: { categories: { tournament_id: 'tournament', tournaments: {} } }, error: null };
const file = () => new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });

beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue(true); mocks.belongs.mockResolvedValue(true); });

describe('admin player editing permissions and files', () => {
  it('rejects both mutations without an admin session before accessing data', async () => {
    mocks.admin.mockResolvedValue(false);
    expect((await updateRosterPlayer('tenant', 'player', { name: 'Name' })).success).toBe(false);
    expect((await uploadRosterPlayerDocument('tenant', 'player', 'FACE_PHOTO', file())).success).toBe(false);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects a player from another tenant for both mutations', async () => {
    const { query, storage } = database([player, player]); mocks.belongs.mockResolvedValue(false);
    expect((await updateRosterPlayer('tenant', 'player', { name: 'Name' })).success).toBe(false);
    expect((await uploadRosterPlayerDocument('tenant', 'player', 'FACE_PHOTO', file())).success).toBe(false);
    expect(query.update).not.toHaveBeenCalled(); expect(storage.upload).not.toHaveBeenCalled();
  });
  it('updates all registration fields and derives birth year from the date', async () => {
    const { query } = database([player, team, { data: [] }, { data: [] }, { data: { id: 'player' } }]);
    const result = await updateRosterPlayer('tenant', 'player', { name: 'New name', identityNumber: '123456', shirtNumber: 10, birthDate: '1980-01-02', birthYear: 1990, vinculo: 'Ex-alumno', relationshipDetail: '1998' });
    expect(result.success).toBe(true);
    expect(query.update).toHaveBeenCalledWith({ name: 'NEW NAME', identity_number: '123456', shirt_number: 10, birth_date: '1980-01-02', birth_year: 1980, vinculo: 'EX-ALUMNO', relationship_detail: '1998' });
  });
  it('rejects duplicate identity before modifying the player', async () => {
    const { query } = database([player, team, { data: [{ id: 'other' }] }]);
    expect((await updateRosterPlayer('tenant', 'player', { name: 'Name', identityNumber: '123456' })).success).toBe(false);
    expect(query.update).not.toHaveBeenCalled();
  });
  it('rejects PDF photos, empty files and invalid document types', async () => {
    const { storage } = database([player, player, player]);
    for (const [type, value] of [['FACE_PHOTO', new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })], ['IDENTITY_FRONT', new File([], 'empty.jpg', { type: 'image/jpeg' })], ['OTHER', file()]] as const) {
      expect((await uploadRosterPlayerDocument('tenant', 'player', type, value)).success).toBe(false);
    }
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('retains the old file and removes the new upload if saving metadata fails', async () => {
    const { storage } = database([player, { data: { storage_path: 'old-file' } }, { error: { message: 'failed' } }]);
    expect((await uploadRosterPlayerDocument('tenant', 'player', 'FACE_PHOTO', file())).success).toBe(false);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove.mock.calls[0][0]).not.toContain('old-file');
  });
  it('replaces the file and clears the previous review only after metadata saves', async () => {
    const { query, storage } = database([player, { data: { storage_path: 'old-file' } }, { error: null }]);
    expect((await uploadRosterPlayerDocument('tenant', 'player', 'FACE_PHOTO', file())).success).toBe(true);
    expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING', reviewed_at: null, rejection_reason: null, uploaded_by_delegate_id: null }), { onConflict: 'player_id,document_type' });
    expect(storage.remove).toHaveBeenCalledWith(['old-file']);
  });
});
