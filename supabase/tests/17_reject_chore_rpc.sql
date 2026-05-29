begin;
select plan(5);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 10, 'photo', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at, photo_url) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(),                         'finished', 'a2222222-2222-2222-2222-222222222222', now(), 'http://x/y.jpg'),
  ('22222222-aaaa-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now() + interval '1 day',     'finished', 'a2222222-2222-2222-2222-222222222222', now(), 'http://x/z.jpg');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1-3. Reject with reason.
select lives_ok(
  $$ select public.reject_chore('11111111-aaaa-1111-1111-111111111111', 'photo unclear') $$,
  'reject_chore with reason succeeds'
);
select is((select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'rejected', 'status rejected');
select is((select rejection_reason from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'photo unclear', 'reason recorded');

-- 4-5. Reject without reason (defaults to empty string).
select lives_ok(
  $$ select public.reject_chore('22222222-aaaa-2222-2222-222222222222') $$,
  'reject_chore without reason succeeds'
);
select is((select rejection_reason from public.chore_instances where id = '22222222-aaaa-2222-2222-222222222222'), '', 'empty reason recorded');

select * from finish();
rollback;
