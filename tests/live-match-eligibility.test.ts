import { describe, expect, it } from 'vitest';
import { filterLiveEligibilityEvents } from '../app/lib/discipline/suspension';

describe('live match disciplinary eligibility', () => {
  it('does not block a player with a yellow card from continuing in the same match', () => {
    const events = [
      { id: 'yellow-current', match_id: 'match-current', player_id: 'player', event_type: 'YELLOW' },
      { id: 'red-previous', match_id: 'match-previous', player_id: 'player', event_type: 'RED' },
    ];

    expect(filterLiveEligibilityEvents(events, 'match-current').map((event) => event.id)).toEqual(['red-previous']);
  });

  it('keeps a red card from the current match blocking the player', () => {
    const events = [
      { id: 'yellow-current', match_id: 'match-current', player_id: 'player', event_type: 'YELLOW' },
      { id: 'red-current', match_id: 'match-current', player_id: 'player', event_type: 'RED' },
    ];

    expect(filterLiveEligibilityEvents(events, 'match-current').map((event) => event.id)).toEqual(['red-current']);
  });
});
