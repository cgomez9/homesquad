import { supabase } from './supabase';

export async function claimChore(instanceId: string, actorProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message);
}

export async function releaseChore(instanceId: string, actorProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('release_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message);
}

export async function startChore(instanceId: string, actorProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('start_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message);
}

export async function finishChore(
  instanceId: string,
  actorProfileId: string,
  photoUrl: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('finish_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
    photo_url: photoUrl,
  });
  if (error) throw new Error(error.message);
}
