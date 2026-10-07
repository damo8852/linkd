import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../../lib/theme';
import { SOS_HOLD_MS } from './alertMachine';

/**
 * The in-app SOS trigger. Fires `onHold` only after an unbroken hold of SOS_HOLD_MS; a tap or
 * an early release does nothing. Always a red fill with the word SOS and a mark, never pink.
 */
export function SosButton({ onHold }: { onHold: () => void }): React.JSX.Element {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stop(): void {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }

  useEffect(() => stop, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="SOS"
      accessibilityHint="Hold for 3 seconds to send an SOS to your contacts"
      onPressIn={() => {
        setHolding(true);
        timer.current = setTimeout(() => {
          stop();
          onHold();
        }, SOS_HOLD_MS);
      }}
      onPressOut={stop}
      style={[styles.button, holding && styles.holding]}
    >
      <Text style={styles.mark}>!</Text>
      <Text style={styles.label}>SOS</Text>
      <Text style={styles.hint}>{holding ? 'Keep holding' : 'Hold 3 seconds'}</Text>
    </Pressable>
  );
}

const SIZE = 176;

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.danger,
    borderWidth: theme.space.sm,
    borderColor: theme.color.surface,
  },
  holding: { borderColor: theme.color.text },
  mark: { color: theme.color.onDanger, fontSize: theme.fontSize.xl, fontWeight: '800' },
  label: { color: theme.color.onDanger, fontSize: theme.fontSize['3xl'], fontWeight: '800', letterSpacing: 2 },
  hint: { color: theme.color.onDanger, fontSize: theme.fontSize.sm, fontWeight: '700' },
});
