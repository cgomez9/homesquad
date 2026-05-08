import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// To run: in one terminal `npx supabase functions serve generate_chore_instances --no-verify-jwt`,
// in another `deno test --allow-net --allow-env supabase/functions/generate_chore_instances/test.ts`
// with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_URL = `${SUPABASE_URL}/functions/v1/generate_chore_instances`;

Deno.test('generates one instance per overdue chore (idempotent)', async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const familyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await supabase.from('families').insert({ id: familyId, name: 'TestFam' });
  await supabase.auth.admin.createUser({ id: userId, email: `${userId}@test.com`, password: 'x' });
  const { data: parent } = await supabase
    .from('profiles')
    .insert({ family_id: familyId, type: 'parent', display_name: 'P', avatar_id: 1, user_id: userId })
    .select('id').single();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase.from('chores').insert({
    family_id: familyId, title: 'X', star_value: 10, verification_mode: 'auto',
    recurrence: { type: 'daily' }, next_due_at: past, created_by: parent!.id,
  });

  const r1 = await fetch(FN_URL, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
  assertEquals(r1.status, 200);
  const j1 = await r1.json();
  if (j1.inserted < 1) throw new Error(`expected at least 1 insert, got ${j1.inserted}`);

  const r2 = await fetch(FN_URL, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
  const j2 = await r2.json();
  assertEquals(j2.inserted, 0);

  await supabase.from('families').delete().eq('id', familyId);
  await supabase.auth.admin.deleteUser(userId);
});
