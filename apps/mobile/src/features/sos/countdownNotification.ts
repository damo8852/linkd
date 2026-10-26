import { BUTTON_CANCEL_WINDOW_MS, LINK_LOSS_CANCEL_WINDOW_MS, type SosState } from './alertMachine';

/**
 * When the countdown notification should appear: the moment the visible cancel window starts
 * (now for a hold, the end of grace for a link loss, which stays silent until then), or null.
 * The OS shows a scheduled notification even while the app is suspended, so the countdown can
 * be reached from it; tapping it opens the app, where the overlay shows the countdown.
 */
export function countdownNotificationAt(state: SosState): number | null {
  switch (state.kind) {
    case 'grace':
      return state.endsAt;
    case 'cancelWindow':
      return state.endsAt - (state.trigger === 'linkLoss' ? LINK_LOSS_CANCEL_WINDOW_MS : BUTTON_CANCEL_WINDOW_MS);
    default:
      return null;
  }
}

export type CountdownNotifications = {
  /** Shows the notification at `at` (epoch ms), replacing any scheduled one. */
  schedule(at: number): Promise<unknown>;
  /** Cancels a scheduled notification and removes a shown one. */
  clear(): Promise<unknown>;
};

/** Returns a sync to call on every SOS state change; it only touches the OS when the time changes. */
export function createCountdownNotifier(notifications: CountdownNotifications): (state: SosState) => void {
  let current: number | null = null;
  return (state) => {
    const at = countdownNotificationAt(state);
    if (at === current) return;
    current = at;
    // A notification that fails to schedule must never touch the countdown itself.
    void (at === null ? notifications.clear() : notifications.schedule(at)).catch(() => undefined);
  };
}
