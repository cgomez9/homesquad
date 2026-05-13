import { isAcceptable } from '../src/components/PasswordStrengthMeter';

describe('isAcceptable', () => {
  it('rejects empty string', () => {
    expect(isAcceptable('')).toBe(false);
  });

  it('rejects passwords shorter than 8', () => {
    expect(isAcceptable('short1!')).toBe(false);
  });

  it('rejects common easily-guessed passwords', () => {
    expect(isAcceptable('password')).toBe(false);
    expect(isAcceptable('password123')).toBe(false);
  });

  it('rejects low-entropy repetition', () => {
    expect(isAcceptable('a'.repeat(100))).toBe(false);
  });

  it('accepts a passphrase with sufficient entropy', () => {
    expect(isAcceptable('correcthorsebattery')).toBe(true);
  });

  it('accepts a long mixed-character password', () => {
    expect(isAcceptable('Tr0ub4dor&3xtra!')).toBe(true);
  });
});
