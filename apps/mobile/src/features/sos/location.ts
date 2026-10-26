import * as Location from 'expo-location';

/** The shape send-alert accepts for `location` (supabase/functions/send-alert/sendAlert.ts). */
export type Fix = { latitude: number; longitude: number; accuracyM: number | null; at: string | null };

/** The longest an SOS ever waits for a location. */
export const LOCATION_TIMEOUT_MS = 1_000;

/**
 * The phone's last known fix, for attaching to an SOS without waiting for GPS.
 * On failure: no permission, no fix, an error, or no answer within LOCATION_TIMEOUT_MS is
 * null, never an error, so a location problem can never hold back or fail a send.
 */
export async function lastKnownFix(): Promise<Fix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS);
  });
  try {
    const position = await Promise.race([Location.getLastKnownPositionAsync(), timeout]);
    return (
      position && {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
        at: new Date(position.timestamp).toISOString(),
      }
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
