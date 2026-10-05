import { fireEvent, render, screen } from '@testing-library/react-native';

import * as auth from '../src/features/auth/auth';
import { AUTH_FAILURE_MESSAGE } from '../src/features/auth/authErrors';
import { ResetPasswordScreen } from '../src/features/auth/ResetPasswordScreen';
import { SignInScreen } from '../src/features/auth/SignInScreen';
import { SignUpScreen } from '../src/features/auth/SignUpScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
// A factory, so the real module (and the native storage behind the client) is never loaded.
jest.mock('../src/features/auth/auth', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  requestPasswordReset: jest.fn(),
  verifyResetCode: jest.fn(),
  setNewPassword: jest.fn(),
}));

const mocked = jest.mocked(auth);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SignInScreen', () => {
  function fillAndSubmit(): void {
    fireEvent.changeText(screen.getByLabelText('Email'), ' ana@example.com ');
    fireEvent.changeText(screen.getByLabelText('Password'), 'hunter22!');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('signs in with the trimmed email', async () => {
    mocked.signIn.mockResolvedValue({ ok: true });
    render(<SignInScreen />);

    fillAndSubmit();

    expect(mocked.signIn).toHaveBeenCalledWith('ana@example.com', 'hunter22!');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['invalid_credentials', 'email_not_confirmed', 'network'] as const)(
    'explains a %s failure',
    async (failure) => {
      mocked.signIn.mockResolvedValue({ ok: false, failure });
      render(<SignInScreen />);

      fillAndSubmit();

      expect(await screen.findByText(AUTH_FAILURE_MESSAGE[failure])).toBeOnTheScreen();
    },
  );

  it('links to password reset and sign-up', () => {
    render(<SignInScreen />);

    fireEvent.press(screen.getByText('Reset my password'));
    fireEvent.press(screen.getByText('Create an account'));

    expect(mockRouter.push).toHaveBeenCalledWith('/reset-password');
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-up');
  });
});

describe('SignUpScreen', () => {
  function fillAndSubmit(password: string): void {
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), password);
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  }

  it('rejects a short password without calling the server', () => {
    render(<SignUpScreen />);

    fillAndSubmit('short');

    expect(screen.getByText(AUTH_FAILURE_MESSAGE.weak_password)).toBeOnTheScreen();
    expect(mocked.signUp).not.toHaveBeenCalled();
  });

  it('tells the user to confirm their email when the project requires it', async () => {
    mocked.signUp.mockResolvedValue({ ok: true, needsConfirmation: true });
    render(<SignUpScreen />);

    fillAndSubmit('hunter22!');

    expect(await screen.findByText(/Check your email/)).toBeOnTheScreen();
  });

  it('explains a network failure', async () => {
    mocked.signUp.mockResolvedValue({ ok: false, failure: 'network' });
    render(<SignUpScreen />);

    fillAndSubmit('hunter22!');

    expect(await screen.findByText(AUTH_FAILURE_MESSAGE.network)).toBeOnTheScreen();
  });
});

describe('ResetPasswordScreen', () => {
  async function requestCode(): Promise<void> {
    mocked.requestPasswordReset.mockResolvedValue({ ok: true });
    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByLabelText('6-digit code');
  }

  function fillAndSave(): void {
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    fireEvent.changeText(screen.getByLabelText('New password'), 'hunter22!');
    fireEvent.press(screen.getByRole('button', { name: 'Save new password' }));
  }

  it('explains a network failure when requesting the code', async () => {
    mocked.requestPasswordReset.mockResolvedValue({ ok: false, failure: 'network' });
    render(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));

    expect(await screen.findByText(AUTH_FAILURE_MESSAGE.network)).toBeOnTheScreen();
  });

  it('verifies the code, sets the password, then goes home', async () => {
    mocked.verifyResetCode.mockResolvedValue({ ok: true });
    mocked.setNewPassword.mockResolvedValue({ ok: true });
    render(<ResetPasswordScreen />);
    await requestCode();

    fillAndSave();

    await screen.findByRole('button', { name: 'Save new password', disabled: false });
    expect(mocked.verifyResetCode).toHaveBeenCalledWith('ana@example.com', '123456');
    expect(mocked.setNewPassword).toHaveBeenCalledWith('hunter22!');
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('explains a wrong code and does not set the password', async () => {
    mocked.verifyResetCode.mockResolvedValue({ ok: false, failure: 'invalid_code' });
    render(<ResetPasswordScreen />);
    await requestCode();

    fillAndSave();

    expect(await screen.findByText(AUTH_FAILURE_MESSAGE.invalid_code)).toBeOnTheScreen();
    expect(mocked.setNewPassword).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('does not reuse the single-use code when only saving the password failed', async () => {
    mocked.verifyResetCode.mockResolvedValue({ ok: true });
    mocked.setNewPassword.mockResolvedValueOnce({ ok: false, failure: 'network' }).mockResolvedValue({ ok: true });
    render(<ResetPasswordScreen />);
    await requestCode();

    fillAndSave();
    await screen.findByText(AUTH_FAILURE_MESSAGE.network);
    fireEvent.press(screen.getByRole('button', { name: 'Save new password' }));
    await screen.findByRole('button', { name: 'Save new password', disabled: false });

    expect(mocked.verifyResetCode).toHaveBeenCalledTimes(1);
    expect(mocked.setNewPassword).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
