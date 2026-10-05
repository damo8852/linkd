import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/** Region assumed for a number typed without a country code. Anything else needs a leading +. */
const DEFAULT_REGION = 'US';

/**
 * Normalizes a typed phone number to E.164 (`+12133734253`), the only form the
 * database and the SMS provider accept. Returns null when the number is not a
 * valid one, so a mistyped contact is rejected at entry rather than silently
 * never reached by an SOS.
 */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input, DEFAULT_REGION);
  return parsed?.isValid() ? parsed.number : null;
}

/** Formats a stored E.164 number for display (`+1 213 373 4253`). Falls back to the stored value. */
export function formatPhone(phoneE164: string): string {
  return parsePhoneNumberFromString(phoneE164)?.formatInternational() ?? phoneE164;
}
