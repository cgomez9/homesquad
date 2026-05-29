begin;
select plan(11);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

-- Active family goal — real family_goals columns: no current_progress/target_progress
insert into public.family_goals(id, family_id, title, target_stars, status, created_by)
values ('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pool', 1000, 'active', 'a1111111-1111-1111-1111-111111111111');

-- Chores: one per verification mode (all-hex UUIDs)
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('ca000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Auto',     5, 'auto',     '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111'),
  ('cb000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Photo',    7, 'photo',    '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111'),
  ('cc000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Approval', 3, 'approval', '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111');

-- Six started instances: each mode × (kid, parent).
-- Distinct due_at because chore_instances has unique(chore_id, due_at).
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, started_at) values
  ('1a000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(),                     'started', now()),
  ('1b000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day', 'started', now()),
  ('1c000000-0000-0000-0000-000000000003', 'cb000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(),                     'started', now()),
  ('1d000000-0000-0000-0000-000000000004', 'cb000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day', 'started', now()),
  ('1e000000-0000-0000-0000-000000000005', 'cc000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(),                     'started', now()),
  ('1f000000-0000-0000-0000-000000000006', 'cc000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day', 'started', now());

set local role authenticated;

-- Kid + auto -> approved (auto-approved, star_ledger row credited to kid)
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.finish_chore('1a000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid finishes auto chore');
select is(
  (select status from public.chore_instances where id = '1a000000-0000-0000-0000-000000000001'),
  'approved', 'kid+auto status = approved');

-- Kid + photo without url -> rejected
prepare kid_photo_no_url as select public.finish_chore('1c000000-0000-0000-0000-000000000003', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('kid_photo_no_url', null, 'photo_url required for photo verification mode', 'kid+photo without url rejected');

-- Kid + photo with url -> finished (awaits parent review)
select lives_ok(
  $$ select public.finish_chore('1c000000-0000-0000-0000-000000000003', 'a2222222-2222-2222-2222-222222222222', 'https://x.test/y.jpg') $$,
  'kid finishes photo chore with url');
select is(
  (select status from public.chore_instances where id = '1c000000-0000-0000-0000-000000000003'),
  'finished', 'kid+photo status = finished');

-- Kid + approval -> finished (awaits parent review)
select lives_ok(
  $$ select public.finish_chore('1e000000-0000-0000-0000-000000000005', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid finishes approval chore');
select is(
  (select status from public.chore_instances where id = '1e000000-0000-0000-0000-000000000005'),
  'finished', 'kid+approval status = finished');

-- Parent + each mode -> approved, pool credit via credit_family_pool
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.finish_chore('1b000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent finishes auto chore');
select lives_ok(
  $$ select public.finish_chore('1d000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent finishes photo chore (no url needed)');
select lives_ok(
  $$ select public.finish_chore('1f000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent finishes approval chore');

-- Pool credit: credit_family_pool inserts star_ledger rows attributed to the parent.
-- 3 parent finishes: auto(5) + photo(7) + approval(3) = 15.
select is(
  (select coalesce(sum(delta), 0)::int from public.star_ledger
     where profile_id = 'a1111111-1111-1111-1111-111111111111'
       and family_id  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  15, 'family_pool credited 15 via parent star_ledger rows');

select * from finish();
rollback;
