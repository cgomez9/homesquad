-- supabase/tests/44_goal_completion.sql
-- TDD assertions for the check_active_goal() trigger on star_ledger.
-- Five scenarios:
--   1. Below target → goal stays active.
--   2. Crossing target → status flips to 'completed'.
--   3. completed_at is populated when flipped.
--   4. goal_completed push enqueued (push_outbox row exists).
--   5. No re-fire after completion (inserting another +star row does not
--      enqueue a second push).
begin;
select plan(5);

-- ── Fixtures ──────────────────────────────────────────────────────────────────
insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');

insert into public.families (id, name)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');

-- Parent (no pin_hash, avatar_id required). Has push_token so the push
-- enqueue path can find a recipient.
insert into public.profiles (id, user_id, family_id, type, display_name,
                              avatar_id, push_token)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, 'ExpoToken'),
  -- Kid profile: user_id must be null.
  ('55555555-5555-5555-5555-555555555555',
   null,
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'K', 1, null);

-- Create an active goal with target_stars = 50.
-- Use SECURITY DEFINER RPC so parent context is set correctly.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select create_family_goal('Test Goal', 50, null);

-- Switch back to postgres for direct ledger inserts (bypasses RLS).
reset role;

-- ── Test 1: below target → goal stays active ─────────────────────────────────
insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 25, 'chore_approved');

select is(
  (select status from public.family_goals
   where family_id = 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'active',
  'below target: goal stays active');

-- ── Test 2: crossing target → status flips to completed ──────────────────────
-- Total after this insert: 25 + 30 = 55 >= 50 → should complete.
insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 30, 'chore_approved');

select is(
  (select status from public.family_goals
   where family_id = 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'completed',
  'crossing target: status flips to completed');

-- ── Test 3: completed_at is populated ────────────────────────────────────────
select ok(
  (select completed_at from public.family_goals
   where family_id = 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not null,
  'completed_at is populated on completion');

-- ── Test 4: goal_completed push was enqueued ─────────────────────────────────
select is(
  (select count(*)::int from public.push_outbox
   where event_type = 'goal_completed'),
  1,
  'goal_completed push enqueued in push_outbox');

-- ── Test 5: no re-fire after completion ──────────────────────────────────────
-- Clear the outbox so we can test cleanly, then insert another positive row.
delete from public.push_outbox;

insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10, 'chore_approved');

select is(
  (select count(*)::int from public.push_outbox
   where event_type = 'goal_completed'),
  0,
  'no re-fire: second insert after completion does not enqueue again');

select * from finish();
rollback;
