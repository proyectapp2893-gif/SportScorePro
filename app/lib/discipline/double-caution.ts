/**
 * Normalises football disciplinary events for financial/admin views.
 *
 * The existing match-event RPC records the second yellow and the derived red
 * as two rows.  There is no dedicated relation column, so pairing is kept
 * deliberately conservative: the red must belong to the same match/player/
 * team and share the event timestamp (or the complete match position).
 * The second yellow is retained in the source history, but is not billable;
 * the red remains the single billable sanction for the double caution.
 */
export type DisciplinaryEvent = {
  id: string;
  event_type: string;
  match_id?: string | null;
  player_id?: string | null;
  team_id?: string | null;
  created_at?: string | null;
  period?: string | null;
  match_second?: number | null;
  minute_record?: number | string | null;
  fine_status?: string | null;
  [key: string]: unknown;
};

export type NormalizedDisciplinaryEvent<T extends DisciplinaryEvent = DisciplinaryEvent> = T & {
  isDoubleCaution?: boolean;
  excludedFromFine?: boolean;
};

function sameIdentity(a: DisciplinaryEvent, b: DisciplinaryEvent) {
  return Boolean(a.player_id && b.player_id && a.player_id === b.player_id
    && a.match_id && b.match_id && a.match_id === b.match_id
    && a.team_id && b.team_id && a.team_id === b.team_id);
}

function samePosition(a: DisciplinaryEvent, b: DisciplinaryEvent) {
  return a.period === b.period
    && a.match_second === b.match_second
    && String(a.minute_record ?? '') === String(b.minute_record ?? '');
}

export function normalizeDoubleCautions<T extends DisciplinaryEvent>(events: T[]): NormalizedDisciplinaryEvent<T>[] {
  const yellowsByPlayer = new Map<string, T[]>();
  for (const event of events) {
    if (event.event_type !== 'YELLOW' || !event.player_id) continue;
    const key = `${event.match_id ?? ''}:${event.team_id ?? ''}:${event.player_id}`;
    const bucket = yellowsByPlayer.get(key) || [];
    bucket.push(event);
    yellowsByPlayer.set(key, bucket);
  }

  const pairedYellowIds = new Set<string>();
  const doubleRedIds = new Set<string>();
  for (const yellows of yellowsByPlayer.values()) {
    yellows.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
    const secondYellow = yellows[1];
    if (!secondYellow) continue;
    const generatedRed = events.find((candidate) => candidate.event_type === 'RED'
      && sameIdentity(candidate, secondYellow)
      && ((candidate.created_at && secondYellow.created_at && candidate.created_at === secondYellow.created_at)
        || samePosition(candidate, secondYellow)));
    if (generatedRed) {
      // Once the second caution becomes a red, the pair is represented by
      // the red fine only (neither yellow is independently billable).
      pairedYellowIds.add(yellows[0].id);
      pairedYellowIds.add(secondYellow.id);
      doubleRedIds.add(generatedRed.id);
    }
  }

  return events
    .filter((event) => !pairedYellowIds.has(event.id))
    .map((event) => ({
      ...event,
      ...(doubleRedIds.has(event.id) ? { isDoubleCaution: true } : {}),
    }));
}
