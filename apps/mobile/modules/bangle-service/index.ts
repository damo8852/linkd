import { requireOptionalNativeModule } from 'expo';

/** Android only; absent on iOS and in tests. */
const native = requireOptionalNativeModule<{ start(): void }>('BangleService');

/**
 * Starts (or keeps) the Android foreground service that keeps the bangle link and JS timers alive in
 * the background. Does nothing on iOS. Throws when Android refuses to start it.
 */
export function startBackgroundLink(): void {
  native?.start();
}
