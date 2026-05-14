-- supabase/tests/39_set_push_pref_rpc.sql
begin;

select plan(4);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'parent@test.local');
insert into public.families (id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Family');
insert into public.profiles (id, family_id, type, display_name, avatar_id, user_id)
  values ('33333333-3333-3333-3333-333333333333',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Parent', 1,
          '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Setting a pref returns the updated jsonb.
select is(
  (select set_push_pref('chore_submitted', false)),
  '{"chore_submitted": false}'::jsonb,
  'returns updated prefs');

-- 2. Second call merges instead of replacing.
select is(
  (select set_push_pref('redemption_requested', false)),
  '{"chore_submitted": false, "redemption_requested": false}'::jsonb,
  'second call merges keys');

-- 3. Re-enabling flips the value.
select is(
  (select set_push_pref('chore_submitted', true)),
  '{"chore_submitted": true, "redemption_requested": false}'::jsonb,
  're-enable flips the boolean');

-- 4. Anonymous rejected.
reset role;
set local "request.jwt.claims" to '{}';
select throws_ok(
  $$ select set_push_pref('chore_submitted', false) $$,
  NULL, NULL,
  'anonymous rejected');

select * from finish();
rollback;
