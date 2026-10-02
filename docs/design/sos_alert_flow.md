# SOS Alert Flow

> **Status: decided** (items marked **Decided**). Remaining items are listed under Open questions and tracked as `decision` issues. Changes to this file need developer sign-off (session_protocol Enforcement Rule 6).

The single spec for **when an SOS fires, how it can be cancelled, and who is told**. The code lives in `apps/mobile/src/features/sos/` (state machine) and `supabase/functions/` (fan-out).

Guiding rule: a **missed alert** is worse than a **false alert**. When the app cannot tell, it sends.

---

## Triggers

| Trigger           | Status      | Notes                                                                                          |
|-------------------|-------------|------------------------------------------------------------------------------------------------|
| Bangle button     | **Decided** | Hold for `SOS_HOLD_MS`; detected by firmware, which then sends `SOS_TRIGGER`. Short presses do nothing. |
| BLE link severed  | **Decided** | Grace period, then the link-loss cancel window. Never after a benign link loss (see below).     |
| In-app SOS button | **Decided** | Hold-to-trigger, same cancel window as the bangle button. Fallback when the bangle is dead, unpaired, or not worn. |

## Timings

All are tunable constants (starting values, to be tuned on real hardware). The clock is injected so tests never sleep.

| Constant                     | Value  | Meaning                                                                 |
|------------------------------|--------|-------------------------------------------------------------------------|
| `SOS_HOLD_MS`                | 3 s    | Button hold needed to trigger (firmware side).                          |
| `BUTTON_CANCEL_WINDOW_MS`    | 5 s    | Countdown after a bangle or in-app trigger.                             |
| `GRACE_PERIOD_MS`            | 20 s   | Silent wait after link loss; a stable reconnect returns to Idle.        |
| `RECONNECT_STABLE_MS`        | 5 s    | How long the link must stay up during grace to count as reconnected.    |
| `LINK_LOSS_CANCEL_WINDOW_MS` | 30 s   | Countdown after the grace period (50 s total from link loss to send).   |
| `LIVE_LOCATION_MS`           | 60 min | How long the live location link updates; the alert auto-ends after it.  |

## Cancelling

**Decided.** Cancelling a countdown, or ending a sent alert ("I'm safe"), requires a **device unlock** (biometric or passcode). No input, a failed unlock, or an unlock that outlasts the window lets the alert send. During link loss the bangle cannot cancel, so cancel is phone-only.

Known risk: the 5 s button window is short for a passcode unlock, so an accidental hold may send. Accepted (false alert over missed alert); revisit with real usage.

## States

```
Idle ──button / in-app hold──▶ CancelWindow(5 s) ──timeout──▶ Sending ──▶ Active ──"I'm safe" / 60 min──▶ Ended
  │                              │      ▲                        │
  │                              │      │                        └─ PartiallyFailed: surface to user, keep retrying
  │                              └─cancel (unlock)──▶ Idle
  │                                     │
  └──link lost──▶ GracePeriod(20 s) ──timeout──▶ CancelWindow(30 s) ──button hold──▶ Sending
                        └──link up 5 s──▶ Idle      (reconnect here: keep counting down)

Benign link loss (battery-critical, phone Bluetooth off, phone dying) ──▶ Unprotected warning, never an SOS
```

## Reconnect and flapping

**Decided.** A reconnect never cancels an alert on its own; only a device unlock does.

- **During grace:** the link must stay up for `RECONNECT_STABLE_MS` to return to Idle. A drop before that resumes the same grace timer (it never restarts), so a flapping link cannot postpone an alert. If grace expires before the link is stable, the cancel window starts.
- **During the link-loss cancel window:** the countdown keeps running. The phone shows that the bangle reconnected and that cancelling needs an unlock.
- **Button hold during the link-loss cancel window:** sends immediately, skipping the remaining countdown.

## Benign link loss

**Decided.** These never trigger an SOS and send no SMS. The app shows a persistent local warning that the bangle is not protecting the user:

| Cause                                   | Detected by                                 |
|-----------------------------------------|---------------------------------------------|
| Bangle sent `BATTERY_CRITICAL`          | BLE message before the disconnect           |
| Phone Bluetooth turned off              | OS Bluetooth state change                   |
| Phone battery dying / shutting down     | OS battery / shutdown signal (to verify per platform) |

## Location

**Decided.** The SOS SMS includes the location fix at trigger time immediately (sending never waits for GPS; last known location is used if no fresh fix), plus a **live location link** updated for `LIVE_LOCATION_MS` or until the alert ends.

## Recipients

| Channel                          | Status      | Notes                                                                      |
|----------------------------------|-------------|----------------------------------------------------------------------------|
| SMS to chosen emergency contacts | **Decided** | Always texted. Via Twilio from a Supabase Edge Function. Up to 5 contacts. |
| Emergency dispatch               | **Decided** | User setting chosen in onboarding, default on. Vendor open, behind an interface. |
| Push to contacts with the app    | Deferred    |                                                                            |

**Contacts (Decided):** up to 5. Adding a contact sends a one-time intro SMS (who added them, reply STOP to opt out). The contact is active immediately; a STOP removes them and warns the user.

## Offline

**Decided.** With no data connection the app does both: keeps retrying the server send (idempotent client-generated alert id, so contacts are never texted twice), and opens the native SMS composer prefilled with the cached contacts and last known location so a user who can tap gets it out.

## Signed out

**Decided.** Being signed out never disarms the bangle or blocks an SOS. At sign-in the app gets a per-install **alert token**, kept in secure storage; the server stores only its hash. When there is no valid session, the app sends the alert with this token instead, and the server treats it exactly like a signed-in send: contacts are texted and dispatch follows the user's saved setting. The native SMS composer also opens, as for offline.

- The token can only send, update, and end alerts for its own user and device. It reads nothing else.
- Signing out keeps the cached contacts, alert settings, and token, and shows a persistent "signed out" banner. Signing in as a different account replaces them.
- **Remove this device** (on the phone, or from another signed-in device) revokes the token and wipes the cache; that is the only way to disarm a phone.

## Ending an alert

**Decided.** "I'm safe" (device unlock required) ends the alert: contacts get an "I'm safe" SMS, the live location link stops, and dispatch is cancelled through the vendor API where supported. With no action the alert auto-ends after `LIVE_LOCATION_MS`.

## iOS force-quit

**Decided.** iOS does not relaunch a force-quit app for BLE events (verify against current Apple docs at implementation), and the v1 bangle cannot warn the user. Mitigation: explain it in onboarding, and keep a scheduled local notification that the running app reschedules, so it fires ("LINKD is not running, open it") if the app is gone. Needs on-device verification.

## To verify at implementation

- iOS SMS composer requires a user tap to send; Android silent SMS (`SEND_SMS`) is restricted by Google Play.
- iOS state restoration behavior after force-quit.
- Detecting phone shutdown / critically low battery on iOS and Android.
- Twilio consent, intro-message, and STOP handling requirements.

## Open questions

- Duress PIN (an unlock that appears to cancel but still sends).
- Should phone Bluetooth turned off by someone else be treated as an attack?
- Dispatch vendor choice (Noonlight vs RapidSOS) and their consent/verification requirements.
