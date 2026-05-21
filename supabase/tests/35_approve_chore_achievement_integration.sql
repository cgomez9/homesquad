begin;
select plan(3);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by)
  values ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 10, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.approve_chore('11111111-aaaa-1111-1111-111111111111') $$,
  'approve_chore succeeds'
);

set local role postgres;
select is(
  (select count(*)::int from public.achievements
    where profile_id = 'a2222222-2222-2222-2222-222222222222' and achievement_key = 'stargazer'),
  1, 'stargazer achievement created by approve_chore (10-star chore)'
);
select is(
  (select count(*)::int from public.achievements
    where profile_id = 'a2222222-2222-2222-2222-222222222222' and achievement_key = 'first_chore'),
  1, 'first_chore achievement created by approve_chore'
);

select * from finish();
rollback;
