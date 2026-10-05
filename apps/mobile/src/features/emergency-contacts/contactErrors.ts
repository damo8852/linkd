export const MAX_ACTIVE_CONTACTS = 5;

export type ContactFailure = 'limit' | 'duplicate' | 'network' | 'unknown';
export type ContactResult = { ok: true } | { ok: false; failure: ContactFailure };

/** What to show for each failure. Every message says what to do next. */
export const CONTACT_FAILURE_MESSAGE: Record<ContactFailure, string> = {
  limit: `You have ${MAX_ACTIVE_CONTACTS} contacts, the most allowed. Remove one to add another.`,
  duplicate: 'That number is already on your list. A contact who opted out cannot be added again.',
  network: "Can't reach LINKD, so nothing was changed. Check your connection and try again.",
  unknown: 'Something went wrong and nothing was changed. Try again.',
};

/** Maps a database or request error to the failure the screens know how to explain. */
export function classifyContactError(error: { code: string; message: string }): ContactFailure {
  // supabase-js reports a failed request as an error with an empty code.
  if (error.code === '') {
    return 'network';
  }
  if (error.code === '23505') {
    return 'duplicate';
  }
  // The limit trigger raises check_violation, as do the column checks; only the trigger says "limit".
  if (error.code === '23514' && error.message.includes('limit')) {
    return 'limit';
  }
  return 'unknown';
}
