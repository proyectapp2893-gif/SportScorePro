import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260827000100_harden_public_competition_access.sql', 'utf8');
const publicationMigration = readFileSync('supabase/migrations/20260827000200_public_fixture_visibility.sql', 'utf8');

describe('public competition access migration', () => {
  it('revoca la lectura completa y concede solo columnas deportivas de jugadores', () => {
    expect(migration).toContain('revoke select on table public.players from anon, authenticated');
    expect(migration).toContain('grant select (id, name, shirt_number, team_id)');
    expect(migration).not.toContain('identity_number');
    expect(migration).not.toContain('storage_path');
  });

  it('excluye campos financieros de eventos y exige fixture publicado', () => {
    expect(migration).toContain('revoke select on table public.match_events from anon, authenticated');
    expect(migration).toContain('grant select (id, match_id, team_id, player_id, event_type, period, minute_record, created_at)');
    expect(migration).not.toContain('fine_amount');
    expect(migration).not.toContain('fine_status');
    expect(migration).toContain('tr.fixture_visible_to_delegates = true');
    expect(publicationMigration).toContain('tr.fixture_visible_to_public = true');
    expect(migration).toContain("'SUB_IN', 'SUB_OUT', 'FOUL'");
  });
});
