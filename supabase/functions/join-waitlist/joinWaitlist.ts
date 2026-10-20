/**
 * join-waitlist logic, free of HTTP and Supabase so it is testable with fakes.
 * The landing page (apps/web) posts { email, token }; the token is a Cloudflare Turnstile
 * response that must pass server-side verification before anything is stored.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

/** Backed by an insert into public.waitlist with the service role. */
export interface WaitlistStore {
  add(email: string): Promise<'added' | 'duplicate'>;
}

export interface Captcha {
  verify(token: string, remoteIp: string | null): Promise<boolean>;
}

export type JoinResponse = { status: number; body: { joined?: true; error?: string } };

// Mirrors the waitlist table's check constraint.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function joinWaitlist(
  store: WaitlistStore,
  captcha: Captcha,
  input: unknown,
  remoteIp: string | null,
): Promise<JoinResponse> {
  const { email, token } = (input ?? {}) as { email?: unknown; token?: unknown };
  const trimmed = typeof email === 'string' ? email.trim() : '';
  if (trimmed.length > 254 || !EMAIL.test(trimmed)) return { status: 400, body: { error: 'invalid_email' } };

  if (typeof token !== 'string' || !token || !(await captcha.verify(token, remoteIp))) {
    return { status: 403, body: { error: 'captcha_failed' } };
  }

  // A duplicate answers like a new signup so the endpoint does not reveal who is on the list.
  await store.add(trimmed);
  return { status: 200, body: { joined: true } };
}

export function verifyTurnstile(secret: string, fetchFn: typeof fetch = fetch): Captcha {
  return {
    async verify(token, remoteIp) {
      const body = new URLSearchParams({ secret, response: token });
      if (remoteIp) body.set('remoteip', remoteIp);
      const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
      });
      if (!res.ok) throw new Error(`turnstile siteverify: HTTP ${res.status}`);
      const result = (await res.json()) as { success?: boolean };
      return result.success === true;
    },
  };
}
