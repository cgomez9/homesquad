begin;
select plan(8);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),                       -- kid anon
  ('33333333-3333-3333-3333-333333333333', null),                       -- orphan anon
  ('44444444-4444-4444-4444-444444444444', null);                       -- revoked kid

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);

insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

insert into public.kid_devices(kid_id, family_id, user_id, device_name, revoked_at) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '44444444-4444-4444-4444-444444444444', 'OldPhone', now());

set local role authenticated;

-- parent session
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(public.current_family_id(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'parent resolves to own family');
select is(public.current_kid_id(),    null::uuid, 'parent has no kid_id');

-- kid session
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(public.current_family_id(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'kid session resolves to kid family');
select is(public.current_kid_id(),    'a2222222-2222-2222-2222-222222222222'::uuid, 'kid session resolves to kid_id');

-- orphan anon (no kid_devices row)
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(public.current_family_id(), null::uuid, 'orphan anon has no family');
select is(public.current_kid_id(),    null::uuid, 'orphan anon has no kid_id');

-- revoked kid session
set local "request.jwt.claims" to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.current_family_id(), null::uuid, 'revoked kid session has no family');
select is(public.current_kid_id(),    null::uuid, 'revoked kid session has no kid_id');

select * from finish();
rollback;
