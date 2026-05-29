begin;
select plan(2);

insert into auth.users(id, email) values
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.set_push_token('ExpoPushToken[abc]') $$,
  'kid session writes push token');

-- Switch to superuser to verify the side effect (kid_devices not directly readable by kid session)
reset role;
select is(
  (select push_token from public.kid_devices where user_id = '22222222-2222-2222-2222-222222222222'),
  'ExpoPushToken[abc]',
  'token landed on kid_devices');

select * from finish();
rollback;
