import { describe, expect, it } from 'vitest';
import { nextDate, normalizeAsOfDate } from '../app/lib/date-filter';

describe('historical date filter', () => {
  it('accepts only canonical calendar dates', () => {
    expect(normalizeAsOfDate('2026-09-05')).toBe('2026-09-05');
    expect(normalizeAsOfDate('05/09/2026')).toBeNull();
    expect(normalizeAsOfDate('2026-02-30')).toBeNull();
  });

  it('moves the cutoff to the following calendar date for timestamps', () => {
    expect(nextDate('2026-09-05')).toBe('2026-09-06');
  });
});
