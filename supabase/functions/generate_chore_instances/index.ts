import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const MAX_BACKFILL_PER_CHORE = 14;

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: chores, error } = await supabase
    .from('chores')
    .select('id, family_id, assignee_profile_id, recurrence, next_due_at')
    .eq('active', true)
    .not('next_due_at', 'is', null)
    .lte('next_due_at', cutoff);
  if (error) return new Response(error.message, { status: 500 });

  let totalInserted = 0;
  for (const chore of chores ?? []) {
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

      const { data: rpcData, error: rpcErr } = await supabase.rpc('next_occurrence', {
        rec: chore.recurrence,
        after: nextDue,
      });
      if (rpcErr) return new Response(`next_occurrence failed: ${rpcErr.message}`, { status: 500 });
      nextDue = rpcData as string | null;
      iter++;
    }

    await supabase.from('chores').update({ next_due_at: nextDue }).eq('id', chore.id);
  }

  return new Response(JSON.stringify({ inserted: totalInserted, chores: chores?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
