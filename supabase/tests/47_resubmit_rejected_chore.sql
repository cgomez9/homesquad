begin;
select plan(13);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Leo',   3, null);

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Approval', 10, 'approval', '{"type":"daily"}'::jsonb, 'a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Photo',    10, 'photo',    '{"type":"daily"}'::jsonb, 'a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at) values
  ('33333333-aaaa-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', now()),
  ('22222222-aaaa-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- approval chore: pending -> submitted
select lives_ok(
  $$ select public.complete_chore('33333333-aaaa-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333') $$,
  'approval chore submits'
);
select is((select status from public.chore_instances where id = '33333333-aaaa-3333-3333-333333333333'), 'submitted', 'status submitted');

-- parent rejects
select lives_ok(
  $$ select public.reject_chore('33333333-aaaa-3333-3333-333333333333', 'tidy up first') $$,
  'parent rejects submission'
);
select is((select status from public.chore_instances where id = '33333333-aaaa-3333-3333-333333333333'), 'rejected', 'status rejected');
select is((select rejection_reason from public.chore_instances where id = '33333333-aaaa-3333-3333-333333333333'), 'tidy up first', 'rejection_reason recorded');

-- kid re-attempts the rejected chore (the new behaviour)
select lives_ok(
  $$ select public.complete_chore('33333333-aaaa-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333') $$,
  'rejected chore can be resubmitted'
);
select is((select status from public.chore_instances where id = '33333333-aaaa-3333-3333-333333333333'), 'submitted', 'resubmit -> submitted again');
select is((select rejection_reason from public.chore_instances where id = '33333333-aaaa-3333-3333-333333333333'), null, 'rejection_reason cleared on resubmit');

-- parent approves the resubmission: stars awarded exactly once (no double-award)
select lives_ok(
  $$ select public.approve_chore('33333333-aaaa-3333-3333-333333333333') $$,
  'parent approves resubmission'
);
select is(
  (select count(*)::int from public.star_ledger where source_id = '33333333-aaaa-3333-3333-333333333333'),
  1,
  'exactly one star_ledger row — no double award'
);

-- still cannot complete an already-approved instance
prepare complete_approved as
  select public.complete_chore('33333333-aaaa-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333');
select throws_ok('complete_approved', null, null, 'completing an approved instance still raises');

-- photo chore: submit -> reject -> resubmit with a fresh photo
select lives_ok($$
  select public.complete_chore('22222222-aaaa-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333', 'http://x/a.jpg');
  select public.reject_chore('22222222-aaaa-2222-2222-222222222222', 'blurry');
  select public.complete_chore('22222222-aaaa-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333', 'http://x/b.jpg');
$$, 'photo chore can be resubmitted with a new photo');
select is((select status from public.chore_instances where id = '22222222-aaaa-2222-2222-222222222222'), 'submitted', 'photo resubmit -> submitted');

select * from finish();
rollback;
