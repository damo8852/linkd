import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { AddContactScreen } from '../src/features/emergency-contacts/AddContactScreen';
import { CONTACT_FAILURE_MESSAGE, classifyContactError } from '../src/features/emergency-contacts/contactErrors';
import * as contactsModule from '../src/features/emergency-contacts/contacts';
import type { Contact } from '../src/features/emergency-contacts/contactsCache';
import { ContactsScreen } from '../src/features/emergency-contacts/ContactsScreen';

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
// A factory, so the real module (and the native storage behind the client) is never loaded.
jest.mock('../src/features/emergency-contacts/contacts', () => ({
  useContacts: jest.fn(),
  addContact: jest.fn(),
  removeContact: jest.fn(),
}));

const mocked = jest.mocked(contactsModule);
const reload = jest.fn(async () => {});

function contact(n: number, status = 'active'): Contact {
  return { id: `${n}`, name: `Contact ${n}`, phone_e164: `+1213373425${n}`, status };
}

function show(contacts: Contact[], fresh = true): void {
  mocked.useContacts.mockReturnValue({ contacts, loading: false, fresh, reload });
  render(<ContactsScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ContactsScreen', () => {
  it('warns loudly when there are no contacts', () => {
    show([]);

    expect(screen.getByText('0 of 5')).toBeOnTheScreen();
    expect(screen.getByText('No one will be texted if you send an SOS.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add your first contact' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/contacts/add');
  });

  it('lists contacts with formatted numbers and the active count', () => {
    show([contact(1), contact(2)]);

    expect(screen.getByText('2 of 5')).toBeOnTheScreen();
    expect(screen.getByText('Contact 1')).toBeOnTheScreen();
    expect(screen.getByText('+1 213 373 4251')).toBeOnTheScreen();
    expect(screen.queryByText('No one will be texted if you send an SOS.')).toBeNull();
  });

  it('labels an opted-out contact in words, does not count it, and offers no remove', () => {
    show([contact(1), contact(2, 'opted_out')]);

    expect(screen.getByText('1 of 5')).toBeOnTheScreen();
    expect(screen.getByText('Opted out')).toBeOnTheScreen();
    expect(screen.getByText('Contact 2 replied STOP and will not be texted.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Remove Contact 2')).toBeNull();
  });

  it('still warns when the only contacts have opted out', () => {
    show([contact(1, 'opted_out')]);

    expect(screen.getByText('No one will be texted if you send an SOS.')).toBeOnTheScreen();
  });

  it('disables adding at the limit and says why', () => {
    show([1, 2, 3, 4, 5].map((n) => contact(n)));

    expect(screen.getByText('5 of 5')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a contact' })).toBeDisabled();
    expect(screen.getByText(CONTACT_FAILURE_MESSAGE.limit)).toBeOnTheScreen();
  });

  it('says so when the list is the saved copy', () => {
    show([contact(1)], false);

    expect(screen.getByText(/Showing your saved contacts/)).toBeOnTheScreen();
  });

  it('removes a contact only after confirming, and explains a failure', async () => {
    mocked.removeContact.mockResolvedValue({ ok: false, failure: 'network' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    show([contact(1)]);

    fireEvent.press(screen.getByLabelText('Remove Contact 1'));

    expect(mocked.removeContact).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((button) => button.text === 'Remove')?.onPress?.();

    expect(await screen.findByText(CONTACT_FAILURE_MESSAGE.network)).toBeOnTheScreen();
    expect(mocked.removeContact).toHaveBeenCalledWith('1');
    expect(reload).toHaveBeenCalled();
  });
});

describe('AddContactScreen', () => {
  function fillAndSave(phone: string): void {
    fireEvent.changeText(screen.getByLabelText('Name'), 'Jordan');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), phone);
    fireEvent.press(screen.getByRole('button', { name: 'Save contact' }));
  }

  it('rejects an incomplete number without saving', () => {
    render(<AddContactScreen />);

    fillAndSave('555 01');

    expect(screen.getByText(/Enter the full number, with area code/)).toBeOnTheScreen();
    expect(mocked.addContact).not.toHaveBeenCalled();
  });

  it('saves the number normalized to E.164, then goes back', async () => {
    mocked.addContact.mockResolvedValue({ ok: true });
    render(<AddContactScreen />);

    fillAndSave('(213) 373-4253');

    await screen.findByRole('button', { name: 'Save contact', disabled: false });
    expect(mocked.addContact).toHaveBeenCalledWith('Jordan', '+12133734253');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it.each(['limit', 'duplicate', 'network'] as const)('explains a %s failure and stays on the form', async (failure) => {
    mocked.addContact.mockResolvedValue({ ok: false, failure });
    render(<AddContactScreen />);

    fillAndSave('(213) 373-4253');

    expect(await screen.findByText(CONTACT_FAILURE_MESSAGE[failure])).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('classifyContactError', () => {
  // Shapes observed from the local Supabase stack.
  it.each([
    [{ code: '23514', message: 'emergency contact limit reached (max 5 active)' }, 'limit'],
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 'duplicate'],
    [{ code: '', message: 'TypeError: fetch failed' }, 'network'],
    [{ code: '23514', message: 'violates check constraint "emergency_contacts_phone_e164_check"' }, 'unknown'],
  ])('maps %j to %s', (error, failure) => {
    expect(classifyContactError(error)).toBe(failure);
  });
});
