-- supabase/tests/45_get_leaderboard.sql
begin;
select plan(6);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into public.families (id, name, timezone) values
  ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F', 'UTC');

insert into public.profiles (id, user_id, family_id, type, display_name,
                              avatar_id)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1),
  ('55555555-5555-5555-5555-555555555555',
   null, 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Sara', 2),
  ('66666666-6666-6666-6666-666666666666',
   null, 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Lev', 3);

-- Sara: +30 this week, +50 historical (last month)
-- Lev:  +20 this week, +100 historical
-- Sara also has a -20 redemption (must NOT count against her).
insert into public.star_ledger (profile_id, family_id, delta, reason, created_at)
values
  ('55555555-5555-5555-5555-555555555555',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  30, 'chore_approved', now()),
  ('55555555-5555-5555-5555-555555555555',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  50, 'chore_approved', now() - interval '60 days'),
  ('55555555-5555-5555-5555-555555555555',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', -20, 'redemption', now()),
  ('66666666-6666-6666-6666-666666666666',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  20, 'chore_approved', now()),
  ('66666666-6666-6666-6666-666666666666',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100, 'chore_approved', now() - interval '60 days');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Two rows returned (kids only, no parent).
select is(
  (select count(*)::int from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  2, 'two kids ranked');

-- 2. Sara leads this week (30 > 20).
select is(
  (select display_name from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   order by week_rank limit 1),
  'Sara', 'Sara #1 this week');

-- 3. Lev leads all-time (120 > 80; -20 redemption doesn't count).
select is(
  (select display_name from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   order by all_time_rank limit 1),
  'Lev', 'Lev #1 all-time');

-- 4. Sara's week_stars = 30 (not 10).
select is(
  (select week_stars from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   where display_name='Sara'),
  30, 'Sara week_stars ignores the redemption');

-- 5. Lev's all_time_stars = 120.
select is(
  (select all_time_stars from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   where display_name='Lev'),
  120, 'Lev all_time_stars correct');

-- 6. Single-kid family: delete Lev, expect one row.
reset role;
delete from public.profiles where id='66666666-6666-6666-6666-666666666666';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  1, 'single-kid family returns 1 row');

select * from finish();
rollback;
