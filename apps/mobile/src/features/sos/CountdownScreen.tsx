import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, ErrorText } from '../../components/ui';
import { theme } from '../../lib/theme';
import type { SosState } from './alertMachine';

type CancelWindow = Extract<SosState, { kind: 'cancelWindow' }>;

/**
 * The cancel window: the most important screen in the app. One action, a cancel target of at
 * least 88pt, the highest-contrast pair. Display only: the controller owns the deadline and
 * sends when it passes, whatever this screen is doing.
 */
export function CountdownScreen({
  state,
  onCancel,
  now = Date.now,
}: {
  state: CancelWindow;
  /** Resolves false when the unlock failed or came too late. */
  onCancel: () => Promise<boolean>;
  now?: () => number;
}): React.JSX.Element {
  const [, redraw] = useState(0);
  const [notCancelled, setNotCancelled] = useState(false);
  const linkLoss = state.trigger === 'linkLoss';

  useEffect(() => {
    const interval = setInterval(() => redraw((n) => n + 1), 250);
    return () => clearInterval(interval);
  }, []);

  const seconds = Math.max(0, Math.ceil((state.endsAt - now()) / 1000));

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.heading}>
        {linkLoss ? 'Bangle disconnected' : 'Sending SOS in'}
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.count}>
        {`${seconds}`}
      </Text>
      <Text style={styles.body}>
        {linkLoss ? 'Sending SOS when this reaches zero.' : 'Your contacts will be told you need help.'}
      </Text>
      {linkLoss && state.bangleReconnected && (
        <Banner tone="info">Bangle reconnected. This is still counting. Unlock to cancel.</Banner>
      )}

      <View style={styles.spacer} />

      {notCancelled && <ErrorText>Not cancelled. Unlock your phone to stop the SOS.</ErrorText>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={linkLoss ? "I'm okay, cancel" : 'Cancel'}
        onPress={() => {
          setNotCancelled(false);
          void onCancel().then((cancelled) => setNotCancelled(!cancelled));
        }}
        style={styles.cancel}
      >
        <Text style={styles.cancelLabel}>{linkLoss ? "I'm okay, cancel" : 'Cancel'}</Text>
        <Text style={styles.cancelHint}>Unlock your phone to stop it</Text>
      </Pressable>
      <Text style={styles.small}>
        {linkLoss ? 'Do nothing and it sends. Holding the bangle button sends now.' : 'Do nothing and it sends.'}
      </Text>
    </View>
  );
}

// Above the 88pt minimum (theme.size.cancelTarget) so it is easy to hit under stress.
const CANCEL_HEIGHT = 96;

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', gap: theme.space.md, padding: theme.space.lg },
  heading: {
    color: theme.color.text,
    fontFamily: theme.font.display,
    fontSize: theme.fontSize['2xl'],
    textAlign: 'center',
  },
  // System font: nothing on this screen may depend on a font loading.
  count: { color: theme.color.text, fontSize: 120, fontWeight: '800', fontVariant: ['tabular-nums'] },
  body: { color: theme.color.textMuted, fontSize: theme.fontSize.base, textAlign: 'center' },
  spacer: { flex: 1 },
  cancel: {
    alignSelf: 'stretch',
    minHeight: CANCEL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.lg,
    // text on bg reversed: the highest-contrast pair in the palette.
    backgroundColor: theme.color.text,
  },
  cancelLabel: { color: theme.color.bg, fontSize: theme.fontSize.xl, fontWeight: '800' },
  cancelHint: { color: theme.color.bg, fontSize: theme.fontSize.sm, fontWeight: '600' },
  small: { color: theme.color.textMuted, fontSize: theme.fontSize.xs, textAlign: 'center' },
});
