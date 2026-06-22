import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChoreCard, type ChoreCardInstance } from '../src/components/ChoreCard';

const baseInst: ChoreCardInstance = {
  id: 'inst-1',
  status: 'pending',
  assignee_profile_id: null,
  due_at: '2026-05-29T10:00:00Z',
  chore: { id: 'c1', title: 'Vacuum', kind: 'chore', star_value: 10, token_value: null, current_skill_streak: 0, verification_mode: 'approval', recurrence: null },
  assignee: null,
  rejection_reason: null,
};

describe('ChoreCard', () => {
  it('renders Claim button when unassigned', () => {
    const onAction = jest.fn();
    const { getByTestId } = render(<ChoreCard inst={baseInst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-claim'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'claim', instanceId: 'inst-1' });
  });

  it('renders Start + Release when assigned to me and pending', () => {
    const onAction = jest.fn();
    const inst = { ...baseInst, assignee_profile_id: 'actor-1' };
    const { getByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-start'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'start', instanceId: 'inst-1' });
    fireEvent.press(getByTestId('action-release'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'release', instanceId: 'inst-1' });
  });

  it('renders Finish when assigned to me and started', () => {
    const onAction = jest.fn();
    const inst = { ...baseInst, assignee_profile_id: 'actor-1', status: 'started' as const };
    const { getByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-finish'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'finish', instanceId: 'inst-1' });
  });

  it('renders read-only with assignee name when held by another', () => {
    const inst = { ...baseInst, assignee_profile_id: 'actor-2', status: 'started' as const, assignee: { id: 'actor-2', display_name: 'Theo', avatar_id: 3 } };
    const { getByText, queryByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={() => {}} />);
    expect(getByText(/Theo/)).toBeTruthy();
    expect(queryByTestId('action-claim')).toBeNull();
    expect(queryByTestId('action-start')).toBeNull();
    expect(queryByTestId('action-finish')).toBeNull();
  });

  it('renders Start (re-attempt) when rejected and mine', () => {
    const onAction = jest.fn();
    const inst = { ...baseInst, assignee_profile_id: 'actor-1', status: 'rejected' as const, rejection_reason: 'try again' };
    const { getByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-start'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'start', instanceId: 'inst-1' });
  });
});
