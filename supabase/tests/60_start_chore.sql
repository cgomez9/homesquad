begin;
select plan(5);

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
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, rejection_reason) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(),                       'pending',  null),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now() + interval '1 day',  'rejected', 'try again'),
  ('11111111-cccc-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now() + interval '2 days', 'pending',  null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Start a pending chore -> status=started, rejection cleared
select lives_ok(
  $$ select public.start_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'starting a pending chore');
select is(
  (select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'started', 'status flipped to started');

-- Re-start from rejected
select lives_ok(
  $$ select public.start_chore('11111111-bbbb-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'restarting a rejected chore');
select is(
  (select rejection_reason from public.chore_instances where id = '11111111-bbbb-1111-1111-111111111111'),
  null::text, 'rejection_reason cleared on restart');

-- Cannot start someone else's chore
prepare wrong_actor as select public.start_chore('11111111-cccc-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('wrong_actor', null, 'chore not startable', 'cannot start another actor''s chore');

select * from finish();
rollback;
