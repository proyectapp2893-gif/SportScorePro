import type { ReadinessCheck } from './types';

/**
 * Readiness is the weighted completion of verifiable operational checks.
 * Complete contributes 100% of its weight, warning 50%, and incomplete 0%.
 * Keeping the calculation here prevents UI components from inventing scores.
 */
export function calculateTournamentReadiness(checks: ReadinessCheck[]) {
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  if (!totalWeight) return 0;
  const achieved = checks.reduce((sum, check) => {
    const factor = check.status === 'complete' ? 1 : check.status === 'warning' ? 0.5 : 0;
    return sum + check.weight * factor;
  }, 0);
  return Math.round((achieved / totalWeight) * 100);
}

