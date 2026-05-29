-- supabase/tests/50_revoke_kid_device_rpc.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),  -- anon kid device
  ('99999999-9999-9999-9999-999999999999', 'other@b.test');

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '99999999-9999-9999-9999-999999999999');

insert into public.kid_devices(id, kid_id, family_id, user_id, device_name) values
  ('d0000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

set local role authenticated;

-- Other-family parent can't revoke
set local "request.jwt.claims" to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
prepare other_revoke as select public.revoke_kid_device('d0000000-0000-0000-0000-000000000001');
select throws_ok('other_revoke', null, null, 'other-family parent cannot revoke');

-- Owning parent can revoke
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.revoke_kid_device('d0000000-0000-0000-0000-000000000001') $$,
  'owning parent revokes'
);

reset role;

-- Side effect: kid_devices row is gone (cascade via auth.users delete)
select is(
  (select count(*)::int from public.kid_devices where id = 'd0000000-0000-0000-0000-000000000001'),
  0, 'kid_devices row removed by cascade');
-- Side effect: auth.users row is gone
select is(
  (select count(*)::int from auth.users where id = '22222222-2222-2222-2222-222222222222'),
  0, 'anon auth.users row deleted');

select * from finish();
rollback;
