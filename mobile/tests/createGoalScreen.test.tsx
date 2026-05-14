import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CreateGoalScreen from '../app/(app)/parent/goals/create';

const mockRpc = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: { rpc: (...args: any[]) => mockRpc(...args) },
}));
jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

describe('CreateGoalScreen', () => {
  beforeEach(() => mockRpc.mockReset());

  it('submits create_family_goal with form values', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'g1' }, error: null });
    const { getByTestId } = render(<CreateGoalScreen />);
    fireEvent.changeText(getByTestId('goal-title-input'), 'Pizza');
    fireEvent.changeText(getByTestId('goal-target-input'), '100');
    fireEvent.press(getByTestId('goal-create-button'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('create_family_goal', {
      p_title: 'Pizza', p_target_stars: 100, p_description: null,
    }));
  });

  it('renders alreadyActive copy when RPC returns that error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'already_active' } });
    const { getByTestId, findByText } = render(<CreateGoalScreen />);
    fireEvent.changeText(getByTestId('goal-title-input'), 'Pizza');
    fireEvent.changeText(getByTestId('goal-target-input'), '100');
    fireEvent.press(getByTestId('goal-create-button'));
    expect(await findByText('goals.errors.alreadyActive')).toBeTruthy();
  });

  it('disables the button when title is empty', () => {
    const { getByTestId } = render(<CreateGoalScreen />);
    expect(getByTestId('goal-create-button').props.accessibilityState?.disabled).toBe(true);
  });
});
