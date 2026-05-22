import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const MAX_BACKFILL_PER_CHORE = 14;
const REMINDER_LEAD_MINUTES = 10;

type ChoreRow = {
  id: string;
  family_id: string;
  assignee_profile_id: string | null;
  recurrence: { type: string; times?: string[] } & Record<string, unknown>;
  next_due_at: string;
  family: { timezone: string } | null;
};

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: chores, error } = await supabase
    .from('chores')
    .select('id, family_id, assignee_profile_id, recurrence, next_due_at, family:families(timezone)')
    .eq('active', true)
    .not('next_due_at', 'is', null)
    .lte('next_due_at', cutoff);
  if (error) return new Response(error.message, { status: 500 });

  let totalInserted = 0;
  let totalReminders = 0;
  for (const chore of (chores ?? []) as unknown as ChoreRow[]) {
    const tz = chore.family?.timezone ?? 'UTC';
    const hasTimes = Array.isArray(chore.recurrence?.times) && chore.recurrence.times.length > 0;
    let nextDue: string | null = chore.next_due_at;
    let iter = 0;
    while (nextDue && new Date(nextDue) <= new Date(cutoff) && iter < MAX_BACKFILL_PER_CHORE) {
      const { error: insErr } = await supabase
        .from('chore_instances')
        .insert({
          chore_id: chore.id,
          family_id: chore.family_id,
          assignee_profile_id: chore.assignee_profile_id,
          due_at: nextDue,
        });
      if (insErr && !insErr.message.includes('duplicate key')) {
        return new Response(`insert failed: ${insErr.message}`, { status: 500 });
      }
      if (!insErr) totalInserted++;

      if (hasTimes && chore.assignee_profile_id) {
        const enqueued = await enqueueReminder(
          supabase, chore.family_id, chore.assignee_profile_id, nextDue, chore.id,
        );
        totalReminders += enqueued;
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('next_occurrence', {
        rec: chore.recurrence,
        after: nextDue,
        family_tz: tz,
      });
      if (rpcErr) return new Response(`next_occurrence failed: ${rpcErr.message}`, { status: 500 });
      nextDue = rpcData as string | null;
      iter++;
    }

    await supabase.from('chores').update({ next_due_at: nextDue }).eq('id', chore.id);
  }

  return new Response(JSON.stringify({
    inserted: totalInserted,
    reminders: totalReminders,
    chores: chores?.length ?? 0,
  }), { headers: { 'Content-Type': 'application/json' } });
});

async function enqueueReminder(
  supabase: ReturnType<typeof createClient>,
  familyId: string,
  kidProfileId: string,
  dueAt: string,
  choreId: string,
): Promise<number> {
  const reminderAt = new Date(new Date(dueAt).getTime() - REMINDER_LEAD_MINUTES * 60 * 1000).toISOString();

  // Idempotency: skip if a pending reminder already exists for this
  // (chore_id, due_at). Re-running the materializer must not duplicate.
  const { data: existing } = await supabase
    .from('push_outbox')
    .select('id')
    .eq('event_type', 'chore_reminder')
    .eq('status', 'pending')
    .filter('payload->>chore_id', 'eq', choreId)
    .filter('payload->>due_at', 'eq', dueAt)
    .limit(1)
    .maybeSingle();
  if (existing) return 0;

  // Resolve recipient — kid first if they have a token + pref allows;
  // otherwise fan out to all parents with token + pref.
  const { data: kid } = await supabase
    .from('profiles')
    .select('push_token, push_prefs')
    .eq('id', kidProfileId)
    .single();
  const kidPushPrefs = (kid?.push_prefs as Record<string, boolean> | null) ?? {};
  const kidAllowed = (kid as { push_token?: string | null } | null)?.push_token
    && kidPushPrefs.chore_reminder !== false;

  const recipients: { recipient_id: string }[] = [];
  if (kidAllowed) {
    recipients.push({ recipient_id: kidProfileId });
  } else {
    const { data: parents } = await supabase
      .from('profiles')
      .select('id, push_token, push_prefs')
      .eq('family_id', familyId)
      .eq('type', 'parent');
    for (const p of (parents ?? []) as Array<{ id: string; push_token: string | null; push_prefs: Record<string, boolean> | null }>) {
      const prefs = p.push_prefs ?? {};
      if (p.push_token && prefs.chore_reminder !== false) {
        recipients.push({ recipient_id: p.id });
      }
    }
  }
  if (recipients.length === 0) return 0;

  const rows = recipients.map((r) => ({
    family_id: familyId,
    recipient_id: r.recipient_id,
    event_type: 'chore_reminder',
    payload: { chore_id: choreId, kid_profile_id: kidProfileId, due_at: dueAt },
    scheduled_for: reminderAt,
  }));
  const { error } = await supabase.from('push_outbox').insert(rows);
  if (error) return 0;
  return rows.length;
}
