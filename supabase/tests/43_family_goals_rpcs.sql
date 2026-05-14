-- supabase/tests/43_family_goals_rpcs.sql
begin;
select plan(11);

-- The kid is inserted as an auth user only (no profile), since the schema's
-- profiles_parent_has_user CHECK forbids non-null user_id on 'kid' rows.
-- "Kid cannot call" is exercised by JWT-as-22222222 → no matching parent
-- profile row → not_a_parent branch.
insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into auth.users (id, email)
  values ('22222222-2222-2222-2222-222222222222', 'k@t.local');
insert into public.families (id, name)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');
-- Note: pin_hash omitted for parent — profiles_pin_only_on_kids requires
-- pin_hash IS NULL for type='parent'. avatar_id is NOT NULL.
insert into public.profiles (id, user_id, family_id, type, display_name, avatar_id)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1),
  ('55555555-5555-5555-5555-555555555555',
   null,
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'K', 1);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Parent can create.
select lives_ok(
  $$ select create_family_goal('Pizza Night', 100, 'Mom orders Friday') $$,
  'parent can create_family_goal');

select is(
  (select count(*)::int from family_goals
   where status='active' and family_id='faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'one active goal exists');

-- 2. Second active create rejected.
select throws_ok(
  $$ select create_family_goal('Movie Night', 50, null) $$,
  'P0001', 'already_active',
  'second active goal raises already_active');

-- 3. Negative target rejected by CHECK.
select throws_ok(
  $$ select create_family_goal('Bad', 0, null) $$,
  '23514', NULL,
  'target_stars <= 0 rejected');

-- 4. Kid cannot create.
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select create_family_goal('Sneak', 10, null) $$,
  'P0001', 'not_a_parent',
  'kid cannot create_family_goal');

-- 5. get_active_goal returns the row + progress.
reset role;
insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 25, 'chore_approved');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select progress_stars from get_active_goal('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  25, 'progress_stars = 25 after a +25 ledger row');

select is(
  (select title from get_active_goal('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  'Pizza Night', 'title returned');

-- 6. cancel_family_goal flips status.
select lives_ok(
  $$ select cancel_family_goal((select id from family_goals
                                where status='active'
                                  and family_id='faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) $$,
  'cancel lives');

select is(
  (select status from family_goals
   where family_id='faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   order by created_at desc limit 1),
  'canceled', 'status flipped to canceled');

-- 7. get_active_goal returns no rows after cancel.
select is(
  (select count(*)::int from get_active_goal('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  0, 'no active goal after cancel');

-- 8. Now a new create works.
select lives_ok(
  $$ select create_family_goal('Round Two', 50, null) $$,
  'new create after cancel');

select * from finish();
rollback;
