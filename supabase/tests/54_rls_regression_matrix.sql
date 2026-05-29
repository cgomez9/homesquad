-- supabase/tests/54_rls_regression_matrix.sql
--
-- RLS regression matrix.  Exercises every kid-readable table against four
-- session shapes:
--   1) Parent session in family A
--   2) Kid session bound to kid_A1 in family A (via kid_devices, no profiles row)
--   3) Parent session in family B  (cross-family isolation)
--   4) Orphan authenticated session (no profile, no kid_devices row)
--
-- Expected:
--   sessions 1 and 2 see family-A row counts (not family-B rows)
--   session  3 sees family-B row counts (not family-A rows)
--   session  4 sees 0 rows in every table
--
-- 4 sessions × 10 kid-readable tables = 40 assertions
begin;
select plan(40);

-- ────────────────────────────────────────────────
-- Auth users
-- ────────────────────────────────────────────────
insert into auth.users(id, email) values
  ('a1000001-0000-0000-0000-000000000001', 'parentA@test.com'),   -- parent A
  ('a2000002-0000-0000-0000-000000000002', null),                 -- kid A1 (anon device session)
  ('b1000001-0000-0000-0000-000000000001', 'parentB@test.com'),   -- parent B
  ('c1000001-0000-0000-0000-000000000001', 'orphan@test.com');    -- orphan (no profile, no device)

-- ────────────────────────────────────────────────
-- families (1 per family)
-- ────────────────────────────────────────────────
insert into public.families(id, name) values
  ('fa000000-0000-0000-0000-000000000001', 'Family A'),
  ('fb000000-0000-0000-0000-000000000001', 'Family B');

