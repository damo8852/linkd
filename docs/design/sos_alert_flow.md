# SOS Alert Flow (draft)

> **Status: draft.** Decided items are marked **Decided**; everything else needs a `/new-design` pass before the alert path is implemented. Changes to this file need developer sign-off (session_protocol Enforcement Rule 6).

The single spec for **when an SOS fires, how it can be cancelled, and who is told**. The code lives in `apps/mobile/src/features/sos/` (state machine) and `supabase/functions/` (fan-out).

---

## Triggers

| Trigger                      | Status      | Notes                                                                 |
|------------------------------|-------------|-----------------------------------------------------------------------|
| Bangle button press / hold   | **Decided** | Exact gesture (single press, hold N s, multi-press) is open.          |
| BLE link severed             | **Decided** | Only after the grace period, and never after a battery-critical message. |
| In-app SOS button            | Open        | Likely yes, as a fallback.                                            |

## States (sketch)

```
Idle ──trigger──▶ CancelWindow ──timeout──▶ Sending ──▶ Sent / PartiallyFailed
  │                     │
  │                     └──cancel──▶ Idle
  └──link lost──▶ GracePeriod ──reconnect──▶ Idle
                        └──timeout──▶ CancelWindow

BatteryCritical received ──▶ link loss after it is NOT an emergency (warn the user instead)
```

## Recipients

| Channel                          | Status      | Notes                                                         |
|----------------------------------|-------------|---------------------------------------------------------------|
| SMS to chosen emergency contacts | **Decided** | Via Twilio from a Supabase Edge Function. Includes location.  |
| Emergency dispatch               | **Decided** | Noonlight or RapidSOS (vendor open), behind an interface.     |
| Push to contacts with the app    | Deferred    |                                                               |

## Open questions

- Grace period length after link loss, and cancel window length.
- Which button gesture triggers, and how to avoid accidental triggers.
- Button trigger: cancel window, or send immediately (the user may not be able to reach the phone)?
- Location: one fix at trigger time, or live updates to contacts for N minutes?
- No network at trigger time: fall back to the native SMS composer? Queue and retry?
- iOS force-quit: iOS will not relaunch the app for BLE after a force-quit. How do we warn the user, and does the bangle need to detect "phone app gone"?
- Phone Bluetooth turned off, or phone battery dies: alert, warn, or ignore?
- Contacts: max count, do they need to opt in (consent SMS) before being added?
- Dispatch vendor choice (Noonlight vs RapidSOS) and their consent/verification requirements.
