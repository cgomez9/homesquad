import { on, emit } from '../src/lib/events';

describe('event bus', () => {
  it('delivers payload to subscriber', () => {
    const handler = jest.fn();
    const unsub = on('achievement_unlocked', handler);
    emit('achievement_unlocked', { key: 'first_star', profile_id: 'p1' });
    expect(handler).toHaveBeenCalledWith({ key: 'first_star', profile_id: 'p1' });
    unsub();
  });

  it('unsubscribe removes the listener', () => {
    const handler = jest.fn();
    const unsub = on('achievement_unlocked', handler);
    unsub();
    emit('achievement_unlocked', { key: 'first_star', profile_id: 'p1' });
    expect(handler).not.toHaveBeenCalled();
  });
});
