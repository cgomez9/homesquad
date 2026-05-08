begin;
select plan(3);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(public.seed_starter_chores('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 5, 'first call inserts 5');
select is(public.seed_starter_chores('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'second call inserts 0 (idempotent)');
select is((select count(*)::int from public.chores where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 5, 'still 5 chores total');

select * from finish();
rollback;
