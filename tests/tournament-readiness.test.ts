import { describe, expect, it } from 'vitest';
import { calculateTournamentReadiness } from '../app/[slug]/admin/operations/readiness';
import type { ReadinessCheck } from '../app/[slug]/admin/operations/types';

const check = (status: ReadinessCheck['status'], weight: number): ReadinessCheck => ({
  id: `${status}-${weight}`,
  label: 'Criterio verificable',
  detail: 'Detalle',
  status,
  weight,
  href: '/admin',
});

describe('Tournament Health Check', () => {
  it('returns 100 when every weighted criterion is complete', () => {
    expect(calculateTournamentReadiness([check('complete', 20), check('complete', 80)])).toBe(100);
  });

  it('awards half weight to warnings and no weight to incomplete checks', () => {
    expect(calculateTournamentReadiness([check('complete', 50), check('warning', 30), check('incomplete', 20)])).toBe(65);
  });

  it('handles an empty definition safely', () => {
    expect(calculateTournamentReadiness([])).toBe(0);
  });
});
