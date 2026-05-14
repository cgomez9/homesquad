-- supabase/tests/41_drain_outbox.sql
-- We can't unit-test the net.http_post fire-and-forget directly, but we can
-- assert apply_drain_result's state-transition math.
begin;
select plan(8);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into public.families (id, name)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');
-- Note: pin_hash omitted — profiles_pin_only_on_kids requires pin_hash IS NULL
-- for type='parent'. avatar_id is NOT NULL.
insert into public.profiles (id, user_id, family_id, type, display_name,
                              avatar_id, push_token)
  values ('33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1,
          'ExpoToken');

insert into public.push_outbox (id, family_id, recipient_id, event_type,
                                payload, scheduled_for, status, attempts)
values
  ('b1111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   'chore_submitted', '{}'::jsonb, now(), 'sending', 0),
  ('b2222222-2222-2222-2222-222222222222',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   'chore_submitted', '{}'::jsonb, now(), 'sending', 1),
  ('b3333333-3333-3333-3333-333333333333',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   'chore_submitted', '{}'::jsonb, now(), 'sending', 2);

-- 1. OK outcome marks sent.
select lives_ok(
  $$ select apply_drain_result('b1111111-1111-1111-1111-111111111111', 'ok', null) $$,
  'apply_drain_result(ok) lives');
select is(
  (select status from push_outbox where id='b1111111-1111-1111-1111-111111111111'),
  'sent', 'ok → sent');

-- 2. Transient failure with attempts<max increments and schedules retry.
select lives_ok(
  $$ select apply_drain_result('b2222222-2222-2222-2222-222222222222', 'transient', '5xx') $$,
  'transient retry lives');
select is(
  (select status from push_outbox where id='b2222222-2222-2222-2222-222222222222'),
  'pending', 'transient with attempts<max → pending');
select is(
  (select attempts from push_outbox where id='b2222222-2222-2222-2222-222222222222'),
  2, 'attempts incremented');

-- 3. Transient at max_attempts marks failed.
select lives_ok(
  $$ select apply_drain_result('b3333333-3333-3333-3333-333333333333', 'transient', 'expired') $$,
  'transient terminal lives');
select is(
  (select status from push_outbox where id='b3333333-3333-3333-3333-333333333333'),
  'failed', 'transient at max → failed');

-- 4. DeviceNotRegistered nulls push_token and marks failed.
update public.push_outbox set status='sending'
  where id='b3333333-3333-3333-3333-333333333333';
update public.push_outbox set attempts=0
  where id='b3333333-3333-3333-3333-333333333333';

select apply_drain_result('b3333333-3333-3333-3333-333333333333',
                          'device_not_registered', 'token rotated');

select is(
  (select push_token from public.profiles
   where id='33333333-3333-3333-3333-333333333333'),
  NULL, 'DeviceNotRegistered → push_token nulled');

select * from finish();
rollback;
