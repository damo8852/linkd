import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';

describe('HomeScreen', () => {
  it('renders the placeholder home route', () => {
    render(<HomeScreen />);

    expect(screen.getByText('LINKD')).toBeOnTheScreen();
  });
});
