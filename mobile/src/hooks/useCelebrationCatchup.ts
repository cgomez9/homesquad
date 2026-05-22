import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { buildCelebrationQueue } from '../lib/celebrationQueue';
import type { RawApproval, RawAchievement, RawGoal } from '../lib/celebrationQueue';
import { enqueueCelebrations } from '../lib/celebrations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

async function advanceCursor(profileId: string, seenAt: string) {
  await rpc('mark_celebrations_seen', { p_profile_id: profileId, p_seen_at: seenAt });
}

export function useCelebrationCatchup(
  profileId: string | undefined,
  familyId: string | undefined,
) {
  const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;

  // On-mount catch-up.
  useEffect(() => {
    if (!profileId || !familyId) return;
    let cancelled = false;

    (async () => {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('celebrations_seen_at')
        .eq('id', profileId)
        .maybeSingle();

      // Transient failure: do NOT fall through to the null-cursor baseline
      // (that would monotonically eat all missed wins). Retry next mount.
      if (profErr) return;

      const cursor = (prof as { celebrations_seen_at: string | null } | null)?.celebrations_seen_at ?? null;

      // First open since ship → set baseline, replay nothing (design §6.1).
      if (cursor === null) {
        await advanceCursor(profileId, new Date().toISOString());
        return;
      }

      const [appr, achs, gls] = await Promise.all([
        supabase
          .from('chore_instances')
          .select('id, approved_at, chore:chores(title, star_value)')
          .eq('completed_by', profileId)
          .eq('status', 'approved')
          .gt('approved_at', cursor),
        supabase
          .from('achievements')
          .select('id, unlocked_at, achievement_key')
          .eq('profile_id', profileId)
          .gt('unlocked_at', cursor),
        (supabase as any)
          .from('family_goals')
          .select('id, completed_at, title')
          .eq('family_id', familyId)
          .eq('status', 'completed')
          .gt('completed_at', cursor),
      ]);

      const approvals: RawApproval[] = (appr.data ?? []).map((r: any) => ({
        id: r.id, approved_at: r.approved_at,
        title: r.chore?.title ?? 'Chore', stars: r.chore?.star_value ?? 0,
      }));
      const achievements = (achs.data ?? []) as RawAchievement[];
      const goals = (gls.data ?? []) as RawGoal[];

      const provisional = buildCelebrationQueue({
        approvals, achievements, goals, windowStarTotal: 0,
      });
      if (!provisional.maxAt) return;

      // Star total in (cursor, maxAt] for the summary card.
      const { data: ledger } = await supabase
        .from('star_ledger')
        .select('delta')
        .eq('profile_id', profileId)
        .gt('created_at', cursor)
        .lte('created_at', provisional.maxAt);
      const windowStarTotal = (ledger ?? []).reduce(
        (s, r) => s + (r as { delta: number }).delta, 0);

      const { items, maxAt } = buildCelebrationQueue({
        approvals, achievements, goals, windowStarTotal,
      });
      if (cancelled || !maxAt) return;

      enqueueCelebrations(items);
      await advanceCursor(profileId, maxAt);
    })().catch(() => {});

    return () => { cancelled = true; };
  }, [profileId, familyId]);

  // Live: keep the cursor moving while the screen is open so the next
  // mount's catch-up does not re-replay in-session wins. Display of
  // in-session wins is still handled by the existing live paths.
  useEffect(() => {
    if (!profileId || !familyId) return;
    const ch = supabase
      .channel(`celebration-cursor-${profileId}-${channelKey}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chore_instances',
        filter: `completed_by=eq.${profileId}`,
      }, (p) => {
        const n = p.new as { status?: string; approved_at?: string };
        if (n?.status === 'approved' && n.approved_at) {
          advanceCursor(profileId, n.approved_at).catch(() => {});
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'achievements',
        filter: `profile_id=eq.${profileId}`,
      }, (p) => {
        const n = p.new as { unlocked_at?: string };
        if (n?.unlocked_at) advanceCursor(profileId, n.unlocked_at).catch(() => {});
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'family_goals',
        filter: `family_id=eq.${familyId}`,
      }, (p) => {
        const o = p.old as { status?: string };
        const n = p.new as { status?: string; completed_at?: string };
        if (o?.status === 'active' && n?.status === 'completed' && n.completed_at) {
          advanceCursor(profileId, n.completed_at).catch(() => {});
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profileId, familyId]);
}