-- ────────────────────────────────────────────────
-- profiles  (3 for A: parent + 2 kids; 2 for B: parent + 1 kid)
-- ────────────────────────────────────────────────
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a0100001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'parent', 'Parent A', 1, 'a1000001-0000-0000-0000-000000000001'),
  ('a0200001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'kid',    'Kid A1',   2, null),
  ('a0300002-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000001', 'kid',    'Kid A2',   3, null),
  ('b0100001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'parent', 'Parent B', 1, 'b1000001-0000-0000-0000-000000000001'),
  ('b0200001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'kid',    'Kid B1',   2, null);

-- ────────────────────────────────────────────────
-- kid_devices: bind kid A1's anon uid to family A
-- ────────────────────────────────────────────────
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a0200001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'a2000002-0000-0000-0000-000000000002', 'A1Phone');

-- ────────────────────────────────────────────────
-- chores (1 per family)
-- ────────────────────────────────────────────────
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c0100001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'A-chore', 5, 'auto', '{"type":"daily"}'::jsonb, 'a0200001-0000-0000-0000-000000000001', 'a0100001-0000-0000-0000-000000000001'),
  ('c0200001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'B-chore', 5, 'auto', '{"type":"daily"}'::jsonb, 'b0200001-0000-0000-0000-000000000001', 'b0100001-0000-0000-0000-000000000001');

-- ────────────────────────────────────────────────
-- chore_instances (1 per family)
-- ────────────────────────────────────────────────
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at) values
  ('d0100001-0000-0000-0000-000000000001', 'c0100001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'a0200001-0000-0000-0000-000000000001', now()),
  ('d0200001-0000-0000-0000-000000000001', 'c0200001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'b0200001-0000-0000-0000-000000000001', now());

-- ────────────────────────────────────────────────
-- star_ledger (1 per family)
-- ────────────────────────────────────────────────
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('fa000000-0000-0000-0000-000000000001', 'a0200001-0000-0000-0000-000000000001', 20, 'manual_grant'),
  ('fb000000-0000-0000-0000-000000000001', 'b0200001-0000-0000-0000-000000000001', 10, 'manual_grant');

-- ────────────────────────────────────────────────
-- streaks (1 per family)
-- ────────────────────────────────────────────────
insert into public.streaks(profile_id, family_id, current_count, longest_count) values
  ('a0200001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 3, 5),
  ('b0200001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 1, 2);

-- ────────────────────────────────────────────────
-- rewards (1 per family)
-- ────────────────────────────────────────────────
insert into public.rewards(id, family_id, title, star_cost, icon_id, created_by) values
  ('e0100001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'A-reward', 50, 1, 'a0100001-0000-0000-0000-000000000001'),
  ('e0200001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'B-reward', 50, 1, 'b0100001-0000-0000-0000-000000000001');

-- ────────────────────────────────────────────────
-- redemptions (1 per family)
-- ────────────────────────────────────────────────
insert into public.redemptions(id, family_id, reward_id, kid_profile_id, star_cost_snapshot, status) values
  ('f0100001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'e0100001-0000-0000-0000-000000000001', 'a0200001-0000-0000-0000-000000000001', 50, 'pending'),
  ('f0200001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'e0200001-0000-0000-0000-000000000001', 'b0200001-0000-0000-0000-000000000001', 50, 'pending');

-- ────────────────────────────────────────────────
-- achievements (1 per family)
-- ────────────────────────────────────────────────
insert into public.achievements(id, family_id, profile_id, achievement_key) values
  ('a0a00001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'a0200001-0000-0000-0000-000000000001', 'first_chore'),
  ('b0b00001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'b0200001-0000-0000-0000-000000000001', 'first_chore');

-- ────────────────────────────────────────────────
-- family_goals (1 per family, active)
-- ────────────────────────────────────────────────
insert into public.family_goals(id, family_id, title, target_stars, status, created_by) values
  ('a0b00001-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'A-goal', 100, 'active', 'a0100001-0000-0000-0000-000000000001'),
  ('b0c00001-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'B-goal', 100, 'active', 'b0100001-0000-0000-0000-000000000001');

-- ════════════════════════════════════════════════
-- Session 1: Parent A
-- ════════════════════════════════════════════════
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a1000001-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.families),        1, 'parent A: sees 1 family');
select is((select count(*)::int from public.profiles),        3, 'parent A: sees 3 profiles');
select is((select count(*)::int from public.chores),          1, 'parent A: sees 1 chore');
select is((select count(*)::int from public.chore_instances), 1, 'parent A: sees 1 chore instance');
select is((select count(*)::int from public.star_ledger),     1, 'parent A: sees 1 star ledger row');
select is((select count(*)::int from public.streaks),         1, 'parent A: sees 1 streak row');
select is((select count(*)::int from public.rewards),         1, 'parent A: sees 1 reward');
select is((select count(*)::int from public.redemptions),     1, 'parent A: sees 1 redemption');
select is((select count(*)::int from public.achievements),    1, 'parent A: sees 1 achievement');
select is((select count(*)::int from public.family_goals),    1, 'parent A: sees 1 family goal');

-- ════════════════════════════════════════════════
-- Session 2: Kid A1 device session (no profiles row — anon uid bound via kid_devices)
-- ════════════════════════════════════════════════
set local "request.jwt.claims" to '{"sub":"a2000002-0000-0000-0000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.families),        1, 'kid A1: sees 1 family');
select is((select count(*)::int from public.profiles),        3, 'kid A1: sees 3 profiles in family A');
select is((select count(*)::int from public.chores),          1, 'kid A1: sees 1 chore');
select is((select count(*)::int from public.chore_instances), 1, 'kid A1: sees 1 chore instance');
select is((select count(*)::int from public.star_ledger),     1, 'kid A1: sees 1 star ledger row');
select is((select count(*)::int from public.streaks),         1, 'kid A1: sees 1 streak row');
select is((select count(*)::int from public.rewards),         1, 'kid A1: sees 1 reward');
select is((select count(*)::int from public.redemptions),     1, 'kid A1: sees 1 redemption');
select is((select count(*)::int from public.achievements),    1, 'kid A1: sees 1 achievement');
select is((select count(*)::int from public.family_goals),    1, 'kid A1: sees 1 family goal');

-- ════════════════════════════════════════════════
-- Session 3: Parent B (cross-family isolation — sees B rows only, not A)
-- ════════════════════════════════════════════════
set local "request.jwt.claims" to '{"sub":"b1000001-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.families),        1, 'parent B: sees 1 family (own)');
select is((select count(*)::int from public.profiles),        2, 'parent B: sees 2 profiles (own family)');
select is((select count(*)::int from public.chores),          1, 'parent B: sees 1 chore (own family)');
select is((select count(*)::int from public.chore_instances), 1, 'parent B: sees 1 chore instance (own family)');
select is((select count(*)::int from public.star_ledger),     1, 'parent B: sees 1 star ledger row (own family)');
select is((select count(*)::int from public.streaks),         1, 'parent B: sees 1 streak row (own family)');
select is((select count(*)::int from public.rewards),         1, 'parent B: sees 1 reward (own family)');
select is((select count(*)::int from public.redemptions),     1, 'parent B: sees 1 redemption (own family)');
select is((select count(*)::int from public.achievements),    1, 'parent B: sees 1 achievement (own family)');
select is((select count(*)::int from public.family_goals),    1, 'parent B: sees 1 family goal (own family)');

-- ════════════════════════════════════════════════
-- Session 4: Orphan authenticated session (no profile, no kid_devices)
-- ════════════════════════════════════════════════
set local "request.jwt.claims" to '{"sub":"c1000001-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.families),        0, 'orphan: sees 0 families');
select is((select count(*)::int from public.profiles),        0, 'orphan: sees 0 profiles');
select is((select count(*)::int from public.chores),          0, 'orphan: sees 0 chores');
select is((select count(*)::int from public.chore_instances), 0, 'orphan: sees 0 chore instances');
select is((select count(*)::int from public.star_ledger),     0, 'orphan: sees 0 star ledger rows');
select is((select count(*)::int from public.streaks),         0, 'orphan: sees 0 streak rows');
select is((select count(*)::int from public.rewards),         0, 'orphan: sees 0 rewards');
select is((select count(*)::int from public.redemptions),     0, 'orphan: sees 0 redemptions');
select is((select count(*)::int from public.achievements),    0, 'orphan: sees 0 achievements');
select is((select count(*)::int from public.family_goals),    0, 'orphan: sees 0 family goals');

select * from finish();
rollback;
