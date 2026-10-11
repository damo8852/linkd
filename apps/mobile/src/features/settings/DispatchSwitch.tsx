import { StyleSheet, Switch, Text, View } from 'react-native';

import { Body } from '../../components/ui';
import { theme } from '../../lib/theme';

/** The dispatch setting as a switch, with its state in words and what that state means. */
export function DispatchSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{`Emergency dispatch: ${value ? 'On' : 'Off'}`}</Text>
        <Switch
          accessibilityLabel="Emergency dispatch"
          disabled={disabled}
          value={value}
          onValueChange={onChange}
          trackColor={{ true: theme.color.accent, false: theme.color.border }}
        />
      </View>
      <Body>
        {value
          ? 'On: trained dispatchers are told too and can send help to you.'
          : 'Off: only your contacts are told. No dispatcher is asked to send help.'}
      </Body>
    </>
  );
}

// Minimum touch target (44pt) from the mobile protocol.
const TOUCH_TARGET = 44;

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  row: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
  rowLabel: { flexShrink: 1, color: theme.color.text, fontSize: theme.fontSize.lg, fontWeight: '600' },
});
