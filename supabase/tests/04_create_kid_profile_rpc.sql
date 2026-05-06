begin;
select plan(3);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Setup: create a family.
select public.create_family('Family', 'Alice', 1::smallint);

-- 1. Add first kid → succeeds.
select isnt_empty(
  $$ select public.create_kid_profile('Sara', 2::smallint, null) $$,
  'first kid added'
);

-- 2. Add second kid → succeeds.
select isnt_empty(
  $$ select public.create_kid_profile('Leo', 3::smallint, null) $$,
  'second kid added'
);

-- 3. Add third kid on free tier → rejected.
select throws_ok(
  $$ select public.create_kid_profile('Mia', 4::smallint, null) $$,
  'Free tier limit: 2 kids per family',
  'third kid on free tier rejected'
);

select * from finish();
rollback;
