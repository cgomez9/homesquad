begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('b9999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'Other', 2, null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select isnt(
  public.create_chore(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Make bed', null, 10,
    'a2222222-2222-2222-2222-222222222222', 'approval', '{"type":"daily"}'::jsonb
  ),
  null,
  'create_chore returns id on happy path'
);

select isnt(
  (select next_due_at from public.chores where title = 'Make bed' limit 1),
  null,
  'next_due_at is computed'
);

prepare cross_family as select public.create_chore(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Stolen', null, 10,
  null, 'auto', '{"type":"daily"}'::jsonb);
select throws_ok('cross_family', null, null, 'cannot create chore in another family');

prepare cross_assignee as select public.create_chore(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bad assignee', null, 10,
  'b9999999-9999-9999-9999-999999999999', 'auto', '{"type":"daily"}'::jsonb);
select throws_ok('cross_assignee', null, null, 'cannot assign chore to kid in another family');

select * from finish();
rollback;
