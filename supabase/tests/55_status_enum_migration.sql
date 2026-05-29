-- supabase/tests/55_status_enum_migration.sql
begin;
select plan(6);

-- The CHECK constraint must accept the new status values
select is(
  (select pg_get_constraintdef(c.oid)
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
    where t.relname = 'chore_instances' and c.conname = 'chore_instances_status_check'),
  $$CHECK ((status = ANY (ARRAY['pending'::text, 'started'::text, 'finished'::text, 'approved'::text, 'rejected'::text])))$$,
  'CHECK constraint includes started + finished'
);

-- Columns exist
select has_column('public', 'chore_instances', 'started_at',  'started_at column exists');
select has_column('public', 'chore_instances', 'finished_at', 'finished_at column exists');

-- Old data preserved: a pre-migration 'submitted' row becomes 'finished'
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

-- Insert directly with the new 'finished' status to prove the constraint accepts it
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at, finished_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'finished', 'a2222222-2222-2222-2222-222222222222', now(), now());
select is(
  (select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'finished', 'new finished row accepted');

-- And the started status (use a distinct due_at to avoid the chore_id+due_at unique constraint)
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, started_at) values
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now() + interval '1 day', 'started', now());
select is(
  (select status from public.chore_instances where id = '11111111-bbbb-1111-1111-111111111111'),
  'started', 'new started row accepted');

-- And reject the old 'submitted' value
prepare bad_status as
  insert into public.chore_instances(chore_id, family_id, due_at, status) values
    ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'submitted');
select throws_ok('bad_status', null, null, 'submitted is no longer a valid status');

select * from finish();
rollback;
