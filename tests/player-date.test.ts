import { describe, expect, it } from 'vitest';
import { normalizePlayerBirthDate } from '../app/lib/players/date';

describe('normalizePlayerBirthDate', () => {
  it('accepts compact DDMMYYYY input from Excel', () => expect(normalizePlayerBirthDate('28031993')).toBe('1993-03-28'));
  it('accepts separated and ISO dates', () => {
    expect(normalizePlayerBirthDate('28/03/1993')).toBe('1993-03-28');
    expect(normalizePlayerBirthDate('1993-03-28')).toBe('1993-03-28');
  });
  it('accepts Excel serial dates', () => expect(normalizePlayerBirthDate(34056)).toBe('1993-03-28'));
  it('rejects impossible dates', () => expect(normalizePlayerBirthDate('31021993')).toBe(''));
});
