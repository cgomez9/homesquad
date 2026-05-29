begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);  -- kid anon

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P',    1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Luna', 2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Theo', 3, null);

insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'LunaPhone');

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Brush teeth', 5, 'auto', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now()),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now() + interval '1 day');

set local role authenticated;

-- Kid session completes a chore assigned to themselves: OK
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.complete_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid session completes own chore'
);

-- Reset to superuser to bypass RLS for the side-effect check
reset role;
select is(
  (select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'approved', 'auto chore status approved');

-- Kid session cannot complete chore as a sibling
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
prepare as_sibling as select public.complete_chore('11111111-bbbb-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333');
select throws_ok('as_sibling', null, null, 'kid session rejected when acting as sibling');

-- Parent session still works (regression check)
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.complete_chore('11111111-bbbb-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'parent session still works');

select * from finish();
rollback;
