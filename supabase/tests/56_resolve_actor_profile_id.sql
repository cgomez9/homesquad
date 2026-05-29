-- supabase/tests/56_resolve_actor_profile_id.sql
begin;
select plan(5);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),                       -- kid anon
  ('99999999-9999-9999-9999-999999999999', 'p@b.test');                 -- other-family parent

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P',  1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K',  2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K2', 3, null),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '99999999-9999-9999-9999-999999999999');

insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

set local role authenticated;

-- Parent acting as self
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  public.resolve_actor_profile_id('a1111111-1111-1111-1111-111111111111'),
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'parent resolves self');

-- Parent acting as kid in same family
select is(
  public.resolve_actor_profile_id('a2222222-2222-2222-2222-222222222222'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'parent resolves kid in own family');

-- Kid session acting as self
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  public.resolve_actor_profile_id('a2222222-2222-2222-2222-222222222222'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'kid resolves self');

-- Kid session trying to act as sibling -> raises
prepare kid_as_sibling as select public.resolve_actor_profile_id('a3333333-3333-3333-3333-333333333333');
select throws_ok('kid_as_sibling', null, 'kid session may only act as itself', 'kid acting as sibling rejected');

-- Other-family parent trying to act in family A -> raises
set local "request.jwt.claims" to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
prepare foreign_actor as select public.resolve_actor_profile_id('a2222222-2222-2222-2222-222222222222');
select throws_ok('foreign_actor', null, 'actor not in caller family', 'foreign-family actor rejected');

select * from finish();
rollback;
