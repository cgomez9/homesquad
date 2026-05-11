import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireSmallFeedback, isEnabled } from '../src/lib/feedback';

jest.mock('expo-haptics');
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn().mockReturnValue({ play: jest.fn(), remove: jest.fn() }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('feedback', () => {
  beforeEach(() => jest.clearAllMocks());

  it('isEnabled returns true when AsyncStorage value is null (default)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await expect(isEnabled()).resolves.toBe(true);
  });

  it('isEnabled returns false when AsyncStorage value is "false"', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
    await expect(isEnabled()).resolves.toBe(false);
  });

  it('fireSmallFeedback calls Haptics.impactAsync(Light) when enabled', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await fireSmallFeedback();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('fireSmallFeedback does NOT call Haptics when disabled', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
    await fireSmallFeedback();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
