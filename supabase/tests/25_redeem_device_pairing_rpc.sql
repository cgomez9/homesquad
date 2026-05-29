-- supabase/tests/25_redeem_device_pairing_rpc.sql
begin;
select plan(7);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),  -- anon kid 1
  ('33333333-3333-3333-3333-333333333333', null),  -- anon kid 2 (for "second redeem fails")
  ('44444444-4444-4444-4444-444444444444', null);  -- anon kid 3 (for idempotent retry)

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);

-- Seed three codes: valid, expired, used
insert into public.kid_pairing_codes(code, kid_id, family_id, issued_by, expires_at, used_at) values
  ('111111', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() + interval '5 minutes', null),
  ('222222', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() - interval '1 minute',  null),
  ('333333', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() + interval '5 minutes', now());

set local role authenticated;

-- Happy path: anon kid 1 redeems 111111
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.redeem_device_pairing('111111', 'KidPhone') $$,
  'valid code redeems'
);
select is(
  (select kid_id from public.kid_devices where user_id = '22222222-2222-2222-2222-222222222222'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'kid_devices row links anon user to kid');
select is(
  (select used_at is not null from public.kid_pairing_codes where code = '111111'),
  true, 'code marked used');

-- Idempotency: anon kid 1 redeems 111111 again => no error, no duplicate
select lives_ok(
  $$ select public.redeem_device_pairing('111111', 'KidPhone') $$,
  'idempotent retry by same anon user succeeds'
);
select is(
  (select count(*)::int from public.kid_devices where user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'still exactly one device row');

-- Expired code rejected
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
prepare expired_redeem as select public.redeem_device_pairing('222222', 'KidPhone2');
select throws_ok('expired_redeem', null, 'Invalid or expired code', 'expired code rejected with generic error');

-- Used (by different user) code rejected
prepare used_redeem as select public.redeem_device_pairing('333333', 'KidPhone3');
select throws_ok('used_redeem', null, 'Invalid or expired code', 'used code rejected with generic error');

select * from finish();
rollback;
