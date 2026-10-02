import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import { theme } from '../src/lib/theme';

describe('HomeScreen', () => {
  it('renders the placeholder home route', () => {
    render(<HomeScreen />);

    expect(screen.getByText('LINKD')).toBeOnTheScreen();
  });

  it('styles the wordmark from the theme', () => {
    render(<HomeScreen />);

    expect(screen.getByText('LINKD')).toHaveStyle({
      color: theme.color.accent,
      fontFamily: theme.font.display,
    });
  });
});
