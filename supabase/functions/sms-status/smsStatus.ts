/**
 * sms-status logic, free of HTTP and Supabase so it is testable with fakes.
 * Twilio calls this after it accepted an SOS text, to say whether the handset got it.
 * Docs: https://www.twilio.com/docs/messaging/guides/track-outbound-message-status
 * Rules: docs/protocol/supabase_protocol.md.
 */

export type DeliveryStatus = 'delivered' | 'undelivered' | 'failed';

/** Backed by the record_alert_delivery SQL function. */
export interface DeliveryStore {
  /** Resolves false when no recipient has that provider message id. */
  record(providerMessageId: string, status: DeliveryStatus, errorCode: string | null): Promise<boolean>;
}

export type StatusCallbackConfig = {
  authToken: string;
  /** The exact public URL given to Twilio as StatusCallback; the signature covers it. */
  url: string;
};

export type StatusCallbackResponse = { status: number; body: { recorded?: boolean; error?: string } };

/** Only final statuses are kept; queued / sending / sent can arrive late and out of order. */
const FINAL: readonly string[] = ['delivered', 'undelivered', 'failed'];

/**
 * Checks X-Twilio-Signature: base64 HMAC-SHA1, keyed with the auth token, over the URL followed
 * by every POST parameter name and value, sorted by name
 * (https://www.twilio.com/docs/usage/security). Compared by `crypto.subtle.verify`, not `===`.
 * Any malformed or missing header is simply invalid.
 */
export async function validTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  let mac: Uint8Array<ArrayBuffer>;
  try {
    mac = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const pairs = [...params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const data = url + pairs.map(([name, value]) => name + value).join('');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, mac, encoder.encode(data));
}

/**
 * Records a final delivery status for one SOS text.
 * On failure: a bad signature is 403 and records nothing; an unknown message id is 404 so it
 * shows up in Twilio's logs; store errors reject so the handler returns 500. Nothing is swallowed.
 */
export async function handleStatusCallback(
  store: DeliveryStore,
  config: StatusCallbackConfig,
  signature: string | null,
  body: string,
): Promise<StatusCallbackResponse> {
  const params = new URLSearchParams(body);
  if (!(await validTwilioSignature(config.authToken, config.url, params, signature))) {
    return { status: 403, body: { error: 'invalid_signature' } };
  }

  const messageId = params.get('MessageSid');
  const status = params.get('MessageStatus');
  if (!messageId || !status) return { status: 400, body: { error: 'MessageSid and MessageStatus are required' } };
  if (!FINAL.includes(status)) return { status: 200, body: { recorded: false } };

  const found = await store.record(messageId, status as DeliveryStatus, params.get('ErrorCode') || null);
  return found ? { status: 200, body: { recorded: true } } : { status: 404, body: { error: 'unknown_message' } };
}
