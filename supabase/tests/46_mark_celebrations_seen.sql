-- supabase/tests/46_mark_celebrations_seen.sql
begin;
select plan(9);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local'),
         ('22222222-2222-2222-2222-222222222222', 'other@t.local');
insert into public.families (id, name, timezone) values
  ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F', 'UTC'),
  ('fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'G', 'UTC');

insert into public.profiles (id, user_id, family_id, type, display_name, avatar_id)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1),
  ('55555555-5555-5555-5555-555555555555',
   null, 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Sara', 2),
  ('99999999-9999-9999-9999-999999999999',
   '22222222-2222-2222-2222-222222222222',
   'fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Q', 1);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. From null, cursor is set.
select lives_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   '2026-05-15T10:00:00Z') $$,
  'parent can set kid cursor');
select is(
  (select celebrations_seen_at from public.profiles
   where id='55555555-5555-5555-5555-555555555555'),
  '2026-05-15T10:00:00Z'::timestamptz,
  'null cursor gets set');

-- 2. Forward advance moves it.
select lives_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   '2026-05-15T12:00:00Z') $$,
  'forward advance call succeeds');
select is(
  (select celebrations_seen_at from public.profiles
   where id='55555555-5555-5555-5555-555555555555'),
  '2026-05-15T12:00:00Z'::timestamptz,
  'forward advance moves cursor');

-- 3. Older timestamp does NOT move it backward (monotonic).
select lives_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   '2026-05-15T09:00:00Z') $$,
  'older-timestamp call still succeeds (no-op)');
select is(
  (select celebrations_seen_at from public.profiles
   where id='55555555-5555-5555-5555-555555555555'),
  '2026-05-15T12:00:00Z'::timestamptz,
  'older timestamp is ignored (monotonic)');

-- 3b. NULL p_seen_at is rejected (defensive input guard).
select throws_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   NULL) $$,
  'P0001', 'p_seen_at_required',
  'null p_seen_at rejected');

-- 4. A parent from a DIFFERENT family is rejected.
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   '2026-05-15T20:00:00Z') $$,
  'P0001', 'profile_not_in_family',
  'cross-family parent rejected');

-- 5. Anonymous rejected (hits the not_a_parent branch).
reset role;
set local "request.jwt.claims" to '{}';
select throws_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   '2026-05-15T20:00:00Z') $$,
  'P0001', 'not_a_parent',
  'anonymous rejected');

select * from finish();
rollback;
