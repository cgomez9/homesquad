begin;
select plan(12);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Leo',   3, null),
  ('a4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Mia',   4, null);

-- 1. Unknown profile returns empty.
select is(public.check_achievements('99999999-9999-9999-9999-999999999999'), '{}'::text[], 'unknown profile_id returns empty');

-- 2. No-activity kid returns empty.
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), '{}'::text[], 'no-activity kid returns empty');

-- 3. 1 star → first_star
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 1, 'chore_approved');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), array['first_star']::text[], '1 star unlocks first_star');

-- 4. Idempotency.
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), '{}'::text[], 'idempotent re-call returns empty');

-- 5. 100 stars → stars_100 only (first_star already unlocked).
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 99, 'chore_approved');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), array['stars_100']::text[], '100 stars unlocks stars_100 only');

-- 6. Negative ledger doesn't revoke.
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', -50, 'redemption');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), '{}'::text[], 'negative ledger does not revoke');

-- 7. 500 cumulative positive → stars_500.
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 400, 'chore_approved');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), array['stars_500']::text[], '500 cumulative unlocks stars_500');

-- 8. Streak via longest_count (current_count reset to 1, longest is 7): Leo gets streak_7 + first_star + first_chore on first qualifying ledger.
-- Use containment check to avoid array order brittleness.
insert into public.streaks(profile_id, family_id, current_count, longest_count, last_completion_date)
  values ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 7, current_date);
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', 5, 'chore_approved');
-- No chore_instance yet for Leo, so first_chore should NOT fire. Just first_star + streak_7.
select ok(
  array['first_star', 'streak_7']::text[] <@ public.check_achievements('a3333333-3333-3333-3333-333333333333'),
  'streak_7 unlocked via longest_count + first_star'
);

-- 9. 25 approved chore_instances for Mia → chores_25 + first_chore.
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 1, 'auto', '{"type":"daily"}'::jsonb, 'a4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(chore_id, family_id, assignee_profile_id, completed_by, due_at, status)
  select 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444',
         now() + (gs || ' minutes')::interval, 'approved'
  from generate_series(1, 25) gs;
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4444444-4444-4444-4444-444444444444', 25, 'chore_approved');
select ok(
  array['chores_25']::text[] <@ public.check_achievements('a4444444-4444-4444-4444-444444444444'),
  '25 approved chore_instances unlocks chores_25'
);

-- 10. First fulfilled redemption → first_reward.
insert into public.rewards(id, family_id, title, star_cost, icon_id, created_by)
  values ('aaa11111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ice Cream', 1, 2, 'a1111111-1111-1111-1111-111111111111');
insert into public.redemptions(family_id, reward_id, kid_profile_id, star_cost_snapshot, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaa11111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444', 1, 'fulfilled');
select ok(
  array['first_reward']::text[] <@ public.check_achievements('a4444444-4444-4444-4444-444444444444'),
  'fulfilled redemption unlocks first_reward'
);

-- 11. Row inserted into achievements table.
select is(
  (select count(*)::int from public.achievements where profile_id = 'a4444444-4444-4444-4444-444444444444' and achievement_key = 'first_reward'),
  1, 'first_reward row exists in achievements'
);

-- 12. Sara has first_star + stars_100 + stars_500 in the table.
select is(
  (select count(*)::int from public.achievements where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  3, 'Sara has 3 achievements: first_star + stars_100 + stars_500'
);

select * from finish();
rollback;
