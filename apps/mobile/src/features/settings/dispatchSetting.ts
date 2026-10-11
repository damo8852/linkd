import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../../lib/supabase';

/** The saved dispatch setting, or null when the server could not be asked. Never throws. */
async function loadDispatchEnabled(): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.from('profiles').select('dispatch_enabled').maybeSingle();
    return error ? null : (data?.dispatch_enabled ?? null);
  } catch {
    return null;
  }
}

/**
 * Saves the dispatch setting and returns the value the server now holds, or null when it was
 * not saved (offline, signed out, no profile row). Never throws; the caller keeps showing the
 * last saved value on null.
 */
async function saveDispatchEnabled(next: boolean): Promise<boolean | null> {
  try {
    const userId = (await supabase.auth.getSession()).data.session?.user.id;
    if (userId === undefined) {
      return null;
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ dispatch_enabled: next })
      .eq('user_id', userId)
      .select('dispatch_enabled')
      .maybeSingle();
    return error ? null : (data?.dispatch_enabled ?? null);
  } catch {
    return null;
  }
}

/**
 * The dispatch setting as the server last confirmed it. `enabled` is null until it has been
 * read, and stays null if it cannot be: the screen must not show a guess. `change` never
 * updates `enabled` before the server has saved it; a failed save sets `saveFailed` instead.
 */
export function useDispatchSetting(): {
  enabled: boolean | null;
  loading: boolean;
  saving: boolean;
  saveFailed: boolean;
  reload: () => Promise<void>;
  change: (next: boolean) => Promise<void>;
} {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setEnabled(await loadDispatchEnabled());
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const change = useCallback(async (next: boolean): Promise<void> => {
    setSaveFailed(false);
    setSaving(true);
    const saved = await saveDispatchEnabled(next);
    if (saved === null) {
      setSaveFailed(true);
    } else {
      setEnabled(saved);
    }
    setSaving(false);
  }, []);

  return { enabled, loading, saving, saveFailed, reload, change };
}
