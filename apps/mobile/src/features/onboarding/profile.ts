import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '../../lib/supabase';

// Postgres unique_violation: the profile row already exists.
const ALREADY_EXISTS = '23505';

// Shared by the root layout (which routes on it) and the onboarding screen (which clears it).
let needsOnboarding = false;
const listeners = new Set<() => void>();

function setNeedsOnboarding(next: boolean): void {
  needsOnboarding = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `unknown` when the server could not be asked (offline, signed out). */
async function profileStatus(): Promise<'present' | 'missing' | 'unknown'> {
  const { data, error } = await supabase.from('profiles').select('user_id').maybeSingle();
  if (error) {
    return 'unknown';
  }
  return data === null ? 'missing' : 'present';
}

/**
 * Whether the signed-in user still has to onboard, i.e. has no profile row.
 * False until the server says so for certain: a slow or failed check must never
 * keep a user away from the home screen and its SOS button.
 */
export function useNeedsOnboarding(signedIn: boolean): boolean {
  useEffect(() => {
    if (!signedIn) {
      setNeedsOnboarding(false);
      return;
    }
    let current = true;
    void profileStatus().then((status) => {
      if (current) {
        setNeedsOnboarding(status === 'missing');
      }
    });
    return () => {
      current = false;
    };
  }, [signedIn]);

  return useSyncExternalStore(subscribe, () => needsOnboarding);
}

/**
 * Creates the profile, which is what finishes onboarding. `phoneE164` must already be
 * normalized (see `normalizePhone`). Returns false when it could not be saved; the user
 * stays on the last onboarding step and can try again.
 */
export async function createProfile(displayName: string, phoneE164: string, dispatchEnabled: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .insert({ display_name: displayName.trim(), phone_e164: phoneE164, dispatch_enabled: dispatchEnabled });
  // Already there means an earlier try was saved but its reply was lost.
  if (error && error.code !== ALREADY_EXISTS) {
    return false;
  }
  setNeedsOnboarding(false);
  return true;
}
