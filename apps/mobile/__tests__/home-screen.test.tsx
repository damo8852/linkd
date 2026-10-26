import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import { theme } from '../src/lib/theme';

// A factory, so the real module (and the native storage behind the client) is never loaded.
jest.mock('../src/features/auth/auth', () => ({ signOut: jest.fn() }));
jest.mock('../src/features/emergency-contacts/contacts', () => ({
  useContacts: () => ({ contacts: [], loading: false, fresh: true, reload: jest.fn() }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
let mockSnapshot = { endFailed: false, disarmFailed: false, lateCancel: false };
jest.mock('../src/features/sos/sos', () => ({
  useSos: () => ({ hold: jest.fn(), snapshot: mockSnapshot }),
  useHasScreenLock: () => true,
}));

describe('HomeScreen', () => {
  it('renders the placeholder home route', () => {
    render(<HomeScreen />);

    expect(screen.getByText('LINKD')).toBeOnTheScreen();
  });

  it('warns that nobody will be texted until a contact exists', () => {
    render(<HomeScreen />);

    expect(screen.getByText('No one will be texted if you send an SOS.')).toBeOnTheScreen();
  });

  it.each([
    ['endFailed', 'Could not tell your contacts your alert ended. Trying again.'],
    ['disarmFailed', 'Could not confirm your cancel with LINKD. Trying again. Your SOS may still be sent.'],
    ['lateCancel', "Your SOS went out before your cancel reached LINKD. Your contacts are being told you're safe."],
  ])('shows %s only while it is true', (flag, message) => {
    render(<HomeScreen />);
    expect(screen.queryByText(message)).toBeNull();

    mockSnapshot = { endFailed: false, disarmFailed: false, lateCancel: false, [flag]: true };
    render(<HomeScreen />);
    expect(screen.getByText(message)).toBeOnTheScreen();
    mockSnapshot = { endFailed: false, disarmFailed: false, lateCancel: false };
  });

  it('styles the wordmark from the theme', () => {
    render(<HomeScreen />);

    expect(screen.getByText('LINKD')).toHaveStyle({
      color: theme.color.accent,
      fontFamily: theme.font.display,
    });
  });
});
