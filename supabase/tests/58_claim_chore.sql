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
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(),                      'pending'),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now() + interval '1 day', 'pending');

set local role authenticated;

-- Kid claims an unassigned chore
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.claim_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid claims unassigned chore');
select is(
  (select assignee_profile_id from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'assignee set to claimer');

-- Race: second claim attempt against the same instance fails
prepare second_claim as select public.claim_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('second_claim', null, 'chore not claimable', 'already-claimed chore rejected with generic error');

-- Parent claims the other unassigned chore for self
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.claim_chore('11111111-bbbb-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent claims unassigned chore for self');

-- Kid session cannot claim as someone else
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
prepare wrong_actor as select public.claim_chore('11111111-bbbb-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111');
select throws_ok('wrong_actor', null, 'kid session may only act as itself', 'kid acting as parent rejected');

select * from finish();
rollback;
