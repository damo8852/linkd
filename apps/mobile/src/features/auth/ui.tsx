import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '../../lib/theme';

/** Page container for the auth screens: safe area, keyboard-aware, scrolls on small phones. */
export function Screen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: string }): React.JSX.Element {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

export function Body({ children }: { children: string }): React.JSX.Element {
  return <Text style={styles.body}>{children}</Text>;
}

/** Labelled text input. */
export function Field({ label, ...input }: TextInputProps & { label: string }): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={theme.color.textMuted}
        style={styles.input}
        {...input}
      />
    </View>
  );
}

/** Email + password inputs shared by the auth screens. */
export function EmailField(props: Pick<TextInputProps, 'value' | 'onChangeText'>): React.JSX.Element {
  return (
    <Field
      label="Email"
      autoComplete="email"
      keyboardType="email-address"
      placeholder="you@example.com"
      textContentType="emailAddress"
      {...props}
    />
  );
}

export function PasswordField({
  label = 'Password',
  isNew = false,
  ...props
}: Pick<TextInputProps, 'value' | 'onChangeText' | 'placeholder'> & {
  label?: string;
  isNew?: boolean;
}): React.JSX.Element {
  return (
    <Field
      label={label}
      autoComplete={isNew ? 'new-password' : 'current-password'}
      secureTextEntry
      textContentType={isNew ? 'newPassword' : 'password'}
      {...props}
    />
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, variant === 'primary' ? styles.primary : styles.ghost, disabled && styles.disabled]}
    >
      <Text style={variant === 'primary' ? styles.primaryLabel : styles.ghostLabel}>{label}</Text>
    </Pressable>
  );
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.link}>
      <Text style={styles.linkLabel}>{label}</Text>
    </Pressable>
  );
}

/** Error text. Announced by screen readers, and never color alone: it is always a sentence. */
export function ErrorText({ children }: { children: string }): React.JSX.Element {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

// Minimum touch target (44pt) from the mobile protocol.
const TOUCH_TARGET = 44;

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  content: { flexGrow: 1, justifyContent: 'center', gap: theme.space.md, padding: theme.space.lg },
  heading: { color: theme.color.text, fontFamily: theme.font.display, fontSize: theme.fontSize['2xl'] },
  body: { color: theme.color.textMuted, fontSize: theme.fontSize.base },
  field: { gap: theme.space.xs },
  label: { color: theme.color.textMuted, fontSize: theme.fontSize.sm },
  input: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    color: theme.color.text,
    fontSize: theme.fontSize.base,
  },
  button: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.pill,
  },
  primary: { backgroundColor: theme.color.accent },
  ghost: { borderWidth: 1, borderColor: theme.color.border },
  disabled: { opacity: 0.5 },
  primaryLabel: { color: theme.color.onAccent, fontSize: theme.fontSize.base, fontWeight: '600' },
  ghostLabel: { color: theme.color.text, fontSize: theme.fontSize.base },
  link: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { color: theme.color.accent, fontSize: theme.fontSize.sm, fontWeight: '600' },
  error: { color: theme.color.danger, fontSize: theme.fontSize.sm },
});
