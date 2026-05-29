begin;
select plan(7);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Leo',   3, null);

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Auto',     10, 'auto',     '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Photo',    10, 'photo',    '{"type":"daily"}'::jsonb, null,                                   'a1111111-1111-1111-1111-111111111111'),
  ('c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Approval', 10, 'approval', '{"type":"daily"}'::jsonb, 'a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now()),
  ('22222222-aaaa-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,                                   now()),
  ('33333333-aaaa-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.complete_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'auto chore completes'
);
select is((select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'approved', 'auto status approved');

prepare photo_no_url as select public.complete_chore('22222222-aaaa-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('photo_no_url', null, null, 'photo without URL raises');

select lives_ok(
  $$ select public.complete_chore('22222222-aaaa-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'http://x/y.jpg') $$,
  'photo chore submits with URL'
);
select is((select status from public.chore_instances where id = '22222222-aaaa-2222-2222-222222222222'), 'finished', 'photo status finished');

prepare wrong_kid as select public.complete_chore('33333333-aaaa-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('wrong_kid', null, null, 'wrong assignee raises');

select lives_ok(
  $$ select public.complete_chore('33333333-aaaa-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333') $$,
  'approval chore submits with correct kid'
);

select * from finish();
rollback;
