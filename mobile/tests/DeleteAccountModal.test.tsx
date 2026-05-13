jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => {
    const map: Record<string, string> = {
      'deleteModal.title': 'Delete your account?',
      'deleteModal.body': 'This permanently deletes your account.',
      'deleteModal.typeDelete': 'Type DELETE to confirm:',
      'deleteModal.cancel': 'Cancel',
      'deleteModal.confirm': 'Delete forever',
    };
    return map[key] ?? key;
  } }),
}));

import { render, fireEvent } from '@testing-library/react-native';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';

describe('DeleteAccountModal', () => {
  it('renders title and confirmation field', () => {
    const { getByText, getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={jest.fn()} loading={false} />
    );
    expect(getByText('Delete your account?')).toBeTruthy();
    expect(getByTestId('delete-confirm-input')).toBeTruthy();
  });

  it('disables Delete button until DELETE is typed exactly', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={onConfirm} loading={false} />
    );
    const input = getByTestId('delete-confirm-input');
    const button = getByTestId('delete-confirm-button');

    fireEvent.press(button);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(input, 'delete');
    fireEvent.press(button);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(input, 'DELETE');
    fireEvent.press(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel pressed', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={onCancel} onConfirm={jest.fn()} loading={false} />
    );
    fireEvent.press(getByTestId('delete-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator when loading=true', () => {
    const { getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={jest.fn()} loading={true} />
    );
    expect(getByTestId('delete-loading')).toBeTruthy();
  });

  it('surfaces error prop in modal body', () => {
    const { getByText } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={jest.fn()} loading={false} error="Could not delete: network error" />
    );
    expect(getByText('Could not delete: network error')).toBeTruthy();
  });
});
