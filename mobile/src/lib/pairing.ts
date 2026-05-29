import * as Device from 'expo-device';
import { supabase } from './supabase';

export type PairingCode = { code: string; expiresAt: Date };

export async function startDevicePairing(kidId: string): Promise<PairingCode> {
  const { data, error } = await supabase.rpc('start_device_pairing', { target_kid_id: kidId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { code: row.code, expiresAt: new Date(row.expires_at) };
}

export async function redeemPairingCode(code: string): Promise<string> {
  const deviceName = Device.deviceName ?? 'Kid device';
  const { data, error } = await supabase.rpc('redeem_device_pairing', {
    pair_code: code,
    device_name: deviceName,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function revokeKidDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_kid_device', { device_id: deviceId });
  if (error) throw new Error(error.message);
}

export async function signInAnonymouslyAndPair(code: string): Promise<string> {
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw new Error(signInError.message);
  return redeemPairingCode(code);
}
