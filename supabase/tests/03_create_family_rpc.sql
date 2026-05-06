begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. create_family returns a uuid.
select isnt_empty(
  $$ select public.create_family('Smiths', 'Alice', 1::smallint) $$,
  'create_family returns a uuid'
);

-- 2. The family row was inserted with the given name.
reset role;
select results_eq(
  $$ select name from public.families where name = 'Smiths' $$,
  $$ values ('Smiths'::text) $$,
  'family row was inserted with given name'
);

-- 3. The parent profile was inserted, linked to the auth user, with given avatar.
select results_eq(
  $$ select display_name, type::text, avatar_id, user_id
       from public.profiles
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Alice'::text, 'parent'::text, 1::smallint,
             '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'parent profile inserted and linked to auth user'
);

-- 4. Calling create_family a second time for the same user errors.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.create_family('Another', 'Alice', 1::smallint) $$,
  'User already belongs to a family',
  'second create_family call for same user is rejected'
);

select * from finish();
rollback;
