begin;
select plan(8);

-- Scenario 1: single-parent family, full cascade
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'solo@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Solo Family');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Solo Parent', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Solo Kid',    2, null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.delete_account() $$,
  'solo parent delete_account succeeds'
);

reset role;
select is(
  (select count(*)::int from public.families where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'family row deleted'
);
select is(
  (select count(*)::int from public.profiles where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'profiles cascade-deleted'
);
select is(
  (select count(*)::int from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  0, 'auth.users row deleted'
);

-- Scenario 2: two-parent family, only caller removed
insert into auth.users(id, email) values
  ('22222222-2222-2222-2222-222222222222', 'parent-a@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'parent-b@test.com');
insert into public.families(id, name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Couple Family');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Parent A', 1, '22222222-2222-2222-2222-222222222222'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Parent B', 2, '33333333-3333-3333-3333-333333333333'),
  ('b3333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'Shared Kid', 3, null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.delete_account() $$,
  'co-parent delete_account succeeds'
);

reset role;
select is(
  (select count(*)::int from public.families where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1, 'family row preserved'
);
select is(
  (select count(*)::int from public.profiles where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and user_id = '33333333-3333-3333-3333-333333333333'),
  1, 'other parent profile preserved'
);

-- Scenario 3: unauthenticated caller
set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

prepare anon_delete as select public.delete_account();
select throws_ok('anon_delete', null, null, 'unauthenticated caller raises');

select * from finish();
rollback;
