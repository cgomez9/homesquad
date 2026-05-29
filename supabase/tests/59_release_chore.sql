begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111');

-- Three instances: kid-pending, kid-started, parent-pending. Distinct due_at to satisfy unique(chore_id, due_at).
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, started_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(),                       'pending',  null),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now() + interval '1 day',  'started',  now()),
  ('11111111-cccc-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now() + interval '2 days', 'pending',  null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Kid releases own pending chore
select lives_ok(
  $$ select public.release_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid releases own pending chore');
select is(
  (select assignee_profile_id from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  null::uuid, 'assignee cleared');

-- Cannot release a started chore
prepare started_release as select public.release_chore('11111111-bbbb-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('started_release', null, 'chore not releasable', 'cannot release started chore');

-- Cannot release someone else's chore
prepare wrong_actor as select public.release_chore('11111111-cccc-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('wrong_actor', null, 'chore not releasable', 'cannot release another actor''s chore');

select * from finish();
rollback;
