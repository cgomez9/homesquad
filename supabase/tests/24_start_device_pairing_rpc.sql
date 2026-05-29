-- supabase/tests/24_start_device_pairing_rpc.sql
begin;
select plan(6);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);

-- Other family + kid (to test foreign kid rejection)
insert into auth.users(id, email) values ('99999999-9999-9999-9999-999999999999', 'other@b.test');
insert into public.families(id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '99999999-9999-9999-9999-999999999999'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'K2', 2, null);

-- auth.users row with no profile (to test no-parent-profile guard)
insert into auth.users(id, email) values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'noprofile@c.test');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Happy path: returns a 6-digit code and ~5min expiry, inserts the row
select lives_ok(
  $$ select public.start_device_pairing('a2222222-2222-2222-2222-222222222222') $$,
  'parent generates code for own kid'
);
select is(
  (select length(code) from public.kid_pairing_codes
     where kid_id = 'a2222222-2222-2222-2222-222222222222' order by created_at desc limit 1),
  6, 'code is 6 chars');
select is(
  (select code ~ '^[0-9]{6}$' from public.kid_pairing_codes
     where kid_id = 'a2222222-2222-2222-2222-222222222222' order by created_at desc limit 1),
  true, 'code is all digits');

-- Foreign kid rejected
prepare foreign_kid as select public.start_device_pairing('b2222222-2222-2222-2222-222222222222');
select throws_ok('foreign_kid', null, null, 'foreign-family kid rejected');

-- Non-parent caller rejected
set local "request.jwt.claims" to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
prepare other_parent as select public.start_device_pairing('a2222222-2222-2222-2222-222222222222');
select throws_ok('other_parent', null, null, 'parent in other family rejected');

-- True non-parent caller (auth.users row with no profile) rejected
set local "request.jwt.claims" to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
prepare no_profile as select public.start_device_pairing('a2222222-2222-2222-2222-222222222222');
select throws_ok('no_profile', null, 'caller is not a parent', 'caller with no profile rejected');

select * from finish();
rollback;
