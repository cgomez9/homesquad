-- supabase/tests/57_credit_family_pool.sql
-- NOTE: family_goals has NO current_progress / target_progress columns.
-- Progress is computed from star_ledger (sum of positive deltas since goal.created_at).
-- credit_family_pool inserts a star_ledger row; the check_active_goal trigger
-- fires and marks the goal 'completed' when cumulative delta >= target_stars.
-- Function signature: credit_family_pool(p_family_id uuid, p_profile_id uuid, p_amount int)
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test');

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');

insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111');

-- No active goal -> no-op (no error, no star_ledger row inserted)
select lives_ok(
  $$ select public.credit_family_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 10) $$,
  'no-op when no active goal');

select is(
  (select count(*)::int from public.star_ledger where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'no star_ledger row when no active goal');

-- Active goal -> star_ledger row inserted; progress computed as sum of deltas
insert into public.family_goals(id, family_id, title, target_stars, status, created_by)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pool', 100, 'active', 'a1111111-1111-1111-1111-111111111111');

select public.credit_family_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 10);
select is(
  (select coalesce(sum(delta)::int, 0) from public.star_ledger
    where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and delta > 0),
  10,
  'star_ledger delta inserted; progress = 10');

-- Crediting enough stars to complete the goal -> goal flips to completed
select public.credit_family_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 90);
select is(
  (select status from public.family_goals where id = '11111111-1111-1111-1111-111111111111'),
  'completed',
  'goal flips to completed when target_stars reached');

select * from finish();
rollback;
