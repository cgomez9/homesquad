begin;
select plan(4);

-- Two families, one parent each.
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com');

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');

insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Bob',   1, '22222222-2222-2222-2222-222222222222');

-- Insert two chores bypassing RLS (we test access, not creation).
insert into public.chores(family_id, title, star_value, verification_mode, recurrence, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A-chore', 10, 'approval', '{"type":"daily"}'::jsonb, 'a1111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B-chore', 10, 'approval', '{"type":"daily"}'::jsonb, 'b2222222-2222-2222-2222-222222222222');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$ select title from public.chores order by title $$,
  $$ values ('A-chore'::text) $$,
  'Alice sees only Family A chores'
);

select is_empty(
  $$ select * from public.chores where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'Alice cannot see Family B chores'
);

prepare hack_b as
  update public.chores set title = 'HACKED'
  where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select lives_ok('hack_b', 'UPDATE against Family B does not error');

reset role;
select results_eq(
  $$ select title from public.chores where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  $$ values ('B-chore'::text) $$,
  'Family B chore was untouched'
);

select * from finish();
rollback;
