import type { KeyValueStorage } from '../emergency-contacts/contactsCache';
import type { DisarmReason, EndReason, Trigger } from './alertMachine';
import type { PendingSos } from './sosController';

const KEY = 'linkd.sos-pending';

export const EMPTY_PENDING_SOS: PendingSos = { active: null, ends: [], disarms: [] };

const TRIGGERS: readonly unknown[] = ['button', 'inApp', 'linkLoss'] satisfies Trigger[];
const END_REASONS: readonly unknown[] = ['user', 'timeout'] satisfies EndReason[];
const DISARM_REASONS: readonly unknown[] = ['cancel', 'reconnect', 'benign'] satisfies DisarmReason[];

type Loose = Record<string, unknown> | null | undefined;

const asList = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);

/**
 * Reads the saved record. On failure: unreadable storage or bad JSON reads as empty, and a
 * malformed entry is dropped while every valid one is kept; it never throws.
 */
export async function readPendingSos(storage: KeyValueStorage): Promise<PendingSos> {
  let saved: Loose;
  try {
    saved = JSON.parse((await storage.getItem(KEY)) ?? 'null') as Loose;
  } catch {
    return EMPTY_PENDING_SOS;
  }
  if (typeof saved !== 'object' || saved === null) {
    return EMPTY_PENDING_SOS;
  }

  const a = saved.active as Loose;
  const active =
    typeof a?.id === 'string' &&
    TRIGGERS.includes(a.trigger) &&
    typeof a.triggeredAt === 'number' &&
    typeof a.endsAt === 'number'
      ? { id: a.id, trigger: a.trigger as Trigger, triggeredAt: a.triggeredAt, endsAt: a.endsAt }
      : null;

  const ends = asList(saved.ends).flatMap((e) =>
    typeof e?.id === 'string' && END_REASONS.includes(e.reason) ? [{ id: e.id, reason: e.reason as EndReason }] : [],
  );

  const disarms = asList(saved.disarms).flatMap((d) =>
    typeof d?.id === 'string' && TRIGGERS.includes(d.trigger) && DISARM_REASONS.includes(d.reason)
      ? [{ id: d.id, trigger: d.trigger as Trigger, reason: d.reason as DisarmReason }]
      : [],
  );

  return { active, ends, disarms };
}

/**
 * Returns a save function that writes records one at a time, in the order they were saved, so a
 * slow earlier write can never land after a later one.
 * On failure: a failed write is passed to `onError` and the next save still runs.
 */
export function createPendingSosWriter(
  storage: KeyValueStorage,
  onError: (error: unknown) => void,
): (record: PendingSos) => void {
  let queue: Promise<void> = Promise.resolve();
  return (record) => {
    const serialized = JSON.stringify(record);
    queue = queue.then(() => storage.setItem(KEY, serialized)).catch(onError);
  };
}
