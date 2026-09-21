import { normalizeDoubleCautions, type DisciplinaryEvent } from './double-caution';

export type BulletinSanction = {
  id: string;
  matches?: number;
  originalMatches?: number;
  startBulletinNumber?: number;
};

/**
 * A caution recorded in the open match must not make the same player
 * ineligible for a later goal or substitution in that match. Red cards and
 * sanctions from previous matches still participate in live eligibility.
 */
export function filterLiveEligibilityEvents<T extends { match_id?: string | null; event_type?: string | null }>(events: T[], currentMatchId: string): T[] {
  return events.filter((event) => !(event.match_id === currentMatchId && event.event_type === 'YELLOW'));
}

/** Only confirmed bulletin numbers count; previews must never unlock a roster. */
export function remainingSuspension(sanction: BulletinSanction, bulletinNumber: number): number {
  const total = Number(sanction.originalMatches ?? sanction.matches ?? 0);
  const start = Number(sanction.startBulletinNumber ?? 1);
  return Math.max(0, total - Math.max(0, bulletinNumber - start));
}

export function getDisciplinaryBlocks(
  events: DisciplinaryEvent[],
  sanctions: BulletinSanction[],
  bulletinNumber: number,
): Record<string, string> {
  const published = new Map(sanctions.map(sanction => [sanction.id, sanction]));
  const blocks: Record<string, string> = {};
  for (const event of normalizeDoubleCautions(events)) {
    if (!event.player_id) continue;
    const sanction = published.get(event.id);
    // New sanctions block immediately and begin counting on first publication.
    const remaining = event.event_type === 'RED'
      ? sanction ? remainingSuspension(sanction, bulletinNumber) : Number(event.suspension_matches ?? 0)
      : 0;
    const reasons = [];
    if (remaining > 0) reasons.push(`Suspensión activa: ${remaining} fecha(s) pendiente(s).`);
    if (event.fine_status === 'UNPAID') reasons.push('Multa pendiente de pago.');
    if (reasons.length) blocks[event.player_id] = [blocks[event.player_id], ...reasons].filter(Boolean).join(' ');
  }
  return blocks;
}
