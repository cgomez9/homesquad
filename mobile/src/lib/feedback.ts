import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer } from 'expo-audio';

const STORAGE_KEY = 'feedback_enabled';

// Lazy module-level players (created on first use)
let clickPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let chimePlayer: ReturnType<typeof createAudioPlayer> | null = null;

function getClickPlayer() {
  if (!clickPlayer) clickPlayer = createAudioPlayer(require('../../assets/sounds/click.mp3'));
  return clickPlayer;
}
function getChimePlayer() {
  if (!chimePlayer) chimePlayer = createAudioPlayer(require('../../assets/sounds/chime.mp3'));
  return chimePlayer;
}

export async function isEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  return v !== 'false'; // default true
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

// Module-level confetti fire — set by ConfettiHost (Task 13).
let confettiFire: (() => void) | null = null;
export function setConfettiFire(fn: () => void) { confettiFire = fn; }

export async function fireSmallFeedback(): Promise<void> {
  if (!(await isEnabled())) return;
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  try { getClickPlayer().play(); } catch {}
}

export async function fireBigFeedback(): Promise<void> {
  if (!(await isEnabled())) return;
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
  try { getChimePlayer().play(); } catch {}
  try { confettiFire?.(); } catch {}
}

export const fireAchievementFeedback = fireBigFeedback;
