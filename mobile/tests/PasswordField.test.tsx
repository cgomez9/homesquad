jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { render, fireEvent } from '@testing-library/react-native';
import { PasswordField } from '../src/components/PasswordField';

describe('PasswordField', () => {
  it('renders with secureTextEntry true by default', () => {
    const { getByTestId } = render(<PasswordField label="Password" value="" onChangeText={() => {}} />);
    const input = getByTestId('password-input');
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('flips secureTextEntry when eye is tapped', () => {
    const { getByTestId } = render(<PasswordField label="Password" value="hello" onChangeText={() => {}} />);
    const input = getByTestId('password-input');
    const eye = getByTestId('password-toggle');

    expect(input.props.secureTextEntry).toBe(true);
    fireEvent.press(eye);
    expect(input.props.secureTextEntry).toBe(false);
    fireEvent.press(eye);
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('opts out of iOS AutoFill / Automatic Strong Passwords, even if a caller passes an autofill hint', () => {
    // iOS was tinting the whole credential form yellow and locking the fields
    // (Automatic Strong Passwords). Force the autofill-off props so no caller
    // hint (e.g. autoComplete="new-password") can re-enable the takeover.
    const { getByTestId } = render(
      <PasswordField label="Password" value="" onChangeText={() => {}} autoComplete="new-password" />,
    );
    const input = getByTestId('password-input');
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.textContentType).toBe('none');
    expect(input.props.importantForAutofill).toBe('no');
  });

  it('renders strength meter when showStrength is true', () => {
    const { queryByTestId, rerender } = render(<PasswordField label="Password" value="" onChangeText={() => {}} showStrength />);
    expect(queryByTestId('password-strength-bar')).toBeNull();
    rerender(<PasswordField label="Password" value="hello123" onChangeText={() => {}} showStrength />);
    expect(queryByTestId('password-strength-bar')).not.toBeNull();
  });

  it('does NOT render strength meter when showStrength is false', () => {
    const { queryByTestId } = render(<PasswordField label="Password" value="hello123" onChangeText={() => {}} />);
    expect(queryByTestId('password-strength-bar')).toBeNull();
  });
});
