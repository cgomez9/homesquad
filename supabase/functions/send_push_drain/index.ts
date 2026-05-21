// supabase/functions/send_push_drain/index.ts
// Invoked by drain_push_outbox() via net.http_post once per minute.
// Body: { batch: [ { recipient_id, items: [ { row_id, event_type, payload } ] } ] }
//
// Per recipient: looks up push_token, builds a message (collapsed summary
// if items.length >= 2; per-event template otherwise), POSTs to Expo Push
// API, parses the ticket, calls apply_drain_result(row_id, outcome, error?)
// for each row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Item = { row_id: string; event_type: string; payload: Record<string, unknown> };
type Group = { recipient_id: string; items: Item[] };

const ACHIEVEMENTS: Record<string, { emoji: string; title: string }> = {
  stargazer:    { emoji: '⭐', title: 'Stargazer' },
  stars_100:    { emoji: '💯', title: 'Century' },
  stars_500:    { emoji: '🏆', title: 'High Roller' },
  streak_7:     { emoji: '🔥', title: 'Week Streak' },
  streak_30:    { emoji: '🌟', title: 'Month Streak' },
  first_chore:  { emoji: '✅', title: 'Getting Started' },
  chores_25:    { emoji: '💪', title: 'Quarter Century' },
  first_reward: { emoji: '🎁', title: 'First Reward' },
};

function classifyExpoError(details: { error?: string } | undefined): 'device_not_registered' | 'transient' {
  if (details?.error === 'DeviceNotRegistered') return 'device_not_registered';
  return 'transient';
}

async function formatMessage(
  supabase: ReturnType<typeof createClient>,
  items: Item[],
): Promise<{ title: string; body: string }> {
  if (items.length >= 2) {
    return {
      title: 'Shores',
      body: `${items.length} updates in your family. Tap to review.`,
    };
  }

  const it = items[0];
  const p = it.payload as Record<string, string>;

  if (it.event_type.startsWith('chore_')) {
    const { data } = await supabase
      .from('chore_instances')
      .select('chore_id, completed_by, chores!inner(title), profiles:completed_by(display_name)')
      .eq('id', p.instance_id)
      .single();
    const choreTitle = (data as any)?.chores?.title ?? 'a chore';
    const kidName    = (data as any)?.profiles?.display_name ?? 'A kid';
    if (it.event_type === 'chore_submitted')
      return { title: 'Shores', body: `${kidName} submitted "${choreTitle}" 📸` };
    if (it.event_type === 'chore_approved')
      return { title: 'Shores', body: `Chore approved: "${choreTitle}" ⭐` };
    if (it.event_type === 'chore_rejected')
      return { title: 'Shores', body: `Chore needs rework: "${choreTitle}"` };
  }

  if (it.event_type.startsWith('redemption_')) {
    const { data } = await supabase
      .from('redemptions')
      .select('reward_id, profile_id, rewards!inner(title), profiles:profile_id(display_name)')
      .eq('id', p.redemption_id)
      .single();
    const rewardTitle = (data as any)?.rewards?.title ?? 'a reward';
    const kidName     = (data as any)?.profiles?.display_name ?? 'A kid';
    if (it.event_type === 'redemption_requested')
      return { title: 'Shores', body: `${kidName} requested "${rewardTitle}" 🎁` };
    if (it.event_type === 'redemption_approved')
      return { title: 'Shores', body: `Reward approved: "${rewardTitle}"` };
    if (it.event_type === 'redemption_denied')
      return { title: 'Shores', body: `Reward denied: "${rewardTitle}"` };
    if (it.event_type === 'redemption_fulfilled')
      return { title: 'Shores', body: `Reward delivered: "${rewardTitle}" ✨` };
  }

  if (it.event_type === 'achievement_unlocked') {
    const meta = ACHIEVEMENTS[p.achievement_key as string];
    if (meta) return { title: 'Shores', body: `${meta.emoji} ${meta.title} unlocked!` };
    return { title: 'Shores', body: 'New badge unlocked!' };
  }

  if (it.event_type === 'streak_milestone') {
    return {
      title: 'Shores',
      body: `${p.kid_name} hit a ${p.streak_days}-day streak! 🔥`,
    };
  }

  if (it.event_type === 'goal_completed') {
    return {
      title: 'Shores',
      body: `Family goal reached: ${p.goal_title} 🎉`,
    };
  }

  return { title: 'Shores', body: 'New activity in your family.' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { batch } = (await req.json()) as { batch: Group[] };

  for (const group of batch) {
    // Resolve token.
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', group.recipient_id)
      .single();
    const token = profile?.push_token as string | null;

    if (!token) {
      for (const it of group.items) {
        await supabase.rpc('apply_drain_result', {
          p_row_id: it.row_id, p_outcome: 'device_not_registered',
          p_error: 'no token at drain time',
        });
      }
      continue;
    }

    const message = await formatMessage(supabase, group.items);

    let ticket: any;
    try {
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ to: token, sound: 'default', title: message.title, body: message.body }),
      });
      const json = await resp.json();
      ticket = Array.isArray(json.data) ? json.data[0] : json.data;
    } catch (e) {
      for (const it of group.items) {
        await supabase.rpc('apply_drain_result', {
          p_row_id: it.row_id, p_outcome: 'transient',
          p_error: `fetch: ${(e as Error).message}`,
        });
      }
      continue;
    }

    let outcome: 'ok' | 'transient' | 'device_not_registered';
    let errMsg: string | null = null;
    if (ticket?.status === 'ok') {
      outcome = 'ok';
    } else {
      outcome = classifyExpoError(ticket?.details);
      errMsg = ticket?.message ?? JSON.stringify(ticket);
    }

    for (const it of group.items) {
      await supabase.rpc('apply_drain_result', {
        p_row_id: it.row_id, p_outcome: outcome, p_error: errMsg,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
