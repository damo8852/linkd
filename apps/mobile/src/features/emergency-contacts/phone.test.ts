import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['(213) 373-4253', '+12133734253'],
    ['213 373 4253', '+12133734253'],
    ['1-213-373-4253', '+12133734253'],
    ['+1 213 373 4253', '+12133734253'],
    ['+44 7400 123456', '+447400123456'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ['an incomplete number', '555 01'],
    ['an empty string', ''],
    ['letters', 'call me'],
    ['too many digits', '213 373 4253 99'],
    ['a foreign national number without a country code', '07400 123456'],
    ['a US number with an impossible area code', '013 373 4253'],
  ])('rejects %s', (_label, input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('only returns numbers the database accepts', () => {
    expect(normalizePhone('(213) 373-4253')).toMatch(/^\+[1-9][0-9]{1,14}$/);
  });
});
