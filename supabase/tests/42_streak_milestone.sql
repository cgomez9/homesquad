-- supabase/tests/42_streak_milestone.sql
begin;
select plan(5);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into public.families (id, name)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');
-- Note: pin_hash omitted for parent — profiles_pin_only_on_kids requires
-- pin_hash IS NULL for type='parent'. avatar_id is NOT NULL.
insert into public.profiles (id, user_id, family_id, type, display_name,
                              avatar_id, push_token)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, 'ExpoToken'),
  ('55555555-5555-5555-5555-555555555555',
   null,
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Sara', 1, null);

insert into public.streaks (profile_id, family_id, current_count,
                             last_completion_date)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          6, current_date);

-- 1. Crossing to 7 enqueues a streak_milestone.
update public.streaks set current_count = 7
  where profile_id='55555555-5555-5555-5555-555555555555';
select is(
  (select count(*)::int from push_outbox where event_type='streak_milestone'),
  1, 'crossing to 7 enqueues a streak_milestone push');

-- 2. Payload contains kid_name and streak_days.
select is(
  (select payload->>'kid_name' from push_outbox
   where event_type='streak_milestone'),
  'Sara', 'payload kid_name = Sara');
select is(
  ((select payload->>'streak_days' from push_outbox
    where event_type='streak_milestone'))::int,
  7, 'payload streak_days = 7');

-- 3. Going 7 → 8 does NOT enqueue another.
delete from push_outbox;
update public.streaks set current_count = 8
  where profile_id='55555555-5555-5555-5555-555555555555';
select is(
  (select count(*)::int from push_outbox where event_type='streak_milestone'),
  0, 'going 7 → 8 does not re-fire');

-- 4. Crossing to 30 fires.
update public.streaks set current_count = 30
  where profile_id='55555555-5555-5555-5555-555555555555';
select is(
  (select count(*)::int from push_outbox where event_type='streak_milestone'),
  1, 'crossing to 30 fires');

select * from finish();
rollback;
