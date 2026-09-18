import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { getNextUnpublishedRound, stampSuspensionOrigins, hydrateDynamicBulletinFields, type BulletinSnapshot } from '../app/lib/tournaments/bulletin';

describe('automatic bulletin numbering', () => {
  it('returns the first completed round that has not been published', () => {
    expect(getNextUnpublishedRound([1, 2, 3], [1])).toBe(2);
    expect(getNextUnpublishedRound([1, 2, 3], [1, 2])).toBe(3);
    expect(getNextUnpublishedRound([1, 3], [1])).toBe(3);
    expect(getNextUnpublishedRound([1, 2], [1, 2])).toBeNull();
  });
});

describe('published bulletin discipline', () => {
  it('removes superseded cards by event ID even after the live round advances', () => {
    const category = {
      id: 'category', name: 'Football', sport: 'Football', fairPlayEnabled: false,
      round: 1, results: [], standings: [], scorers: [], sanctions: [],
      cards: [{ id: 'yellow', card: 'Amarilla' }, { id: 'red', card: 'Roja' }, { id: 'other-match-yellow', card: 'Amarilla' }],
      debts: [{ team: 'LA BANDA', amount: 75000 }],
    };
    const snapshot: BulletinSnapshot = { categories: [category] };
    const live: BulletinSnapshot = { categories: [{ ...category, round: 2, cards: [], supersededCardIds: ['yellow'], debts: [{ team: 'LA BANDA', amount: 50000 }] }] };
    const hydrated = hydrateDynamicBulletinFields(snapshot, live, 2).categories[0];
    expect(hydrated.cards.map(card => card.id)).toEqual(['red', 'other-match-yellow']);
    expect(hydrated.debts[0].amount).toBe(50000);
    expect(hydrated.round).toBe(1);
    expect(snapshot.categories[0].cards).toHaveLength(3);
  });
});


const suspensionSnapshot = (sanctions: Array<Record<string, unknown>>): BulletinSnapshot => ({
  categories: [{ id: 'category', name: 'Football', sport: 'Football', fairPlayEnabled: false,
    round: 1, results: [], standings: [], scorers: [], cards: [], debts: [], sanctions }],
});

describe('suspension countdown between bulletins', () => {
  const live = suspensionSnapshot([{ id: 'javier', matches: 5, comment: 'Sanción' }]);

  it('shows five in bulletin 1 and four in both preview and publication of bulletin 2', () => {
    const first = stampSuspensionOrigins(live, 1);
    const second = stampSuspensionOrigins(live, 2, first);
    expect(first.categories[0].sanctions[0].matches).toBe(5);
    expect(second.categories[0].sanctions[0].matches).toBe(4);
    expect(hydrateDynamicBulletinFields(second, live, 2).categories[0].sanctions[0].matches).toBe(4);
    expect(stampSuspensionOrigins(live, 2, first)).toEqual(second);
  });

  it('discounts a sanction present in a legacy bulletin with no origin metadata', () => {
    expect(stampSuspensionOrigins(live, 2, live).categories[0].sanctions[0]).toMatchObject({
      matches: 4, originalMatches: 5, startBulletinNumber: 1,
    });
  });

  it('keeps the original start, expires at zero and does not revive the sanction', () => {
    let previous = stampSuspensionOrigins(live, 1);
    for (let number = 2; number <= 7; number++) {
      previous = stampSuspensionOrigins(live, number, previous);
      expect(previous.categories[0].sanctions[0].matches).toBe(Math.max(0, 6 - number));
    }
    expect(hydrateDynamicBulletinFields(previous, live, 7).categories[0].sanctions).toEqual([]);
  });

  it('does not discount a newly added sanction or one in a different category', () => {
    const previous = suspensionSnapshot([{ id: 'other', matches: 5 }]);
    expect(stampSuspensionOrigins(live, 2, previous).categories[0].sanctions[0].matches).toBe(5);
    previous.categories[0].id = 'other-category';
    previous.categories[0].sanctions = [{ id: 'javier', matches: 5 }];
    expect(stampSuspensionOrigins(live, 2, previous).categories[0].sanctions[0].matches).toBe(5);
  });
});
