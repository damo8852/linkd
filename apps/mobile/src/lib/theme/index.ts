/**
 * LINKD theme tokens ("Pink drink", dark only). Values and contrast ratios are
 * documented in docs/design/style_guide.md; change them there first.
 */
export const theme = {
  color: {
    bg: '#1B1033',
    surface: '#2A1B4D',
    border: '#7A66A8',
    text: '#FFFFFF',
    textMuted: '#C9BFE0',
    accent: '#FF4FA3',
    onAccent: '#1B1033',
    danger: '#FF4D4D',
    onDanger: '#1B1033',
    success: '#6EE7B7',
    warn: '#FFE36E',
    highlight: '#FF8A3D',
  },
  font: {
    // undefined = the platform system font, so body and SOS text can never fail to load.
    body: undefined,
    display: 'Fredoka-SemiBold',
  },
  fontSize: { xs: 12, sm: 14, base: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 48 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 16, lg: 24, pill: 999 },
  size: { cancelTarget: 88 },
} as const;

export type Theme = typeof theme;

/** Returns the app theme. Dark only, so it is constant; components still read it here, never as literals. */
export function useTheme(): Theme {
  return theme;
}
