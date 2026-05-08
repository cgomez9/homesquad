begin;
select plan(11);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 10, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B', 15, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now()),
  ('22222222-aaaa-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Happy path.
select lives_ok(
  $$ select public.approve_chore('11111111-aaaa-1111-1111-111111111111') $$,
  'first approve_chore call succeeds'
);

-- 2-3. Status flipped to approved with snapshot fields populated.
select is((select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'approved', 'status approved');
select is((select stars_awarded from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 10, 'stars_awarded snapshot');

-- 4. Ledger row created.
select is(
  (select count(*)::int from public.star_ledger
    where source_id = '11111111-aaaa-1111-1111-111111111111' and reason = 'chore_approved'),
  1, 'one ledger row inserted'
);

-- 5. Streak created.
select is(
  (select current_count from public.streaks where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  1, 'streak current_count = 1 after first approval'
);

-- 6-7. Idempotent re-call.
select lives_ok(
  $$ select public.approve_chore('11111111-aaaa-1111-1111-111111111111') $$,
  'idempotent re-call'
);
select is(
  (select count(*)::int from public.star_ledger where source_id = '11111111-aaaa-1111-1111-111111111111'),
  1, 'still only one ledger row after re-call'
);

-- 8-9. Same-day approve of a different chore: streak unchanged.
select lives_ok(
  $$ select public.approve_chore('22222222-aaaa-2222-2222-222222222222') $$,
  'same-day second approval'
);
select is(
  (select current_count from public.streaks where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  1, 'streak unchanged on same-day double-approve'
);

-- 10-11. Consecutive-day bump: backdate yesterday, then approve a fresh instance.
-- Data manipulation must run as postgres (no mutation RLS policies on streaks/chore_instances).
set local role postgres;
update public.streaks set last_completion_date = current_date - 1 where profile_id = 'a2222222-2222-2222-2222-222222222222';
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at) values
  ('33333333-aaaa-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now() + interval '1 day', 'submitted', 'a2222222-2222-2222-2222-222222222222', now());
set local role authenticated;
select lives_ok(
  $$ select public.approve_chore('33333333-aaaa-3333-3333-333333333333') $$,
  'consecutive-day approval'
);
select is(
  (select current_count from public.streaks where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  2, 'streak bumped to 2 after consecutive day'
);

select * from finish();
rollback;
