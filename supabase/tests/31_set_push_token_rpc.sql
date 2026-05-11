begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.set_push_token('ExponentPushToken[abc]') $$,
  'set_push_token succeeds for owner'
);
select is(
  (select push_token from public.profiles where id = 'a1111111-1111-1111-1111-111111111111'),
  'ExponentPushToken[abc]', 'token stored'
);

select lives_ok(
  $$ select public.set_push_token('') $$,
  'set_push_token with empty string succeeds'
);

set local "request.jwt.claims" to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
prepare no_profile as select public.set_push_token('xxx');
select throws_ok('no_profile', null, null, 'no-profile caller raises');

select * from finish();
rollback;
