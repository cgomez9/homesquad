begin;

select plan(6);

-- Fixture: family + parent. A second auth user has no parent profile (simulates kid/non-parent).
insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'parent@test.local');
insert into auth.users (id, email)
  values ('22222222-2222-2222-2222-222222222222', 'nonpro@test.local');

insert into public.families (id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Family');

insert into public.profiles (id, family_id, type, display_name, avatar_id, user_id)
  values
    ('33333333-3333-3333-3333-333333333333',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Parent', 1,
     '11111111-1111-1111-1111-111111111111');

-- 1. Parent call succeeds.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select set_quiet_hours(true, '22:00'::time, '06:30'::time, 'America/Bogota') $$,
  'parent can call set_quiet_hours'
);

-- 2. Values persisted.
reset role;
select is(
  (select quiet_hours_start from families where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '22:00'::time, 'quiet_hours_start persisted');

select is(
  (select timezone from families where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'America/Bogota', 'timezone persisted');

-- 3. Invalid timezone raises.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select set_quiet_hours(true, '21:00'::time, '07:00'::time, 'Not/A_Zone') $$,
  'P0001', 'invalid_timezone',
  'invalid timezone rejected');

-- 4. Non-parent auth user rejected (no parent profile).
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select set_quiet_hours(true, '21:00'::time, '07:00'::time, 'UTC') $$,
  'P0001', 'not_a_parent',
  'non-parent user cannot call set_quiet_hours');

-- 5. Anonymous call rejected.
reset role;
select throws_ok(
  $$ select set_quiet_hours(true, '21:00'::time, '07:00'::time, 'UTC') $$,
  NULL, NULL,
  'anonymous cannot call set_quiet_hours');

select * from finish();
rollback;
