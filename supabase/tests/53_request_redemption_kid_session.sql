begin;
select plan(5);

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

insert into public.rewards(id, family_id, title, star_cost, icon_id, active, created_by) values
  ('ee111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ice Cream', 50, 2, true, 'a1111111-1111-1111-1111-111111111111');

-- Give Luna 60 stars
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 60, 'manual_grant');

set local role authenticated;

-- 1. Kid session requests a redemption for themselves: OK
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select isnt(
  public.request_redemption('ee111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222'),
  null,
  'kid session can request redemption for itself'
);

-- Reset to superuser to verify redemption row was created
reset role;
select is(
  (select kid_profile_id from public.redemptions where reward_id = 'ee111111-1111-1111-1111-111111111111' limit 1),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'redemption row created for Luna'
);

-- 2. Kid session cannot request redemption as a sibling
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Give Theo 60 stars so balance is not the rejection reason
set local role postgres;
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', 60, 'manual_grant');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

prepare as_sibling as select public.request_redemption(
  'ee111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333');
select throws_ok('as_sibling', null, null, 'kid session rejected when acting as sibling');

-- 3. Parent session still works (regression check)
-- Balance for Luna already has the earlier redemption row but star_cost not deducted yet (no negative entry).
-- Add stars to Luna so the balance still clears for parent path.
set local role postgres;
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 60, 'manual_grant');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select isnt(
  public.request_redemption('ee111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222'),
  null,
  'parent session still works'
);

-- 4. Authenticated user with no family/device raises (orphan session)
-- Insert a user that has no profile and no kid_device binding.
set local role postgres;
insert into auth.users(id, email) values ('33333333-3333-3333-3333-333333333333', 'orphan@test.com');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
prepare orphan as select public.request_redemption(
  'ee111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('orphan', null, null, 'orphan session with no family raises');

select * from finish();
rollback;
