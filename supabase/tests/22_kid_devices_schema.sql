begin;
select plan(9);

select has_table('public', 'kid_pairing_codes', 'kid_pairing_codes exists');
select has_table('public', 'kid_devices',       'kid_devices exists');

select col_is_pk('public', 'kid_pairing_codes', 'code', 'kid_pairing_codes.code is PK');
select col_is_unique('public', 'kid_devices', 'user_id', 'kid_devices.user_id is unique');

-- Setup data (all as superuser before switching roles)
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),
  ('33333333-3333-3333-3333-333333333333', 'other@b.test');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P',  1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K',  2, null),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '33333333-3333-3333-3333-333333333333');

-- Seed kid_devices as superuser (before role switch) — the RLS INSERT policy
-- was dropped in 20260528000003 so this row must be inserted as superuser.
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'TestDev');

-- RLS: parent in family can see kid_devices in their family
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*) from public.kid_devices where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int,
  1, 'parent sees kid device in their family');

-- Kid session can self-select its own device row
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.kid_devices where user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'kid session can self-select own device row');

-- RLS: a parent in another family cannot see this kid device
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(
  (select count(*) from public.kid_devices)::int,
  0, 'other-family parent sees no kid devices');

-- kid_pairing_codes: insert by parent
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.kid_pairing_codes(code, kid_id, family_id, issued_by, expires_at) values
  ('482619', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() + interval '5 minutes');

select is(
  (select count(*) from public.kid_pairing_codes where code = '482619')::int,
  1, 'parent can insert pairing code in own family');

-- Other-family parent cannot insert a pairing code for any family
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
prepare other_parent_insert as
  insert into public.kid_pairing_codes(code, kid_id, family_id, issued_by, expires_at)
  values ('999999', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', now() + interval '5 minutes');
select throws_ok('other_parent_insert', null, null, 'other-family parent cannot insert pairing code');

select * from finish();
rollback;
