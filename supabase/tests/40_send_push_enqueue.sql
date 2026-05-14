-- supabase/tests/40_send_push_enqueue.sql
begin;
select plan(7);

-- Fixture: family with two parents, both with push_token. One has muted
-- chore_submitted via push_prefs.
-- Note: pin_hash omitted for parents — profiles_pin_only_on_kids CHECK requires
-- pin_hash IS NULL for type='parent'.
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'a@t.local'),
  ('a2222222-2222-2222-2222-222222222222', 'b@t.local');

insert into public.families (id, name, timezone, quiet_hours_enabled,
                             quiet_hours_start, quiet_hours_end)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fam',
          'UTC', false, '21:00'::time, '07:00'::time);

insert into public.profiles (id, user_id, family_id, type, display_name,
                              avatar_id, push_token, push_prefs)
values
  ('33333333-3333-3333-3333-333333333333',
   'a1111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'A', 1,
   'ExpoToken-A', '{"chore_submitted": false}'::jsonb),
  ('44444444-4444-4444-4444-444444444444',
   'a2222222-2222-2222-2222-222222222222',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'B', 2,
   'ExpoToken-B', '{}'::jsonb);

-- 1. Send chore_submitted; muted parent is skipped, other gets enqueued.
select is(
  (select send_push('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'chore_submitted',
                    jsonb_build_object('instance_id','xyz'))),
  1,
  'enqueues 1 row when one parent muted that event');

select is(
  (select count(*)::int from push_outbox
   where recipient_id='44444444-4444-4444-4444-444444444444'),
  1, 'row exists for unmuted parent');

select is(
  (select count(*)::int from push_outbox
   where recipient_id='33333333-3333-3333-3333-333333333333'),
  0, 'no row for muted parent');

-- 2. Outside quiet hours (disabled): scheduled_for = now() (within 1s).
select ok(
  (select scheduled_for from push_outbox
   where recipient_id='44444444-4444-4444-4444-444444444444') >= now() - interval '1 second'
  and
  (select scheduled_for from push_outbox
   where recipient_id='44444444-4444-4444-4444-444444444444') <= now() + interval '1 second',
  'scheduled_for is roughly now() when quiet hours disabled');

-- 3. With quiet hours enabled and current_time in the window, scheduled_for
--    jumps to quiet_hours_end.
update public.families
   set quiet_hours_enabled = true,
       quiet_hours_start   = (now() at time zone 'UTC')::time - interval '1 hour',
       quiet_hours_end     = (now() at time zone 'UTC')::time + interval '1 hour'
 where id = 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

delete from push_outbox;

select is(
  (select send_push('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'redemption_requested',
                    '{}'::jsonb)),
  2, 'enqueues for both parents (no mute on this event)');

select ok(
  (select min(scheduled_for) from push_outbox) > now() + interval '30 minutes',
  'scheduled_for pushed at least 30 minutes out (into quiet_hours_end)');

-- 4. Null push_token recipient is skipped.
update public.profiles set push_token = null
  where id='33333333-3333-3333-3333-333333333333';
delete from push_outbox;

select is(
  (select send_push('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'redemption_requested', '{}'::jsonb)),
  1, 'null push_token recipient skipped');

select * from finish();
rollback;
